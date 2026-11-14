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
  /** the player's own OpenRouter key for the AI assistant; empty means the built-in one */
  aiKey: string
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
  /** local nickname for offline play; no Microsoft account required */
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

export type ModSource = 'modrinth' | 'curseforge'

export interface ModFile {
  file: string
  enabled: boolean
  size: number
  title: string
  description?: string
  version?: string
  iconUrl?: string
  projectId?: string
  /** where the mod came from; needed to look up other versions */
  source?: ModSource
  versionId?: string
}

/** One downloadable version (Modrinth version or CurseForge file) of a mod. */
export interface ModVersion {
  id: string
  name: string
  version: string
  channel: 'release' | 'beta' | 'alpha'
  date: string
  game: string[]
  loaders: string[]
  /** matches the profile's Minecraft version and loader */
  compatible: boolean
  downloads?: number
}

export interface CurseForgeStatus {
  hasKey: boolean
  source: 'stored' | 'env' | 'none'
}

export type UpdateInfo =
  | { status: 'dev' }
  | { status: 'latest' }
  | { status: 'available'; version: string; /** feed = electron-updater, github = release assets found through the GitHub API */ via: 'feed' | 'github' }

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
  source?: ModSource
}

export interface JobState { id: string; title: string; progress?: number; done?: boolean; error?: string }

/* ---------- AI assistant ---------- */

export type AiStepKind = 'thought' | 'target' | 'search' | 'verify'
export interface AiStep { id: number; kind: AiStepKind; text: string }

export interface AiPlanMod { projectId: string; title: string; description: string; iconUrl?: string; reason: string }
export interface AiPlan {
  id: string
  name: string
  summary: string
  minecraft: string
  loader: Loader
  loaderVersion?: string
  mods: AiPlanMod[]
  /** libraries the chosen mods require; they are installed together with the mods */
  libraries: { projectId: string; title: string }[]
  /** ids the model proposed that Modrinth does not have or that have no build for this game version */
  dropped: number
  /** set when the mods are added to an existing profile instead of a new one */
  instanceId?: string
  /** proposed mods that the profile already has: they are left out of the plan */
  already?: number
}
export interface AiBuildResult {
  instance: Instance
  /** every jar written to the mods folder, libraries included */
  files: number
  mods: number
  /** library jars pulled in as dependencies of the mods */
  libs: number
  skipped: string[]
  /** the game, the loader, Java and the game's own libraries were downloaded during the build */
  gameReady: boolean
  /** the mods went into an existing profile: nothing was created and nothing existing was touched */
  extended?: boolean
}

export interface AiFixResult {
  /** what went wrong, in the player's language */
  diagnosis: string
  /** mods switched off (renamed to .jar.disabled): they can be switched back on in the Mods tab */
  disabled: { file: string; title: string; reason: string }[]
  /** mods and libraries installed to replace or complete the broken ones */
  added: { title: string; reason: string }[]
  skipped: string[]
}
