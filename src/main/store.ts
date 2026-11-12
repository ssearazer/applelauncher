import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { Instance, Settings } from '../shared/types'

const dataDir = () => app.getPath('userData')

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(dataDir(), name), 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  mkdirSync(dataDir(), { recursive: true })
  const file = join(dataDir(), name)
  // write-then-rename so a crash never leaves a half-written config
  writeFileSync(file + '.tmp', JSON.stringify(value, null, 2))
  renameSync(file + '.tmp', file)
}

export function readStore<T>(name: string, fallback: T): T {
  return readJson(name, fallback)
}

const defaults = (): Settings => ({
  theme: 'dark',
  animations: true,
  scale: 1,
  memory: 4096,
  javaPath: '',
  jvmArgs: '',
  width: 1280,
  height: 720,
  fullscreen: false,
  gameDir: join(app.getPath('appData'), '.applelauncher'),
  autostart: false,
  closeOnLaunch: false,
  checkUpdates: true,
  downloadsDir: app.getPath('downloads'),
  language: 'ru',
  msClientId: ''
})

let settings: Settings | undefined
export function getSettings(): Settings {
  settings ??= { ...defaults(), ...readJson<Partial<Settings>>('settings.json', {}) }
  return settings
}
export function setSettings(patch: Partial<Settings>): Settings {
  settings = { ...getSettings(), ...patch }
  writeJson('settings.json', settings)
  return settings
}

let instances: Instance[] | undefined
export function getInstances(): Instance[] {
  instances ??= readJson<Instance[]>('instances.json', [])
  return instances
}
export function saveInstances(list: Instance[]): void {
  instances = list
  writeJson('instances.json', list)
}
export function getInstance(id: string): Instance {
  const inst = getInstances().find((i) => i.id === id)
  if (!inst) throw new Error('Сборка не найдена')
  return inst
}
export function updateInstance(id: string, patch: Partial<Instance>): Instance {
  const next = { ...getInstance(id), ...patch, id }
  saveInstances(getInstances().map((i) => (i.id === id ? next : i)))
  return next
}

export const gameRoot = () => getSettings().gameDir
export function instanceDir(id: string): string {
  const dir = join(gameRoot(), 'instances', id)
  mkdirSync(dir, { recursive: true })
  return dir
}
export const logsDir = () => {
  const d = join(dataDir(), 'logs')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** Resolve `rel` inside `base` and refuse anything that escapes it (zip-slip, "..", absolute paths). */
export { safeJoin } from './safe-path'
