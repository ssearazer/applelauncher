import { Blocks, Check, Download, History, Package, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CurseForgeStatus, Instance, ModFile, ModrinthHit, ModSource, ModVersion } from '../../../shared/types'
import { LOADER_NAME } from '../components/InstanceDialog'
import { api, formatBytes, useApp } from '../state'
import { Button, Empty, IconButton, Input, Modal, PageHeader, SearchField, Segmented, Select, Skeleton, Toggle, cx } from '../ui'

export const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n)

export function ModIcon({ url, size = 40 }: { url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  return url && !broken ? (
    <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-[10px] border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-[10px] border border-line bg-hover text-muted" style={{ width: size, height: size }}><Package size={size / 2.4} /></div>
  )
}

/** Debounced catalog search (Modrinth or CurseForge) with paging, shared by the mods and packs pages. */
export function useModrinth(type: 'mod' | 'modpack', instanceId: string | undefined, compatibleOnly: boolean, source: ModSource = 'modrinth', enabled = true) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<ModrinthHit[]>()
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string>()
  const req = useRef(0)
  const load = useCallback(
    async (offset: number) => {
      const n = ++req.current
      setError(undefined)
      if (!offset) setHits(undefined)
      try {
        const r = await api.mods.search(q, instanceId, type, offset, compatibleOnly, source)
        if (n !== req.current) return
        setHits((h) => (offset ? [...(h ?? []), ...r.hits] : r.hits))
        setTotal(r.total)
      } catch (e) {
        if (n === req.current) setError((e as Error).message), setHits((h) => h ?? [])
      }
    },
    [q, instanceId, type, compatibleOnly, source]
  )
  useEffect(() => {
    if (!enabled) return
    const h = setTimeout(() => void load(0), 300)
    return () => clearTimeout(h)
  }, [load, enabled])
  return { q, setQ, hits, total, error, more: () => load(hits?.length ?? 0) }
}

export function Mods() {
  const { t, instances, selected, setSettings, go } = useApp()
  const modded = instances.filter((i) => i.loader !== 'vanilla')
  const inst = selected && selected.loader !== 'vanilla' ? selected : modded[0]
  const [tab, setTab] = useState<'installed' | 'browse'>('installed')

  if (!inst)
    return (
      <div>
        <PageHeader title={t('nav.mods')} />
        <Empty icon={<Blocks size={20} />} title={t('mods.noModded')} text={t('mods.noModdedText')} action={<Button variant="primary" onClick={() => go('versions')}>{t('mods.toVersions')}</Button>} />
      </div>
    )

  return (
    <div>
      <PageHeader title={t('nav.mods')} subtitle={`${LOADER_NAME[inst.loader]} ${inst.minecraft}`}>
        <Select className="w-64" label={t('home.profile')} value={inst.id} onChange={(v) => setSettings({ selectedInstance: v })} options={modded.map((i) => ({ value: i.id, label: i.name, hint: `${LOADER_NAME[i.loader]} ${i.minecraft}` }))} />
      </PageHeader>
      <div className="mb-4">
        <Segmented label={t('nav.mods')} value={tab} onChange={setTab} options={[{ value: 'installed', label: t('mods.installed') }, { value: 'browse', label: t('mods.catalog') }]} />
      </div>
      {tab === 'installed' ? <InstalledMods inst={inst} onBrowse={() => setTab('browse')} /> : <BrowseMods inst={inst} />}
    </div>
  )
}

export function InstalledMods({ inst, onBrowse }: { inst: Instance; onBrowse?: () => void }) {
  const { t, attempt, jobs } = useApp()
  const [mods, setMods] = useState<ModFile[]>()
  const [q, setQ] = useState('')
  const [versionsOf, setVersionsOf] = useState<VersionTarget>()
  const reload = useCallback(async () => setMods(await attempt(() => api.mods.list(inst.id)) ?? []), [inst.id, attempt])
  const doneJobs = Object.values(jobs).filter((j) => j.id.startsWith('mod:') && j.done).length
  useEffect(() => {
    setMods(undefined)
    void reload()
  }, [reload, doneJobs])

  if (!mods) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] rounded-[14px]" />)}</div>
  if (!mods.length) return <Empty icon={<Blocks size={20} />} title={t('mods.empty')} text={t('mods.emptyText')} action={onBrowse && <Button variant="primary" onClick={onBrowse}>{t('mods.browse')}</Button>} />
  const shown = mods.filter((m) => m.title.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SearchField value={q} onChange={setQ} placeholder={t('mods.filter')} className="w-64" />
        <span className="text-[12px] text-muted">{t('mods.count', { on: mods.filter((m) => m.enabled).length, all: mods.length })}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((m) => (
          <li key={m.file} className={cx('flex items-center gap-3 rounded-[14px] border border-line bg-card p-3 transition-opacity', !m.enabled && 'opacity-60')}>
            <ModIcon url={m.iconUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium">{m.title}</span>
                {m.version && <span className="shrink-0 text-[12px] text-muted">{m.version}</span>}
              </div>
              <p className="truncate text-[12px] text-muted">{m.description ?? m.file}</p>
            </div>
            <span className="text-[12px] text-muted">{formatBytes(m.size)}</span>
            {m.projectId && m.source && (
              <IconButton label={t('mods.versions')} onClick={() => setVersionsOf({ source: m.source!, projectId: m.projectId!, title: m.title, file: m.file, versionId: m.versionId })}>
                <History size={15} />
              </IconButton>
            )}
            <Toggle label={t('mods.enabled', { name: m.title })} checked={m.enabled} onChange={async () => { await attempt(() => api.mods.toggle(inst.id, m.file)); await reload() }} />
            <IconButton label={t('common.remove')} onClick={async () => { if (confirm(t('mods.confirmRemove', { name: m.title }))) { await attempt(() => api.mods.remove(inst.id, m.file)); await reload() } }}>
              <Trash2 size={15} />
            </IconButton>
          </li>
        ))}
      </ul>
      <VersionsDialog inst={inst} target={versionsOf} onClose={() => setVersionsOf(undefined)} />
    </>
  )
}

function BrowseMods({ inst }: { inst: Instance }) {
  const { t, attempt, jobs, toast } = useApp()
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [source, setSource] = useState<ModSource>('modrinth')
  const [versionsOf, setVersionsOf] = useState<VersionTarget>()
  const curse = useCurseForge()
  // CurseForge only answers with a key; until it is saved the catalog shows the setup card instead of results
  const needsKey = source === 'curseforge' && curse.status?.hasKey === false
  const waiting = source === 'curseforge' && !curse.status
  const { q, setQ, hits, total, error, more } = useModrinth('mod', inst.id, compatibleOnly, source, !needsKey && !waiting)
  const [done, setDone] = useState<Set<string>>(new Set())

  const install = async (h: ModrinthHit) => {
    const files = await attempt(() => api.mods.install(inst.id, h.project_id, source))
    if (files) {
      setDone((s) => new Set(s).add(`${source}:${h.project_id}`))
      toast(t('mods.installedToast', { name: h.title, n: files.length }))
    }
  }
  if (waiting) return <div className="mb-3"><Segmented label={t('mods.source')} value={source} onChange={setSource} options={SOURCES} /></div>
  if (needsKey) {
    return (
      <>
        <div className="mb-3"><Segmented label={t('mods.source')} value={source} onChange={setSource} options={SOURCES} /></div>
        <CurseForgeSetup onSave={curse.save} />
      </>
    )
  }
  return (
    <>
      <div className="mb-3 flex items-center gap-4">
        <Segmented label={t('mods.source')} value={source} onChange={setSource} options={SOURCES} />
        <SearchField value={q} onChange={setQ} placeholder={t('mods.search')} className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-muted">
          {t('mods.onlyCompatible')}
          <Toggle label={t('mods.onlyCompatible')} checked={compatibleOnly} onChange={setCompatibleOnly} />
        </label>
      </div>
      {error && <p role="alert" className="mb-3 text-[13px]">{t('mods.searchError', { error })}</p>}
      {!hits ? (
        <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[104px] rounded-[14px]" />)}</div>
      ) : hits.length === 0 && !error ? (
        <p className="py-10 text-center text-[13px] text-muted">{t('common.nothingFound')}</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {hits.map((h) => {
              const job = jobs[`mod:${h.project_id}`]
              const installing = job && !job.done
              return (
                <li key={h.project_id} className="flex gap-3 rounded-[14px] border border-line bg-card p-3">
                  <ModIcon url={h.icon_url} size={48} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-medium">{h.title}</span>
                      <span className="shrink-0 text-[12px] text-muted">{h.author}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{h.description}</p>
                    <div className="mt-auto flex items-center gap-3 pt-2 text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1"><Download size={12} aria-hidden />{compact(h.downloads)}</span>
                      <span className={h.compatible ? 'text-fg' : undefined}>{h.compatible ? t('mods.compatible', { mc: inst.minecraft }) : t('mods.incompatible')}</span>
                      <span className="flex-1" />
                      <IconButton label={t('mods.versions')} onClick={() => setVersionsOf({ source, projectId: h.project_id, title: h.title })}><History size={14} /></IconButton>
                      {done.has(`${source}:${h.project_id}`) ? (
                        <span className="inline-flex items-center gap-1 text-fg"><Check size={13} /> {t('home.installed')}</span>
                      ) : (
                        <Button size="sm" disabled={installing || !h.compatible} onClick={() => install(h)}>{installing ? t('mods.installing') : t('versions.install')}</Button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {hits.length < total && <div className="mt-4 flex justify-center"><Button onClick={more}>{t('mods.more')}</Button></div>}
        </>
      )}
      <VersionsDialog inst={inst} target={versionsOf} onClose={() => setVersionsOf(undefined)} onInstalled={(x) => setDone((s) => new Set(s).add(`${x.source}:${x.projectId}`))} />
    </>
  )
}

const SOURCES: { value: ModSource; label: string }[] = [{ value: 'modrinth', label: 'Modrinth' }, { value: 'curseforge', label: 'CurseForge' }]

/* ---------- CurseForge key ---------- */

export function useCurseForge() {
  const { t, attempt, toast } = useApp()
  const [status, setStatus] = useState<CurseForgeStatus>()
  useEffect(() => void api.curseforge.status().then(setStatus), [])
  const save = async (key: string) => {
    const s = await attempt(() => api.curseforge.setKey(key))
    if (s) {
      setStatus(s)
      toast(t('mods.cfKeySaved'))
    }
    return !!s
  }
  const remove = async () => {
    const s = await attempt(() => api.curseforge.clearKey())
    if (s) {
      setStatus(s)
      toast(t('mods.cfKeyRemoved'))
    }
  }
  return { status, save, remove }
}

export function CurseForgeKeyInput({ onSave }: { onSave: (key: string) => Promise<boolean> }) {
  const { t, attempt } = useApp()
  const [key, setKey] = useState('')
  const submit = async () => {
    if (key.trim() && (await onSave(key.trim()))) setKey('')
  }
  return (
    <div className="flex items-center gap-2">
      <Input type="password" autoComplete="off" spellCheck={false} aria-label={t('mods.cfKeyPlaceholder')} placeholder={t('mods.cfKeyPlaceholder')} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} className="min-w-0 flex-1" />
      <Button variant="primary" disabled={!key.trim()} onClick={() => void submit()}>{t('mods.cfKeySave')}</Button>
      <Button variant="ghost" onClick={() => attempt(() => api.app.openExternal('https://console.curseforge.com/'))}>{t('mods.cfKeyGet')}</Button>
    </div>
  )
}

export function CurseForgeSetup({ onSave }: { onSave: (key: string) => Promise<boolean> }) {
  const { t } = useApp()
  return (
    <section className="rounded-[16px] border border-line bg-card p-5">
      <h3 className="text-[14px] font-semibold">{t('mods.cfKeyTitle')}</h3>
      <p className="mb-4 mt-1 text-[13px] text-muted">{t('mods.cfKeyText')}</p>
      <CurseForgeKeyInput onSave={onSave} />
    </section>
  )
}

/* ---------- choosing a version ---------- */

export interface VersionTarget {
  source: ModSource
  projectId: string
  title: string
  /** set for an installed mod: the file to swap for the chosen version */
  file?: string
  versionId?: string
}

function VersionsDialog({ inst, target, onClose, onInstalled }: { inst: Instance; target?: VersionTarget; onClose: () => void; onInstalled?: (t: VersionTarget) => void }) {
  const { t, attempt, toast } = useApp()
  const [all, setAll] = useState(false)
  const [list, setList] = useState<ModVersion[]>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  useEffect(() => {
    if (!target) return
    let live = true
    setList(undefined)
    setError(undefined)
    api.mods.versions(inst.id, target.source, target.projectId, all).then(
      (l) => live && setList(l),
      (e: Error) => live && setError(e.message)
    )
    return () => { live = false }
  }, [inst.id, target, all])

  const pick = async (v: ModVersion) => {
    if (!target) return
    setBusy(v.id)
    const files = await attempt(() => (target.file ? api.mods.changeVersion(inst.id, target.file, target.source, target.projectId, v.id) : api.mods.install(inst.id, target.projectId, target.source, v.id)))
    setBusy(undefined)
    if (!files) return
    toast(target.file ? t('mods.changed', { name: target.title, v: v.version }) : t('mods.installedToast', { name: target.title, n: files.length }))
    if (!target.file) onInstalled?.(target)
    onClose()
  }

  const shortGame = (g: string[]) => (g.length > 4 ? `${g.slice(0, 4).join(', ')}…` : g.join(', '))
  return (
    <Modal open={!!target} onClose={onClose} title={t('mods.versionsTitle', { name: target?.title ?? '' })} width={600}>
      <label className="mb-3 flex items-center justify-between gap-3 text-[13px]">
        {t('mods.allGameVersions')}
        <Toggle label={t('mods.allGameVersions')} checked={all} onChange={setAll} />
      </label>
      {error ? (
        <p role="alert" className="text-[13px]">{t('mods.versionLoadError', { error })}</p>
      ) : !list ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[58px] rounded-[12px]" />)}</div>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">{t('mods.noVersions')}</p>
      ) : (
        <ul className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1">
          {list.map((v) => {
            const current = !!target?.versionId && target.versionId === v.id
            return (
              <li key={v.id} className="flex items-center gap-3 rounded-[12px] border border-line bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium">{v.version}</span>
                    <span className="shrink-0 rounded-full border border-line px-1.5 text-[11px] text-muted">{t(`mods.${v.channel}`)}</span>
                  </div>
                  <p className="truncate text-[12px] text-muted">
                    {[shortGame(v.game), v.compatible ? '' : t('mods.otherGame', { mc: inst.minecraft }), v.date && !Number.isNaN(Date.parse(v.date)) ? new Date(v.date).toLocaleDateString() : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {current ? (
                  <span className="inline-flex items-center gap-1 text-[12px]"><Check size={13} /> {t('mods.current')}</span>
                ) : (
                  <Button size="sm" disabled={!!busy} onClick={() => void pick(v)}>{busy === v.id ? t('mods.installing') : target?.file ? t('mods.switch') : t('mods.pick')}</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
