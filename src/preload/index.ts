import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Account, InstalledVersion, Instance, JobState, LaunchState, Loader, McVersion, ModFile, ModrinthHit, Settings
} from '../shared/types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!r.ok) throw new Error(r.error)
  return r.value
}
function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api = {
  settings: {
    get: () => call<Settings>('settings:get'),
    set: (patch: Partial<Settings>) => call<Settings>('settings:set', patch)
  },
  instances: {
    list: () => call<Instance[]>('instances:list'),
    create: (i: { name: string; minecraft: string; loader: Loader; loaderVersion?: string }) => call<Instance>('instances:create', i),
    update: (id: string, patch: Partial<Pick<Instance, 'name' | 'memory' | 'javaPath' | 'jvmArgs'>>) => call<Instance>('instances:update', id, patch),
    remove: (id: string, deleteFiles: boolean) => call<void>('instances:remove', id, deleteFiles),
    open: (id: string) => call<string>('instances:open', id),
    size: (id: string) => call<number>('instances:size', id),
    importPack: (kind: 'archive' | 'prism' | 'tlauncher') => call<Instance | undefined>('instances:import', kind),
    installPack: (projectId: string) => call<Instance>('instances:installPack', projectId),
    exportPack: (id: string) => call<boolean>('instances:export', id)
  },
  versions: {
    minecraft: () => call<McVersion[]>('versions:minecraft'),
    loaders: (loader: Loader, mc: string) => call<string[]>('versions:loaders', loader, mc),
    installed: () => call<InstalledVersion[]>('versions:installed'),
    remove: (id: string) => call<void>('versions:remove', id)
  },
  launch: {
    start: (id: string) => call<void>('launch:start', id),
    cancel: () => call<void>('launch:cancel'),
    verify: (id: string) => call<void>('launch:verify', id),
    state: () => call<LaunchState>('launch:state'),
    logs: () => call<string[]>('launch:logs'),
    onState: (cb: (s: LaunchState) => void) => on('launch:state', cb),
    onLog: (cb: (line: string) => void) => on('log', cb)
  },
  accounts: {
    list: () => call<Account[]>('accounts:list'),
    login: () => call<Account>('accounts:login'),
    logout: (id: string) => call<void>('accounts:logout', id),
    skin: (id: string) => call<string | undefined>('accounts:skin', id),
    uploadSkin: (id: string, variant: 'classic' | 'slim') => call<boolean>('accounts:uploadSkin', id, variant),
    resetSkin: (id: string) => call<void>('accounts:resetSkin', id)
  },
  mods: {
    list: (id: string) => call<ModFile[]>('mods:list', id),
    toggle: (id: string, file: string) => call<void>('mods:toggle', id, file),
    remove: (id: string, file: string) => call<void>('mods:remove', id, file),
    search: (q: string, id: string | undefined, type: 'mod' | 'modpack', offset = 0, compatibleOnly = true) =>
      call<{ hits: ModrinthHit[]; total: number }>('mods:search', q, id, type, offset, compatibleOnly),
    install: (id: string, projectId: string) => call<string[]>('mods:install', id, projectId)
  },
  app: {
    info: () => call<{ version: string; electron: string; chrome: string; node: string; gameDir: string; packaged: boolean }>('app:info'),
    pickDir: () => call<string | undefined>('app:pickDir'),
    pickJava: () => call<string | undefined>('app:pickJava'),
    openLogs: () => call<string>('app:openLogs'),
    openGameDir: () => call<string>('app:openGameDir'),
    openExternal: (url: string) => call<void>('app:openExternal', url),
    clearCache: () => call<void>('app:clearCache'),
    checkUpdates: () => call<{ status: 'dev' | 'latest' | 'available'; version?: string }>('app:checkUpdates'),
    onJob: (cb: (j: JobState) => void) => on('job', cb)
  }
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
