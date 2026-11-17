import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { isNewer } from '../shared/pure'
import type { UpdateInfo } from '../shared/types'
import { HttpError, download, getJson } from './net'

const { autoUpdater } = electronUpdater
const REPO = 'ssearazer/applelauncher'

// electron-updater emits 'error' besides rejecting; without a listener Node treats that emit as an uncaught exception
autoUpdater.on('error', () => undefined)

interface GhAsset { name: string; browser_download_url: string; size: number; digest?: string }
interface GhRelease { tag_name: string; html_url: string; assets: GhAsset[] }

/** Set when the release has no latest.yml and the new version was found through the GitHub API instead. */
let fallback: { version: string; asset: GhAsset } | undefined

/** electron-updater reads latest.yml from the release. A release published without it ends in a 404. */
const feedMissing = (e: unknown) => /latest\.yml|\b404\b|No published versions/i.test(e instanceof Error ? e.message : String(e))

/** First line of an error, without the dump of HTTP headers electron-updater appends. */
const brief = (e: unknown) => (e instanceof Error ? e.message : String(e)).split(/\s+Headers:|\n/)[0].slice(0, 200)

async function checkGithub(): Promise<UpdateInfo> {
  let rel: GhRelease
  try {
    rel = await getJson<GhRelease>(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { status: 'latest' } // nothing published yet
    throw e
  }
  const version = rel.tag_name.replace(/^v/i, '')
  if (!isNewer(version, app.getVersion())) return { status: 'latest' }
  const asset = rel.assets.find((a) => /^AppleLauncher-Setup-.+\.exe$/i.test(a.name))
  if (!asset || !asset.browser_download_url.startsWith(`https://github.com/${REPO}/releases/download/`)) {
    throw new Error(`В релизе ${rel.tag_name} нет установщика AppleLauncher-Setup-${version}.exe`)
  }
  fallback = { version, asset }
  return { status: 'available', version, via: 'github' }
}

export async function check(): Promise<UpdateInfo> {
  if (!app.isPackaged) return { status: 'dev' }
  fallback = undefined
  try {
    const r = await autoUpdater.checkForUpdates()
    const version = r?.updateInfo.version
    return version && isNewer(version, app.getVersion()) ? { status: 'available', version, via: 'feed' } : { status: 'latest' }
  } catch (e) {
    if (!feedMissing(e)) throw new Error(`Не удалось проверить обновления: ${brief(e)}`)
  }
  // The release exists but was published without latest.yml: look at its files through the GitHub API instead
  try {
    return await checkGithub()
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith('В релизе') ? e.message : `Не удалось проверить обновления: ${brief(e)}`)
  }
}

/** Downloads the installer of the release found by check() (only when latest.yml was missing) and starts it. */
export async function installFromGithub(onProgress: (p: number, detail?: string) => void): Promise<void> {
  if (!fallback) throw new Error('Сначала проверьте обновления')
  const { asset, version } = fallback
  const dir = join(app.getPath('temp'), 'applelauncher-update')
  await mkdir(dir, { recursive: true })
  const dest = join(dir, basename(asset.name))
  const sha256 = asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : undefined
  let got = 0
  onProgress(0, `Загрузка версии ${version}`)
  await download(asset.browser_download_url, dest, sha256 ? { sha256 } : {}, (n) => {
    got += n
    onProgress(Math.min(0.99, got / Math.max(asset.size, 1)), `Загрузка версии ${version}`)
  })
  spawn(dest, [], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}

/** Silent check at startup; calls back only when there is something new. */
export function checkOnStartup(notify: (info: UpdateInfo) => void): void {
  check().then((info) => info.status === 'available' && notify(info), () => undefined)
}
