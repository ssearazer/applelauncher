import { safeStorage } from 'electron'
import type { CurseForgeStatus, Instance, ModrinthHit, ModVersion } from '../shared/types'
import { HttpError, getJson, type Hashes } from './net'
import { readStore, writeJson } from './store'

/** CurseForge's public API (https://docs.curseforge.com). It needs a free key from console.curseforge.com. */
const API = 'https://api.curseforge.com/v1'
const MINECRAFT = 432
const CLASS_MODS = 6

/* ---------- API key: encrypted with the OS (DPAPI on Windows), never sent to the renderer ---------- */

interface Stored { key?: string }
const readKey = (): string | undefined => {
  const k = readStore<Stored>('curseforge.json', {}).key
  if (!k) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(k, 'base64'))
  } catch {
    return undefined // stored under another Windows user or corrupted: treat as no key
  }
}
const envKey = () => process.env.CURSEFORGE_API_KEY?.trim() || undefined

export function status(): CurseForgeStatus {
  const source = readKey() ? 'stored' : envKey() ? 'env' : 'none'
  return { hasKey: source !== 'none', source }
}
export function setKey(key: string): CurseForgeStatus {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Шифрование ОС недоступно — ключ не может быть сохранён безопасно')
  writeJson('curseforge.json', { key: safeStorage.encryptString(key.trim()).toString('base64') } satisfies Stored)
  return status()
}
export function clearKey(): CurseForgeStatus {
  writeJson('curseforge.json', {})
  return status()
}

async function api<T>(path: string): Promise<T> {
  const key = readKey() ?? envKey()
  if (!key) throw new Error('Для CurseForge нужен API-ключ: Настройки → Дополнительно → CurseForge (или вкладка «CurseForge» в каталоге модов)')
  try {
    return await getJson<T>(`${API}${path}`, { headers: { 'x-api-key': key, Accept: 'application/json' } })
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) throw new Error('CurseForge отклонил API-ключ. Проверьте ключ на console.curseforge.com')
    throw e
  }
}

/* ---------- shapes we use ---------- */

interface CfMod {
  id: number
  name: string
  slug: string
  summary: string
  downloadCount: number
  logo?: { thumbnailUrl?: string; url?: string } | null
  authors?: { name: string }[]
  categories?: { name: string }[]
  latestFilesIndexes?: { gameVersion: string; modLoader?: number | null }[]
  links?: { websiteUrl?: string }
}
interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  releaseType: 1 | 2 | 3
  fileDate: string
  downloadUrl: string | null
  isAvailable?: boolean
  hashes: { value: string; algo: number }[]
  gameVersions: string[]
  dependencies: { modId: number; relationType: number }[]
  downloadCount?: number
}

/** ModLoaderType ids: 1 Forge, 4 Fabric, 5 Quilt, 6 NeoForge. */
const LOADER_ID: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const LOADER_TAG: Record<string, string> = { forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge' }
/** Quilt loads Fabric mods too, and CurseForge has far more of those. */
const loaderTags = (inst: Pick<Instance, 'loader'>) => (inst.loader === 'quilt' ? ['Quilt', 'Fabric'] : [LOADER_TAG[inst.loader]])

const fileMatches = (f: CfFile, inst: Pick<Instance, 'loader' | 'minecraft'>) =>
  f.gameVersions.includes(inst.minecraft) && loaderTags(inst).some((t) => f.gameVersions.includes(t))

const channel = (t: number): ModVersion['channel'] => (t === 1 ? 'release' : t === 2 ? 'beta' : 'alpha')

/* ---------- search ---------- */

export async function search(query: string, inst: Instance | undefined, offset: number, compatibleOnly: boolean): Promise<{ hits: ModrinthHit[]; total: number }> {
  const q = new URLSearchParams({ gameId: String(MINECRAFT), classId: String(CLASS_MODS), pageSize: '24', index: String(offset), sortField: query ? '1' : '2', sortOrder: 'desc' })
  if (query) q.set('searchFilter', query)
  const filtered = !!inst && compatibleOnly && inst.loader !== 'vanilla'
  if (inst && filtered) {
    q.set('gameVersion', inst.minecraft)
    // the search takes one loader; Quilt profiles look for Fabric mods
    q.set('modLoaderType', String(inst.loader === 'quilt' ? 4 : LOADER_ID[inst.loader]))
  }
  const r = await api<{ data: CfMod[]; pagination: { totalCount: number } }>(`/mods/search?${q}`)
  return {
    total: r.pagination.totalCount,
    hits: r.data.map((m) => {
      const idx = m.latestFilesIndexes ?? []
      return {
        project_id: String(m.id),
        slug: m.slug,
        title: m.name,
        description: m.summary,
        icon_url: m.logo?.thumbnailUrl ?? m.logo?.url ?? null,
        downloads: m.downloadCount,
        categories: m.categories?.map((c) => c.name) ?? [],
        versions: [...new Set(idx.map((i) => i.gameVersion))],
        author: m.authors?.[0]?.name ?? '',
        source: 'curseforge' as const,
        // a filtered search only returns mods that have a file for this game version and loader
        compatible: !inst || filtered || idx.some((i) => i.gameVersion === inst.minecraft)
      }
    })
  }
}

/* ---------- versions and downloads ---------- */

async function files(modId: string, inst: Pick<Instance, 'loader' | 'minecraft'> | undefined): Promise<CfFile[]> {
  const out: CfFile[] = []
  for (let index = 0; index < 300; index += 50) {
    const q = new URLSearchParams({ pageSize: '50', index: String(index) })
    if (inst) {
      q.set('gameVersion', inst.minecraft)
      if (inst.loader !== 'quilt' && inst.loader !== 'vanilla') q.set('modLoaderType', String(LOADER_ID[inst.loader]))
    }
    const r = await api<{ data: CfFile[]; pagination: { totalCount: number } }>(`/mods/${encodeURIComponent(modId)}/files?${q}`)
    out.push(...r.data)
    if (index + 50 >= r.pagination.totalCount) break
  }
  return out.sort((a, b) => b.fileDate.localeCompare(a.fileDate))
}

export async function versions(inst: Instance, modId: string, all: boolean): Promise<ModVersion[]> {
  const list = await files(modId, all ? undefined : inst)
  return list.map((f) => ({
    id: String(f.id),
    name: f.displayName,
    version: f.fileName.replace(/\.jar$/i, ''),
    channel: channel(f.releaseType),
    date: f.fileDate,
    game: f.gameVersions.filter((g) => /^\d/.test(g)),
    loaders: f.gameVersions.filter((g) => ['Forge', 'Fabric', 'Quilt', 'NeoForge'].includes(g)),
    compatible: fileMatches(f, inst),
    downloads: f.downloadCount
  }))
}

/** Everything installMod needs to put one mod file on disk, whatever the catalog. */
export interface MetaEntry { source: 'modrinth' | 'curseforge'; projectId: string; versionId: string; version: string; title: string; description?: string; iconUrl?: string | null }
export interface Resolved { filename: string; urls: string[]; hashes: Hashes; deps: string[]; entry: MetaEntry }

export async function resolve(inst: Instance, modId: string, fileId?: string): Promise<Resolved> {
  let file: CfFile | undefined
  if (fileId) {
    file = (await api<{ data: CfFile }>(`/mods/${encodeURIComponent(modId)}/files/${encodeURIComponent(fileId)}`)).data
    if (file.modId !== Number(modId)) throw new Error('Файл не относится к этому моду')
  } else {
    const list = await files(modId, inst)
    // releases first, then betas and alphas; newest within each
    file = list.filter((f) => fileMatches(f, inst) && f.isAvailable !== false).sort((a, b) => a.releaseType - b.releaseType || b.fileDate.localeCompare(a.fileDate))[0]
  }
  if (!file) throw new Error(`На CurseForge нет версии мода для Minecraft ${inst.minecraft} и ${inst.loader}`)

  let url = file.downloadUrl
  if (!url) {
    try {
      url = (await api<{ data: string | null }>(`/mods/${file.modId}/files/${file.id}/download-url`)).data
    } catch {
      url = null
    }
  }
  // Authors can forbid downloads from third-party apps. The launcher respects that instead of going around it.
  if (!url) throw new Error(`Автор мода «${file.displayName}» запретил скачивание сторонними программами. Скачайте файл со страницы мода на curseforge.com и положите в папку mods`)

  const mod = (await api<{ data: CfMod }>(`/mods/${file.modId}`).catch(() => undefined))?.data
  const sha1 = file.hashes.find((h) => h.algo === 1)?.value
  return {
    filename: file.fileName,
    urls: [url],
    hashes: sha1 ? { sha1 } : {},
    deps: file.dependencies.filter((d) => d.relationType === 3).map((d) => String(d.modId)),
    entry: {
      source: 'curseforge',
      projectId: String(file.modId),
      versionId: String(file.id),
      version: file.displayName,
      title: mod?.name ?? file.fileName.replace(/\.jar$/i, ''),
      description: mod?.summary,
      iconUrl: mod?.logo?.thumbnailUrl ?? mod?.logo?.url ?? null
    }
  }
}
