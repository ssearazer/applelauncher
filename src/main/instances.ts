import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import yazl from 'yazl'
import type { Instance, Loader } from '../shared/types'
import { fromMmcPack, fromVersionJson, type PackTarget } from '../shared/pure'
import { download, fileHash } from './net'
import { getInstance, getInstances, getSettings, instanceDir, safeJoin, saveInstances, setSettings } from './store'
import { projectVersions, versionFiles, type MrVersion } from './mods'

export function createInstance(input: Pick<Instance, 'name' | 'minecraft' | 'loader' | 'loaderVersion'>): Instance {
  const inst: Instance = { ...input, id: randomUUID(), created: Date.now() }
  saveInstances([...getInstances(), inst])
  if (!getSettings().selectedInstance) setSettings({ selectedInstance: inst.id })
  return inst
}

export async function removeInstance(id: string, deleteFiles: boolean): Promise<void> {
  getInstance(id)
  saveInstances(getInstances().filter((i) => i.id !== id))
  if (getSettings().selectedInstance === id) setSettings({ selectedInstance: getInstances()[0]?.id })
  if (deleteFiles) await rm(instanceDir(id), { recursive: true, force: true })
}

/* ---------- .mrpack ---------- */

interface MrIndex {
  formatVersion: 1
  game: 'minecraft'
  versionId: string
  name: string
  summary?: string
  files: { path: string; hashes: { sha1: string; sha512: string }; downloads: string[]; fileSize: number; env?: { client?: string } }[]
  dependencies: Record<string, string>
}

const openZip = (file: string) =>
  new Promise<yauzl.ZipFile>((res, rej) => yauzl.open(file, { lazyEntries: true }, (e, z) => (e ? rej(e) : res(z!))))

async function readZip(file: string, onEntry: (entry: yauzl.Entry, open: () => Promise<NodeJS.ReadableStream>) => Promise<void>) {
  const zip = await openZip(file)
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const open = () => new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(entry, (e, s) => (e ? rej(e) : res(s!))))
      onEntry(entry, open).then(() => zip.readEntry(), reject)
    })
    zip.on('end', resolve)
    zip.on('error', reject)
    zip.readEntry()
  })
  zip.close()
}

const streamText = async (s: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = []
  for await (const c of s) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const DOWNLOAD_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']

export async function importMrpack(file: string, onProgress: (p: number, detail: string) => void): Promise<Instance> {
  let index: MrIndex | undefined
  await readZip(file, async (entry, open) => {
    if (entry.fileName === 'modrinth.index.json') index = JSON.parse(await streamText(await open()))
  })
  if (!index || index.game !== 'minecraft' || index.formatVersion !== 1) throw new Error('Это не сборка Modrinth (.mrpack)')
  const deps = index.dependencies
  const loader: Loader = deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla'
  const loaderVersion = deps['fabric-loader'] ?? deps['quilt-loader'] ?? deps.neoforge ?? deps.forge
  const inst = createInstance({ name: index.name, minecraft: deps.minecraft, loader, loaderVersion })
  const dir = instanceDir(inst.id)
  try {
    const files = index.files.filter((f) => f.env?.client !== 'unsupported')
    let done = 0
    for (const f of files) {
      const target = safeJoin(dir, f.path)
      const urls = f.downloads.filter((u) => DOWNLOAD_HOSTS.includes(new URL(u).hostname))
      if (!urls.length) throw new Error(`Файл ${f.path} загружается с недоверенного адреса`)
      onProgress(done / files.length, f.path)
      await download(urls, target, { sha512: f.hashes.sha512, sha1: f.hashes.sha1 })
      done++
    }
    onProgress(1, 'overrides')
    await readZip(file, async (entry, open) => {
      const m = /^(client-overrides|overrides)\/(.+)$/.exec(entry.fileName)
      if (!m || entry.fileName.endsWith('/')) return
      const target = safeJoin(dir, m[2])
      await mkdir(dirname(target), { recursive: true })
      await pipeline(await open(), createWriteStream(target))
    })
  } catch (e) {
    await removeInstance(inst.id, true)
    throw e
  }
  return inst
}

/* ---------- other launchers ---------- */

type Progress = (p: number, detail: string) => void

/** .mrpack or a Prism Launcher export (.zip with mmc-pack.json), detected by contents. */
export async function importArchive(file: string, onProgress: Progress): Promise<Instance> {
  let mmc: string | undefined, cfg: string | undefined, mr = false
  await readZip(file, async (entry, open) => {
    if (entry.fileName === 'modrinth.index.json') mr = true
    else if (/(^|\/)mmc-pack\.json$/.test(entry.fileName) && (mmc === undefined || entry.fileName.length < mmc.length)) mmc = entry.fileName
    else if (/(^|\/)instance\.cfg$/.test(entry.fileName)) cfg = await streamText(await open())
  })
  if (mr) return importMrpack(file, onProgress)
  if (!mmc) throw new Error('Архив не похож на сборку Modrinth или Prism Launcher')
  const prefix = mmc.slice(0, -'mmc-pack.json'.length)
  let pack = ''
  await readZip(file, async (entry, open) => {
    if (entry.fileName === mmc) pack = await streamText(await open())
  })
  const target = fromMmcPack(JSON.parse(pack))
  const name = cfgName(cfg) ?? basename(file).replace(/\.zip$/i, '')
  return withNewInstance(name, target, async (dir) => {
    let n = 0
    await readZip(file, async (entry, open) => {
      const m = entry.fileName.startsWith(prefix) && /^\.?minecraft\/(.+)$/.exec(entry.fileName.slice(prefix.length))
      if (!m || entry.fileName.endsWith('/')) return
      if (++n % 20 === 0) onProgress(0.5, m[1])
      const out = safeJoin(dir, m[1])
      await mkdir(dirname(out), { recursive: true })
      await pipeline(await open(), createWriteStream(out))
    })
  })
}

// only what belongs to the player; libraries, natives and caches are re-downloaded by the installer
const GAME_ITEMS = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', 'kubejs', 'defaultconfigs', 'scripts', 'options.txt', 'servers.dat']

/** A Prism Launcher instance folder or a TLauncher version folder (versions/<name>). */
export async function importFolder(src: string, onProgress: Progress): Promise<Instance> {
  let target: PackTarget, gameDir: string, name: string
  if (existsSync(join(src, 'mmc-pack.json'))) {
    target = fromMmcPack(JSON.parse(await readFile(join(src, 'mmc-pack.json'), 'utf8')))
    gameDir = [join(src, '.minecraft'), join(src, 'minecraft')].find(existsSync) ?? src
    name = cfgName(existsSync(join(src, 'instance.cfg')) ? await readFile(join(src, 'instance.cfg'), 'utf8') : undefined) ?? basename(src)
  } else {
    const own = join(src, `${basename(src)}.json`)
    const json = existsSync(own) ? own : (await readdir(src)).filter((f) => f.endsWith('.json')).map((f) => join(src, f))[0]
    if (!json) throw new Error('В папке нет mmc-pack.json (Prism) или файла версии .json (TLauncher)')
    target = fromVersionJson(JSON.parse(await readFile(json, 'utf8')))
    gameDir = src
    name = basename(src)
  }
  return withNewInstance(name, target, async (dir) => {
    const items = GAME_ITEMS.filter((i) => existsSync(join(gameDir, i)))
    for (const [k, item] of items.entries()) {
      onProgress(k / items.length, item)
      await cp(join(gameDir, item), safeJoin(dir, item), { recursive: true, force: true })
    }
  })
}

const cfgName = (cfg?: string) => cfg && /^name=(.+)$/m.exec(cfg)?.[1].trim().slice(0, 64)

async function withNewInstance(name: string, t: PackTarget, fill: (dir: string) => Promise<void>): Promise<Instance> {
  const inst = createInstance({ name: name || 'Сборка', minecraft: t.minecraft, loader: t.loader, loaderVersion: t.loaderVersion })
  try {
    await mkdir(instanceDir(inst.id), { recursive: true })
    await fill(instanceDir(inst.id))
  } catch (e) {
    await removeInstance(inst.id, true)
    throw e
  }
  return inst
}

export async function installModpack(projectId: string, onProgress: (p: number, detail: string) => void): Promise<Instance> {
  const versions: MrVersion[] = await projectVersions(projectId)
  const v = versions[0]
  if (!v) throw new Error('У сборки нет файлов для загрузки')
  const f = v.files.find((x) => x.primary) ?? v.files[0]
  const tmp = join(getSettings().downloadsDir, `applelauncher-${v.id}.mrpack`)
  onProgress(0, f.filename)
  await download(f.url, tmp, { sha512: f.hashes.sha512 })
  try {
    return await importMrpack(tmp, onProgress)
  } finally {
    await rm(tmp, { force: true })
  }
}

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

// what goes into an exported pack: mods resolved through Modrinth, everything else as overrides
const EXPORT_DIRS = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'defaultconfigs', 'kubejs']

export async function exportMrpack(id: string, target: string): Promise<void> {
  const inst = getInstance(id)
  const dir = instanceDir(id)
  const all = (await Promise.all(EXPORT_DIRS.map((d) => walk(join(dir, d))))).flat().filter((p) => !p.endsWith('.disabled'))
  const mods = all.filter((p) => relative(dir, p).startsWith('mods') && p.endsWith('.jar'))
  const sha1 = new Map<string, string>()
  await Promise.all(mods.map(async (p) => sha1.set(p, await fileHash(p, 'sha1'))))
  const known = sha1.size ? await versionFiles([...sha1.values()]).catch(() => ({}) as Record<string, MrVersion>) : {}

  const files: MrIndex['files'] = []
  const zip = new yazl.ZipFile()
  for (const p of all) {
    const rel = relative(dir, p).replaceAll('\\', '/')
    const v = sha1.has(p) ? known[sha1.get(p)!] : undefined
    const mf = v?.files.find((f) => f.hashes.sha1 === sha1.get(p))
    if (mf) files.push({ path: rel, hashes: mf.hashes, downloads: [mf.url], fileSize: mf.size })
    else zip.addFile(p, `overrides/${rel}`)
  }
  const deps: Record<string, string> = { minecraft: inst.minecraft }
  const key = { fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge', vanilla: '' }[inst.loader]
  if (key && inst.loaderVersion) deps[key] = inst.loaderVersion
  const index: MrIndex = { formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: inst.name, files, dependencies: deps }
  zip.addBuffer(Buffer.from(JSON.stringify(index, null, 2)), 'modrinth.index.json')
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(target))
}

export async function instanceSize(id: string): Promise<number> {
  const files = await walk(instanceDir(id))
  let size = 0
  for (const f of files) size += (await stat(f)).size
  return size
}

