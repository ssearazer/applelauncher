import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Instance, ModFile, ModrinthHit } from '../shared/types'
import { download, fileHash, getJson, postJson } from './net'
import { getInstance, instanceDir, safeJoin } from './store'

export const MODRINTH = 'https://api.modrinth.com/v2'

export interface MrFile { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string; sha512: string } }
export interface MrVersion {
  id: string
  project_id: string
  version_number: string
  loaders: string[]
  game_versions: string[]
  files: MrFile[]
  dependencies: { project_id?: string; version_id?: string; dependency_type: string }[]
}
interface MrProject { id: string; title: string; description: string; icon_url?: string }

export const modsDir = (inst: Instance) => join(instanceDir(inst.id), 'mods')

/** The loader name Modrinth uses for an instance; Quilt can also load Fabric mods. */
const loaderFacets = (inst: Instance) => (inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader])

const meta = new Map<string, { version?: MrVersion; project?: MrProject }>()

export async function listMods(instanceId: string): Promise<ModFile[]> {
  const inst = getInstance(instanceId)
  const dir = modsDir(inst)
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
  const hashes = new Map<string, string>()
  await Promise.all(files.map(async (f) => hashes.set(f, await fileHash(join(dir, f), 'sha1'))))

  const unknown = [...hashes.values()].filter((h) => !meta.has(h))
  if (unknown.length) {
    try {
      const versions = await postJson<Record<string, MrVersion>>(`${MODRINTH}/version_files`, { hashes: unknown, algorithm: 'sha1' })
      const ids = [...new Set(Object.values(versions).map((v) => v.project_id))]
      const projects = ids.length ? await getJson<MrProject[]>(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`) : []
      for (const h of unknown) {
        const version = versions[h]
        meta.set(h, { version, project: projects.find((p) => p.id === version?.project_id) })
      }
    } catch {
      // offline: show file names only, retry next time
    }
  }

  return Promise.all(
    files.map(async (file) => {
      const m = meta.get(hashes.get(file)!)
      return {
        file,
        enabled: file.endsWith('.jar'),
        size: (await stat(join(dir, file))).size,
        title: m?.project?.title ?? file.replace(/\.jar(\.disabled)?$/, ''),
        description: m?.project?.description,
        version: m?.version?.version_number,
        iconUrl: m?.project?.icon_url ?? undefined,
        projectId: m?.project?.id
      }
    })
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
  await rm(modPath(getInstance(instanceId), file))
}

export async function search(query: string, instanceId: string | undefined, type: 'mod' | 'modpack', offset = 0, compatibleOnly = true): Promise<{ hits: ModrinthHit[]; total: number }> {
  const inst = instanceId ? getInstance(instanceId) : undefined
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
      compatible: !inst || type === 'modpack' || (h.versions.includes(inst.minecraft) && loaderFacets(inst).some((l) => h.categories.includes(l)))
    }))
  }
}

async function bestVersion(projectId: string, inst: Instance): Promise<MrVersion | undefined> {
  const q = new URLSearchParams({ loaders: JSON.stringify(loaderFacets(inst)), game_versions: JSON.stringify([inst.minecraft]) })
  const list = await getJson<MrVersion[]>(`${MODRINTH}/project/${encodeURIComponent(projectId)}/version?${q}`)
  return list[0]
}

/** Installs a mod and its required dependencies, verifying every file by sha512. */
export async function installMod(instanceId: string, projectId: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.has(projectId)) return []
  seen.add(projectId)
  const inst = getInstance(instanceId)
  if (inst.loader === 'vanilla') throw new Error('Для модов нужна сборка с загрузчиком: Fabric, Forge, NeoForge или Quilt')
  const v = await bestVersion(projectId, inst)
  if (!v) throw new Error(`Нет версии мода для Minecraft ${inst.minecraft} и ${inst.loader}`)
  const file = v.files.find((f) => f.primary) ?? v.files[0]
  const dir = modsDir(inst)
  await mkdir(dir, { recursive: true })
  const installed: string[] = []
  const target = safeJoin(dir, basename(file.filename))
  if (!existsSync(target)) {
    await download(file.url, target, { sha512: file.hashes.sha512 })
    installed.push(file.filename)
  }
  for (const dep of v.dependencies) {
    if (dep.dependency_type === 'required' && dep.project_id) installed.push(...(await installMod(instanceId, dep.project_id, seen)))
  }
  return installed
}

export const versionFiles = (hashes: string[]) => postJson<Record<string, MrVersion>>(`${MODRINTH}/version_files`, { hashes, algorithm: 'sha1' })
export const projectVersions = (id: string) => getJson<MrVersion[]>(`${MODRINTH}/project/${encodeURIComponent(id)}/version`)
