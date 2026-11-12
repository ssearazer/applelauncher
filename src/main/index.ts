import { errorText } from '../shared/pure'
import { app, BrowserWindow, dialog, nativeTheme, session, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADERS, type JobState, type LaunchState, type Settings } from '../shared/types'
import * as accounts from './accounts'
import * as instances from './instances'
import * as mc from './minecraft'
import * as mods from './mods'
import { handle, setAllowedOrigin, z } from './ipc'
import { gameRoot, getInstance, getInstances, getSettings, instanceDir, logsDir, setSettings, updateInstance } from './store'

const { autoUpdater } = electronUpdater
const here = fileURLToPath(new URL('.', import.meta.url))

if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | undefined
const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload)

const palette = () =>
  nativeTheme.shouldUseDarkColors ? { bg: '#080808', fg: '#ffffff' } : { bg: '#ffffff', fg: '#111111' }

function applyTheme() {
  nativeTheme.themeSource = getSettings().theme
  const p = palette()
  win?.setBackgroundColor(p.bg)
  win?.setTitleBarOverlay?.({ color: '#00000000', symbolColor: p.fg, height: 44 })
}

function createWindow() {
  nativeTheme.themeSource = getSettings().theme
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'AppleLauncher',
    icon: app.isPackaged ? undefined : join(here, '../../build/icon.png'),
    backgroundColor: palette().bg,
    titleBarStyle: 'hidden',
    // native Windows caption buttons keep Snap Layouts and familiar hit targets
    titleBarOverlay: { color: '#00000000', symbolColor: palette().fg, height: 44 },
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.on('did-finish-load', () => win?.webContents.setZoomFactor(getSettings().scale))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    setAllowedOrigin(devUrl)
    void win.loadURL(devUrl)
  } else {
    setAllowedOrigin('file://')
    void win.loadFile(join(here, '../renderer/index.html'))
  }
}

/* ---------- state pushed to the renderer ---------- */

let launchState: LaunchState = { phase: 'idle' }
const emitLaunch = (s: LaunchState) => {
  launchState = s
  send('launch:state', s)
}
const logLines: string[] = []
const pushLog = (line: string) => {
  logLines.push(line)
  if (logLines.length > 5000) logLines.splice(0, logLines.length - 5000)
  send('log', line)
}
const job = (j: JobState) => send('job', j)

async function withJob<T>(id: string, title: string, fn: (progress: (p: number, detail?: string) => void) => Promise<T>): Promise<T> {
  job({ id, title, progress: 0 })
  try {
    const r = await fn((p, detail) => job({ id, title: detail ?? title, progress: p }))
    job({ id, title, done: true })
    return r
  } catch (e) {
    job({ id, title, done: true, error: errorText(e) })
    throw e
  }
}

/* ---------- IPC ---------- */

const id = z.string().uuid()
const settingsPatch = z
  .object({
    theme: z.enum(['dark', 'light', 'system']),
    animations: z.boolean(),
    scale: z.number().min(0.8).max(1.5),
    memory: z.number().int().min(512).max(65536),
    javaPath: z.string().max(1024).refine((p) => !p || (isAbsolute(p) && /java(w)?(\.exe)?$/i.test(p)), 'Укажите путь к java.exe или javaw.exe'),
    jvmArgs: z.string().max(4096),
    width: z.number().int().min(320).max(7680),
    height: z.number().int().min(240).max(4320),
    fullscreen: z.boolean(),
    gameDir: z.string().max(1024).refine(isAbsolute, 'Нужен абсолютный путь'),
    autostart: z.boolean(),
    closeOnLaunch: z.boolean(),
    checkUpdates: z.boolean(),
    downloadsDir: z.string().max(1024).refine(isAbsolute, 'Нужен абсолютный путь'),
    language: z.enum(['ru', 'en']),
    msClientId: z.string().max(64).regex(/^[0-9a-fA-F-]*$/, 'Client ID — это GUID из Azure'),
    selectedInstance: z.string().uuid(),
    selectedAccount: z.string().regex(/^[0-9a-f]{32}$/)
  })
  .partial()
  .strict()
const instancePatch = z
  .object({
    name: z.string().trim().min(1).max(64),
    memory: z.number().int().min(0).max(65536),
    javaPath: z.string().max(1024).refine((p) => !p || isAbsolute(p), 'Нужен абсолютный путь'),
    jvmArgs: z.string().max(4096)
  })
  .partial()
  .strict()
const newInstance = z.object({
  name: z.string().trim().min(1).max(64),
  minecraft: z.string().regex(/^[\w.\- ]{1,64}$/),
  loader: z.enum(LOADERS as [string, ...string[]]).transform((l) => l as (typeof LOADERS)[number]),
  loaderVersion: z.string().regex(/^[\w.+\-]{1,64}$/).optional()
})
const mcVersion = z.string().regex(/^[\w.\- ]{1,64}$/)
const fileName = z.string().min(1).max(255)
const projectId = z.string().regex(/^[\w-]{1,64}$/)

function registerIpc() {
  handle('settings:get', [], () => getSettings())
  handle('settings:set', [settingsPatch], (patch) => {
    const s = setSettings(patch as Partial<Settings>)
    if ('theme' in patch) applyTheme()
    if ('scale' in patch) win?.webContents.setZoomFactor(s.scale)
    if ('autostart' in patch && app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.autostart })
    return s
  })

  handle('instances:list', [], () => getInstances())
  handle('instances:create', [newInstance], (input) => instances.createInstance(input))
  handle('instances:update', [id, instancePatch], (i, patch) => updateInstance(i, patch))
  handle('instances:remove', [id, z.boolean()], (i, files) => instances.removeInstance(i, files))
  handle('instances:open', [id], (i) => shell.openPath(instanceDir(getInstance(i).id)))
  handle('instances:size', [id], (i) => instances.instanceSize(getInstance(i).id))
  handle('instances:import', [z.enum(['archive', 'prism', 'tlauncher'])], async (kind) => {
    const appData = app.getPath('appData')
    const r = await dialog.showOpenDialog(win!, kind === 'archive'
      ? { filters: [{ name: 'Modrinth, Prism Launcher', extensions: ['mrpack', 'zip'] }], properties: ['openFile'] }
      : { defaultPath: join(appData, kind === 'prism' ? 'PrismLauncher/instances' : '.minecraft/versions'), properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return undefined
    const src = r.filePaths[0]
    return withJob('import', 'Импорт сборки', (p) => kind === 'archive' ? instances.importArchive(src, p) : instances.importFolder(src, p))
  })
  handle('instances:installPack', [projectId], (pid) => withJob(`pack:${pid}`, 'Установка сборки', (p) => instances.installModpack(pid, p)))
  handle('instances:export', [id], async (i) => {
    const inst = getInstance(i)
    const r = await dialog.showSaveDialog(win!, { defaultPath: `${inst.name.replace(/[\\/:*?"<>|]/g, '_')}.mrpack`, filters: [{ name: 'Modrinth', extensions: ['mrpack'] }] })
    if (r.canceled || !r.filePath) return false
    await instances.exportMrpack(i, r.filePath)
    shell.showItemInFolder(r.filePath)
    return true
  })

  handle('versions:minecraft', [], () => mc.listMinecraft())
  handle('versions:loaders', [z.enum(LOADERS as [string, ...string[]]), mcVersion], (l, v) => mc.listLoaderVersions(l as (typeof LOADERS)[number], v))
  handle('versions:installed', [], () => mc.listInstalled())
  handle('versions:remove', [mcVersion], (v) => mc.removeVersion(v))

  handle('launch:start', [id], (i) => {
    // runs in the background; progress arrives through launch:state
    void mc.start(i, emitLaunch, pushLog, {
      started: () => getSettings().closeOnLaunch && win?.hide(),
      exited: () => {
        if (!win?.isVisible()) win?.show()
      }
    })
  })
  handle('launch:cancel', [], () => mc.cancel())
  handle('launch:verify', [id], (i) =>
    mc.verify(i, emitLaunch).catch((e: unknown) => {
      pushLog(`[AppleLauncher] ${errorText(e)}`)
      emitLaunch({ phase: 'error', instanceId: i, error: errorText(e) })
      throw e
    })
  )
  handle('launch:state', [], () => launchState)
  handle('launch:logs', [], () => logLines)

  handle('accounts:list', [], () => accounts.listAccounts())
  handle('accounts:login', [], () => accounts.login())
  handle('accounts:logout', [z.string()], (a) => accounts.logout(a))
  handle('accounts:skin', [z.string()], (a) => accounts.skinDataUrl(a))
  handle('accounts:uploadSkin', [z.string(), z.enum(['classic', 'slim'])], async (a, variant) => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'PNG', extensions: ['png'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return false
    await accounts.uploadSkin(a, r.filePaths[0], variant)
    return true
  })
  handle('accounts:resetSkin', [z.string()], (a) => accounts.resetSkin(a))

  handle('mods:list', [id], (i) => mods.listMods(i))
  handle('mods:toggle', [id, fileName], (i, f) => mods.toggleMod(i, f))
  handle('mods:remove', [id, fileName], (i, f) => mods.removeMod(i, f))
  handle('mods:search', [z.string().max(200), id.optional(), z.enum(['mod', 'modpack']), z.number().int().min(0).max(10000), z.boolean()], (q, i, t, o, c) => mods.search(q, i, t, o, c))
  handle('mods:install', [id, projectId], (i, p) => withJob(`mod:${p}`, 'Установка мода', () => mods.installMod(i, p)))

  handle('app:info', [], () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, gameDir: gameRoot(), packaged: app.isPackaged }))
  handle('app:pickDir', [], async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? undefined : r.filePaths[0]
  })
  handle('app:pickJava', [], async () => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'Java', extensions: ['exe'] }], properties: ['openFile'] })
    return r.canceled ? undefined : r.filePaths[0]
  })
  handle('app:openLogs', [], () => shell.openPath(logsDir()))
  handle('app:openGameDir', [], () => shell.openPath(gameRoot()))
  handle('app:openExternal', [z.string().url()], (url) => {
    const host = new URL(url).hostname
    if (!['www.minecraft.net', 'modrinth.com', 'portal.azure.com', 'aka.ms', 'learn.microsoft.com'].includes(host)) throw new Error('Ссылка не разрешена')
    return shell.openExternal(url)
  })
  handle('app:clearCache', [], async () => {
    await session.defaultSession.clearCache()
    // natives are re-extracted on every launch, safe to drop
    const versions = join(gameRoot(), 'versions')
    if (existsSync(versions)) for (const v of await readdir(versions)) await rm(join(versions, v, `${v}-natives`), { recursive: true, force: true })
  })
  handle('app:checkUpdates', [], async () => {
    if (!app.isPackaged) return { status: 'dev' as const }
    const r = await autoUpdater.checkForUpdates()
    const latest = r?.updateInfo.version
    return latest && latest !== app.getVersion() ? { status: 'available' as const, version: latest } : { status: 'latest' as const }
  })
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false))
  registerIpc()
  createWindow()
  nativeTheme.on('updated', applyTheme)
  if (app.isPackaged && getSettings().checkUpdates) autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
})
app.on('second-instance', () => {
  if (win?.isMinimized()) win.restore()
  win?.show()
  win?.focus()
})
app.on('window-all-closed', () => app.quit())
