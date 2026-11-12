import { MinecraftFolder, Version, launch, createMinecraftProcessWatcher, type ResolvedVersion } from '@xmcl/core'
import {
  getVersionList, installTask, installDependenciesTask, installFabric, installQuiltVersion, getForgeVersionList,
  installForgeTask, installNeoForgedTask, getLoaderArtifactListFor, getQuiltLoaderVersionsByMinecraft,
  installJavaRuntimeTask, type JavaRuntimeManifest, type MinecraftVersion
} from '@xmcl/installer'
import type { Task } from '@xmcl/task'
import type { ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Instance, InstalledVersion, LaunchState, Loader, McVersion } from '../shared/types'
import { ensureFresh } from './accounts'
import { getInstance, getInstances, getSettings, instanceDir, logsDir, gameRoot, updateInstance } from './store'
import { getJson } from './net'
import { errorText, neoForgeMatches, splitArgs } from '../shared/pure'
export { neoForgeMatches, splitArgs }

type Emit = (s: LaunchState) => void
type Log = (line: string) => void

/* ---------- metadata ---------- */

let manifest: { at: number; versions: MinecraftVersion[] } | undefined
async function versionManifest(): Promise<MinecraftVersion[]> {
  if (!manifest || Date.now() - manifest.at > 10 * 60_000) manifest = { at: Date.now(), versions: (await getVersionList()).versions }
  return manifest.versions
}

export async function listMinecraft(): Promise<McVersion[]> {
  return (await versionManifest()).map(({ id, type, releaseTime }) => ({ id, type: type as McVersion['type'], releaseTime }))
}


export async function listLoaderVersions(loader: Loader, mc: string): Promise<string[]> {
  switch (loader) {
    case 'vanilla':
      return []
    case 'fabric':
      return (await getLoaderArtifactListFor(mc)).map((a) => a.loader.version)
    case 'quilt':
      return (await getQuiltLoaderVersionsByMinecraft({ minecraftVersion: mc })).map((a) => a.loader.version)
    case 'forge':
      return (await getForgeVersionList({ minecraft: mc })).versions.map((v) => v.version)
    case 'neoforge': {
      const r = await getJson<{ versions: string[] }>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')
      return r.versions.filter((v) => neoForgeMatches(v, mc)).reverse()
    }
  }
}

export async function listInstalled(): Promise<InstalledVersion[]> {
  const dir = join(gameRoot(), 'versions')
  if (!existsSync(dir)) return []
  const out: InstalledVersion[] = []
  for (const id of await readdir(dir)) {
    const json = join(dir, id, `${id}.json`)
    if (!existsSync(json)) continue
    let size = (await stat(json)).size
    const jar = join(dir, id, `${id}.jar`)
    if (existsSync(jar)) size += (await stat(jar)).size
    out.push({ id, size, usedBy: getInstances().filter((i) => i.versionId === id || i.minecraft === id).map((i) => i.name) })
  }
  return out
}

export async function removeVersion(id: string): Promise<void> {
  if (!/^[\w.\-+ ]+$/.test(id)) throw new Error('Недопустимый идентификатор версии')
  await rm(join(gameRoot(), 'versions', id), { recursive: true, force: true })
  for (const i of getInstances()) if (i.versionId === id) updateInstance(i.id, { versionId: undefined })
}

/* ---------- tasks ---------- */

let current: Task<unknown> | undefined
type Extra = Pick<LaunchState, 'files' | 'filesDone'>
// shortcut: reads @xmcl/installer internals (DownloadMultipleTask fields) to list files; recheck on installer upgrades
type Multi = Task<unknown> & { options: { destination: string }[]; progresses: number[]; totals: number[] }
const isMulti = (t: Task<unknown>): t is Multi => Array.isArray((t as Multi).options) && Array.isArray((t as Multi).progresses)
const multiDone = (m: Multi) => m.totals.filter((t, i) => t > 0 && m.progresses[i] >= t).length

async function run<T>(task: Task<T>, onProgress: (done: number, total: number, extra: Extra) => void): Promise<T> {
  current = task as Task<unknown>
  const single = new Map<number, Task<unknown>>()
  const multi = new Set<Multi>()
  let filesDone = 0
  let last = 0
  const forget = (t: Task<unknown>, ok: boolean) => {
    if (multi.delete(t as Multi) && ok) filesDone += multiDone(t as Multi)
    else if (single.delete(t.id) && ok) filesDone++
  }
  task.start({
    onStart(t) {
      if (isMulti(t)) multi.add(t)
      else if (t.from) single.set(t.id, t)
    },
    onSucceed: (t) => forget(t, true),
    onFailed: (t) => forget(t, false),
    onCancelled: (t) => forget(t, false),
    onUpdate() {
      const now = Date.now()
      if (now - last < 120) return
      last = now
      const files = [
        ...[...single.values()].map((t) => ({ name: basename(t.to ?? t.from ?? t.name), done: t.progress, total: t.total })),
        ...[...multi].flatMap((m) => m.options.flatMap((o, i) => (m.totals[i] > 0 && m.progresses[i] < m.totals[i] ? [{ name: basename(o.destination), done: m.progresses[i], total: m.totals[i] }] : [])))
      ]
      onProgress(task.progress, task.total, { files: files.slice(0, 12), filesDone: filesDone + [...multi].reduce((n, m) => n + multiDone(m), 0) })
    }
  })
  try {
    return await task.wait()
  } finally {
    current = undefined
  }
}

/* ---------- java ---------- */

// @xmcl/installer's fetchJavaRuntimeManifest passes `throwOnError` to undici 7, which rejects it
async function javaRuntimeManifest(component: string): Promise<JavaRuntimeManifest> {
  type Entry = { manifest: { url: string }; version: { name: string; released: string } }
  const all = await getJson<Record<string, Record<string, Entry[]>>>('https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json')
  const platform = process.arch === 'arm64' ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  const target = all[platform]?.[component]?.[0]
  if (!target) throw new Error(`Mojang не публикует Java «${component}» для ${platform}`)
  const m = await getJson<{ files: JavaRuntimeManifest['files'] }>(target.manifest.url)
  return { files: m.files, target: component, version: target.version }
}

/** Mojang ships the exact runtime each version expects; use it unless the user set a path. */
async function ensureJava(version: ResolvedVersion, inst: Instance, emit: Emit): Promise<string> {
  const custom = inst.javaPath || getSettings().javaPath
  if (custom) {
    if (!existsSync(custom)) throw new Error(`Java не найдена: ${custom}`)
    return custom
  }
  const component = version.javaVersion?.component ?? 'jre-legacy'
  const dest = join(gameRoot(), 'runtime', component)
  const exe = join(dest, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java')
  if (existsSync(exe)) return exe
  emit({ phase: 'downloading', detail: `Java ${version.javaVersion?.majorVersion ?? 8}` })
  const javaManifest = await javaRuntimeManifest(component)
  await run(installJavaRuntimeTask({ destination: dest, manifest: javaManifest }), (d, t, x) =>
    emit({ phase: 'downloading', detail: `Java ${version.javaVersion?.majorVersion ?? 8}`, progress: t ? d / t : undefined, doneBytes: d, totalBytes: t, ...x })
  )
  return exe
}

/* ---------- install ---------- */

/** Installs (or re-checks) vanilla + loader for an instance and returns the resolved version. */
export async function prepare(inst: Instance, emit: Emit): Promise<{ version: ResolvedVersion; java: string }> {
  const root = MinecraftFolder.from(gameRoot())
  const progress = (detail: string) => (d: number, t: number, x: Extra) =>
    emit({ phase: 'downloading', detail, progress: t ? d / t : undefined, doneBytes: d, totalBytes: t, ...x })

  if (!existsSync(root.getVersionJson(inst.minecraft))) {
    const meta = (await versionManifest()).find((v) => v.id === inst.minecraft)
    if (!meta) throw new Error(`Версия ${inst.minecraft} не найдена в каталоге Mojang`)
    await run(installTask(meta, root), progress(`Minecraft ${inst.minecraft}`))
  }
  const base = await Version.parse(root, inst.minecraft)
  const java = await ensureJava(base, inst, emit)

  let versionId = inst.versionId && existsSync(root.getVersionJson(inst.versionId)) ? inst.versionId : undefined
  if (!versionId) {
    const lv = inst.loaderVersion
    if (inst.loader !== 'vanilla' && !lv) throw new Error('Не выбрана версия загрузчика')
    emit({ phase: 'downloading', detail: inst.loader })
    switch (inst.loader) {
      case 'vanilla':
        versionId = inst.minecraft
        break
      case 'fabric':
        versionId = await installFabric({ minecraftVersion: inst.minecraft, version: lv!, minecraft: root })
        break
      case 'quilt':
        versionId = await installQuiltVersion({ minecraftVersion: inst.minecraft, version: lv!, minecraft: root })
        break
      case 'forge': {
        const fv = (await getForgeVersionList({ minecraft: inst.minecraft })).versions.find((v) => v.version === lv)
        if (!fv) throw new Error(`Forge ${lv} не найден`)
        versionId = await run(installForgeTask(fv, root, { java }), progress('Forge'))
        break
      }
      case 'neoforge':
        versionId = await run(installNeoForgedTask('neoforge', lv!, root, { java }), progress('NeoForge'))
        break
    }
    updateInstance(inst.id, { versionId })
  }

  emit({ phase: 'verifying', detail: 'Библиотеки и ресурсы' })
  const version = await Version.parse(root, versionId!)
  // installDependencies re-validates libraries and assets by sha1 and re-downloads anything broken
  await run(installDependenciesTask(version), (d, t, x) =>
    emit({ phase: 'verifying', detail: 'Библиотеки и ресурсы', progress: t ? d / t : undefined, doneBytes: d, totalBytes: t, ...x })
  )
  return { version, java }
}

/* ---------- launch ---------- */

let proc: ChildProcess | undefined
let logFile: WriteStream | undefined
export const isRunning = () => !!proc


export async function start(id: string, emit: Emit, log: Log, hooks: { started(): void; exited(): void }): Promise<void> {
  if (proc) throw new Error('Minecraft уже запущен')
  const inst = getInstance(id)
  const s = getSettings()
  const base = { instanceId: id }
  const e: Emit = (st) => emit({ ...base, ...st })
  try {
    e({ phase: 'preparing', detail: 'Проверка аккаунта' })
    const account = await ensureFresh(s.selectedAccount)
    const { version, java } = await prepare(inst, e)

    e({ phase: 'launching' })
    const memory = inst.memory || s.memory
    logFile = createWriteStream(join(logsDir(), 'latest-game.log'))
    proc = await launch({
      gamePath: instanceDir(inst.id),
      resourcePath: gameRoot(),
      javaPath: java,
      version,
      gameProfile: { id: account.id, name: account.name },
      accessToken: account.token,
      userType: (account.offline ? 'legacy' : 'msa') as 'mojang',
      properties: {},
      launcherName: 'AppleLauncher',
      launcherBrand: 'AppleLauncher',
      maxMemory: memory,
      minMemory: Math.min(1024, memory),
      resolution: { width: s.width, height: s.height, fullscreen: s.fullscreen },
      extraJVMArgs: splitArgs(inst.jvmArgs || s.jvmArgs),
      extraExecOption: { detached: false }
    })
    updateInstance(inst.id, { lastPlayed: Date.now() })
    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      logFile?.write(text)
      for (const line of text.split(/\r?\n/)) if (line) log(line)
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    const watcher = createMinecraftProcessWatcher(proc)
    watcher.on('minecraft-window-ready', () => e({ phase: 'running' }))
    watcher.on('error', (err) => {
      proc = undefined
      e({ phase: 'error', error: String(err?.message ?? err) })
      hooks.exited()
    })
    watcher.on('minecraft-exit', ({ code, crashReport }: { code: number; crashReport?: string }) => {
      proc = undefined
      logFile?.end()
      if (code !== 0) e({ phase: 'error', error: crashReport ? `Игра завершилась с ошибкой (код ${code}). Подробности в журнале.` : `Игра завершилась с кодом ${code}` })
      else e({ phase: 'idle' })
      hooks.exited()
    })
    e({ phase: 'running', detail: 'Загрузка игры' })
    hooks.started()
  } catch (err) {
    proc = undefined
    const message = errorText(err)
    log(`[AppleLauncher] ${message}`)
    e({ phase: 'error', error: message })
  }
}

export async function cancel(): Promise<void> {
  await current?.cancel()
  proc?.kill()
}

/** Re-checks every library, asset and the version json/jar for an instance. */
export async function verify(id: string, emit: Emit): Promise<void> {
  const inst = getInstance(id)
  await prepare(inst, (st) => emit({ ...st, instanceId: id }))
  emit({ phase: 'idle', instanceId: id, detail: 'Файлы проверены' })
}
