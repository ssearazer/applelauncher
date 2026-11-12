export type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'
export const LOADERS: Loader[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']

export interface Instance {
  id: string
  name: string
  minecraft: string
  loader: Loader
  loaderVersion?: string
  /** id of the installed version json, set after the first successful install */
  versionId?: string
  created: number
  lastPlayed?: number
  /** per-instance overrides; empty means "use global setting" */
  memory?: number
  javaPath?: string
  jvmArgs?: string
}

export type Theme = 'dark' | 'light' | 'system'
export type Language = 'ru' | 'en'

export interface Settings {
  theme: Theme
  animations: boolean
  scale: number
  memory: number
  javaPath: string
  jvmArgs: string
  width: number
  height: number
  fullscreen: boolean
  gameDir: string
  autostart: boolean
  closeOnLaunch: boolean
  checkUpdates: boolean
  downloadsDir: string
  language: Language
  msClientId: string
  selectedInstance?: string
  selectedAccount?: string
}

export interface Account {
  id: string
  name: string
  skinUrl?: string
  skinVariant: 'classic' | 'slim'
  /** false when the stored refresh token no longer works */
  valid: boolean
  /** local nickname for offline play; only allowed while a licensed account exists */
  offline?: boolean
}

export type LaunchPhase = 'idle' | 'preparing' | 'downloading' | 'verifying' | 'launching' | 'running' | 'error'
export interface LaunchState {
  phase: LaunchPhase
  instanceId?: string
  /** 0..1 when known */
  progress?: number
  doneBytes?: number
  totalBytes?: number
  detail?: string
  error?: string
  /** files downloading right now, and how many finished in this step */
  files?: { name: string; done: number; total: number }[]
  filesDone?: number
}

export interface McVersion { id: string; type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'; releaseTime: string }
export interface InstalledVersion { id: string; size: number; usedBy: string[] }

export interface ModFile {
  file: string
  enabled: boolean
  size: number
  title: string
  description?: string
  version?: string
  iconUrl?: string
  projectId?: string
}

export interface ModrinthHit {
  project_id: string
  slug: string
  title: string
  description: string
  icon_url?: string | null
  downloads: number
  categories: string[]
  versions: string[]
  author: string
  compatible: boolean
}

export interface JobState { id: string; title: string; progress?: number; done?: boolean; error?: string }
