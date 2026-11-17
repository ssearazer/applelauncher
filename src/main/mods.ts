import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Instance, ModFile, ModrinthHit, ModSource, ModVersion } from '../shared/types'
import * as cf from './curseforge'
import type { MetaEntry, Resolved } from './curseforge'
import { download, fileHash, getJson, postJson } from './net'
import { getInstance, instanceDir, safeJoin } from './store'

export const MODRINTH = 'https://api.modrinth.com/v2'

export interface MrFile { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string; sha512: string } }
export interface MrVersion {
  id: string
  project_id: string
  name?: string
  version_number: string
  version_type?: 'release' | 'beta' | 'alpha'
  date_published?: string
  downloads?: number
  loaders: string[]
  game_versions: string[]
  files: MrFile[]
  dependencies: { project_id?: string; version_id?: string; dependency_type: string }[]
}
export interface MrProject { id: string; title: string; description: string; icon_url?: string; project_type?: string; slug?: string }

export const modsDir = (inst: Instance) => join(instanceDir(inst.id), 'mods')

/** The loader name Modrinth uses for an instance; Quilt can also load Fabric mods. */
export const loaderFacets = (inst: Pick<Instance, 'loader'>) => (inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader])

const baseName = (f: string) => f.replace(/\.disabled$/, '')

/* ---------- what the launcher knows about installed files ---------- */

// Modrinth recognises files by hash. CurseForge has no such lookup, so every install is also written to a small
// file next to the mods; it remembers where a jar came from, which is what makes "change version" possible.
const metaPath = (inst: Instance) => join(instanceDir(inst.id), 'applelauncher-mods.json')
type MetaFile = Record<string, MetaEntry>

async function readMeta(inst: Instance): Promise<MetaFile> {
  try {
    return JSON.parse(await readFile(metaPath(inst), 'utf8')) as MetaFile
  } catch {
    return {}
  }
}
let metaQueue: Promise<unknown> = Promise.resolve()
/** Serialised, so two installs finishing together never overwrite each other's entry. */
function updateMeta(inst: Instance, change: (m: MetaFile) => void): Promise<void> {
  const run = metaQueue.then(async () => {
    const m = await readMeta(inst)
    change(m)
    await writeFile(metaPath(inst), JSON.stringify(m, null, 2))
  })
  metaQueue = run.catch(() => undefined)
  return run.catch(() => undefined)
}

const modrinthMeta = new Map<string, { version?: MrVersion; project?: MrProject }>()

interface Found { file: string; dir: string; entry?: MetaEntry }

async function identify(inst: Instance): Promise<Found[]> {
  const dir = modsDir(inst)
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
  const hashes = new Map<string, string>()
  await Promise.all(files.map(async (f) => hashes.set(f, await fileHash(join(dir, f), 'sha1'))))

  const unknown = [...new Set([...hashes.values()].filter((h) => !modrinthMeta.has(h)))]
  if (unknown.length) {
    try {
      const versions = await postJson<Record<string, MrVersion>>(`${MODRINTH}/version_files`, { hashes: unknown, algorithm: 'sha1' })
      const ids = [...new Set(Object.values(versions).map((v) => v.project_id))]
      const projects = ids.length ? await getJson<MrProject[]>(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`) : []
      for (const h of unknown) {
        const version = versions[h]
        modrinthMeta.set(h, { version, project: projects.find((p) => p.id === version?.project_id) })
      }
    } catch {
      // offline: show file names only, retry next time
    }
  }
  const side = await readMeta(inst)
  return files.map((file) => {
    const mr = modrinthMeta.get(hashes.get(file)!)
    const entry: MetaEntry | undefined = mr?.version
      ? { source: 'modrinth', projectId: mr.version.project_id, versionId: mr.version.id, version: mr.version.version_number, title: mr.project?.title ?? baseName(file).replace(/\.jar$/, ''), description: mr.project?.description, iconUrl: mr.project?.icon_url }
      : side[baseName(file)]
    return { file, dir, entry }
  })
}

export async function listMods(instanceId: string): Promise<ModFile[]> {
  const inst = getInstance(instanceId)
  const found = await identify(inst)
  return Promise.all(
    found.map(async ({ file, dir, entry }) => ({
      file,
      enabled: file.endsWith('.jar'),
      size: (await stat(join(dir, file))).size,
      title: entry?.title ?? baseName(file).replace(/\.jar$/, ''),
      description: entry?.description,
      version: entry?.version,
      iconUrl: entry?.iconUrl ?? undefined,
      projectId: entry?.projectId,
      source: entry?.source,
      versionId: entry?.versionId
    }))
  )
}

function modPath(inst: Instance, file: string): string {
  if (basename(file) !== file) throw new Error('Недопустимое имя файла')
  const p = safeJoin(modsDir(inst), file)
  if (!existsSync(p)) throw new Error('Файл мода не найден')
  return p
}

export async function toggleMod(instanceId: string, file: string): Promise<void> {
  const inst = getInstance(instanceId)
  const p = modPath(inst, file)
  await rename(p, file.endsWith('.disabled') ? p.slice(0, -'.disabled'.length) : `${p}.disabled`)
}

export async function removeMod(instanceId: string, file: string): Promise<void> {
  const inst = getInstance(instanceId)
  await rm(modPath(inst, file))
  await updateMeta(inst, (m) => void delete m[baseName(file)])
}

/* ---------- search ---------- */

export async function search(query: string, instanceId: string | undefined, type: 'mod' | 'modpack', offset = 0, compatibleOnly = true, source: ModSource = 'modrinth'): Promise<{ hits: ModrinthHit[]; total: number }> {
  const inst = instanceId ? getInstance(instanceId) : undefined
  if (source === 'curseforge') {
    if (type !== 'mod') throw new Error('Сборки доступны только из Modrinth')
    return cf.search(query, inst, offset, compatibleOnly)
  }
  const facets: string[][] = [[`project_type:${type}`]]
  if (inst && compatibleOnly && type === 'mod' && inst.loader !== 'vanilla') {
    facets.push(loaderFacets(inst).map((l) => `categories:${l}`))
    facets.push([`versions:${inst.minecraft}`])
  }
  const q = new URLSearchParams({ query, limit: '24', offset: String(offset), index: query ? 'relevance' : 'downloads', facets: JSON.stringify(facets) })
  const r = await getJson<{ hits: Omit<ModrinthHit, 'compatible'>[]; total_hits: number }>(`${MODRINTH}/search?${q}`)
  return {
    total: r.total_hits,
    hits: r.hits.map((h) => ({
      ...h,
      source: 'modrinth' as const,
      compatible: !inst || type === 'modpack' || (h.versions.includes(inst.minecraft) && loaderFacets(inst).some((l) => h.categories.includes(l)))
    }))
  }
}

export async function bestVersion(projectId: string, inst: Pick<Instance, 'loader' | 'minecraft'>): Promise<MrVersion | undefined> {
  const q = new URLSearchParams({ loaders: JSON.stringify(loaderFacets(inst)), game_versions: JSON.stringify([inst.minecraft]) })
  const list = await getJson<MrVersion[]>(`${MODRINTH}/project/${encodeURIComponent(projectId)}/version?${q}`)
  return list[0]
}

/* ---------- versions of one mod ---------- */

export async function listVersions(instanceId: string, source: ModSource, projectId: string, all: boolean): Promise<ModVersion[]> {
  const inst = getInstance(instanceId)
  if (source === 'curseforge') return cf.versions(inst, projectId, all)
  const loaders = loaderFacets(inst)
  const list = await projectVersions(projectId)
  const out = list.map((v): ModVersion => ({
    id: v.id,
    name: v.name || v.version_number,
    version: v.version_number,
    channel: v.version_type ?? 'release',
    date: v.date_published ?? '',
    game: v.game_versions,
    loaders: v.loaders,
    compatible: v.game_versions.includes(inst.minecraft) && v.loaders.some((l) => (loaders as string[]).includes(l)),
    downloads: v.downloads
  }))
  return all ? out : out.filter((v) => v.compatible)
}

/* ---------- installing ---------- */

async function resolveModrinth(inst: Instance, projectId: string, versionId?: string): Promise<Resolved> {
  const v = versionId ? await getJson<MrVersion>(`${MODRINTH}/version/${encodeURIComponent(versionId)}`) : await bestVersion(projectId, inst)
  if (!v) throw new Error(`Нет версии мода для Minecraft ${inst.minecraft} и ${inst.loader}`)
  if (versionId && v.project_id !== projectId) throw new Error('Версия не относится к этому моду')
  const file = v.files.find((f) => f.primary) ?? v.files[0]
  if (!file) throw new Error('В этой версии нет файлов')
  const project = await getJson<MrProject>(`${MODRINTH}/project/${encodeURIComponent(v.project_id)}`).catch(() => undefined)
  return {
    filename: file.filename,
    urls: [file.url],
    hashes: { sha512: file.hashes.sha512 },
    deps: v.dependencies.filter((d) => d.dependency_type === 'required' && d.project_id).map((d) => d.project_id!),
    entry: { source: 'modrinth', projectId: v.project_id, versionId: v.id, version: v.version_number, title: project?.title ?? file.filename.replace(/\.jar$/i, ''), description: project?.description, iconUrl: project?.icon_url }
  }
}

const resolveFile = (inst: Instance, source: ModSource, projectId: string, versionId?: string) =>
  source === 'curseforge' ? cf.resolve(inst, projectId, versionId) : resolveModrinth(inst, projectId, versionId)

/** Downloads the jar (verified by hash) unless a file with that name is already there, enabled or not. */
async function placeFile(inst: Instance, r: Resolved): Promise<{ file: string; fresh: boolean }> {
  const dir = modsDir(inst)
  await mkdir(dir, { recursive: true })
  const name = basename(r.filename)
  if (!/\.jar$/i.test(name)) throw new Error(`Это не мод (.jar): ${name}`)
  const target = safeJoin(dir, name)
  if (existsSync(target) || existsSync(`${target}.disabled`)) return { file: name, fresh: false }
  await download(r.urls, target, r.hashes)
  return { file: name, fresh: true }
}

const sameMod = (a: MetaEntry | undefined, source: ModSource, projectId: string) => a?.source === source && a.projectId === projectId

/**
 * Installs a mod and its required dependencies, verifying every file by hash.
 * With `versionId` that exact version is installed; with `replace` (or a `versionId`) any other copy of the same mod is removed.
 */
export async function installMod(instanceId: string, projectId: string, seen = new Set<string>(), opts: { source?: ModSource; versionId?: string; replace?: boolean } = {}): Promise<string[]> {
  const source = opts.source ?? 'modrinth'
  const key = `${source}:${projectId}`
  if (seen.has(key)) return []
  seen.add(key)
  const inst = getInstance(instanceId)
  if (inst.loader === 'vanilla') throw new Error('Для модов нужна сборка с загрузчиком: Fabric, Forge, NeoForge или Quilt')

  const r = await resolveFile(inst, source, projectId, opts.versionId)
  const { file, fresh } = await placeFile(inst, r)
  await updateMeta(inst, (m) => void (m[file] = r.entry))
  const installed = fresh ? [file] : []
  // installing a mod the player already has (in any version) must not leave two jars of it behind
  if (opts.replace || opts.versionId) await dropOlderCopies(inst, source, projectId, file)
  installed.push(...(await installDeps(inst, source, r.deps, seen)))
  return installed
}

/** Splits the files one install returned into the mod itself and the libraries that came with it. */
export async function splitLibs(instanceId: string, files: string[], projectId: string): Promise<{ mod: string[]; libs: string[] }> {
  const meta = await readMeta(getInstance(instanceId))
  const mod: string[] = []
  const libs: string[] = []
  for (const f of files) (meta[f]?.projectId === projectId ? mod : libs).push(f)
  return { mod, libs }
}

async function installDeps(inst: Instance, source: ModSource, deps: string[], seen: Set<string>): Promise<string[]> {
  if (!deps.length) return []
  const have = (await identify(inst)).filter((f) => f.entry)
  const out: string[] = []
  for (const dep of deps) {
    // a dependency that is already there (any version) is left alone: two jars of one mod stop the game from starting
    if (have.some((f) => sameMod(f.entry, source, dep))) continue
    out.push(...(await installMod(inst.id, dep, seen, { source })))
  }
  return out
}

async function dropOlderCopies(inst: Instance, source: ModSource, projectId: string, keep: string): Promise<void> {
  for (const f of await identify(inst)) {
    if (baseName(f.file) === keep || !sameMod(f.entry, source, projectId)) continue
    await rm(join(f.dir, f.file), { force: true })
    await updateMeta(inst, (m) => void delete m[baseName(f.file)])
  }
}

/** Swaps an installed mod for another version of itself (older or newer). Keeps it disabled if it was disabled. */
export async function changeVersion(instanceId: string, file: string, source: ModSource, projectId: string, versionId: string): Promise<string[]> {
  const inst = getInstance(instanceId)
  const old = modPath(inst, file)
  const r = await resolveFile(inst, source, projectId, versionId)
  if (basename(r.filename) === baseName(file)) return []
  const { file: name } = await placeFile(inst, r) // the new jar is on disk before the old one goes away
  if (file.endsWith('.disabled')) await rename(safeJoin(modsDir(inst), name), safeJoin(modsDir(inst), `${name}.disabled`))
  await rm(old, { force: true })
  await updateMeta(inst, (m) => {
    delete m[baseName(file)]
    m[name] = r.entry
  })
  return [name, ...(await installDeps(inst, source, r.deps, new Set([`${source}:${projectId}`])))]
}

export const versionFiles = (hashes: string[]) => postJson<Record<string, MrVersion>>(`${MODRINTH}/version_files`, { hashes, algorithm: 'sha1' })
export const projectVersions = (id: string) => getJson<MrVersion[]>(`${MODRINTH}/project/${encodeURIComponent(id)}/version`)
