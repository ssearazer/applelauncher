import { Blocks, Check, Download, Package, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Instance, ModFile, ModrinthHit } from '../../../shared/types'
import { LOADER_NAME } from '../components/InstanceDialog'
import { api, formatBytes, useApp } from '../state'
import { Button, Empty, IconButton, PageHeader, SearchField, Segmented, Select, Skeleton, Toggle, cx } from '../ui'

export const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n)

export function ModIcon({ url, size = 40 }: { url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  return url && !broken ? (
    <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-[10px] border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-[10px] border border-line bg-hover text-muted" style={{ width: size, height: size }}><Package size={size / 2.4} /></div>
  )
}

/** Debounced Modrinth search with paging, shared by the mods and packs pages. */
export function useModrinth(type: 'mod' | 'modpack', instanceId: string | undefined, compatibleOnly: boolean) {
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
        const r = await api.mods.search(q, instanceId, type, offset, compatibleOnly)
        if (n !== req.current) return
        setHits((h) => (offset ? [...(h ?? []), ...r.hits] : r.hits))
        setTotal(r.total)
      } catch (e) {
        if (n === req.current) setError((e as Error).message), setHits((h) => h ?? [])
      }
    },
    [q, instanceId, type, compatibleOnly]
  )
  useEffect(() => {
    const h = setTimeout(() => void load(0), 300)
    return () => clearTimeout(h)
  }, [load])
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
        <Segmented label={t('nav.mods')} value={tab} onChange={setTab} options={[{ value: 'installed', label: t('mods.installed') }, { value: 'browse', label: 'Modrinth' }]} />
      </div>
      {tab === 'installed' ? <InstalledMods inst={inst} onBrowse={() => setTab('browse')} /> : <BrowseMods inst={inst} />}
    </div>
  )
}

export function InstalledMods({ inst, onBrowse }: { inst: Instance; onBrowse?: () => void }) {
  const { t, attempt, jobs } = useApp()
  const [mods, setMods] = useState<ModFile[]>()
  const [q, setQ] = useState('')
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
            <Toggle label={t('mods.enabled', { name: m.title })} checked={m.enabled} onChange={async () => { await attempt(() => api.mods.toggle(inst.id, m.file)); await reload() }} />
            <IconButton label={t('common.remove')} onClick={async () => { if (confirm(t('mods.confirmRemove', { name: m.title }))) { await attempt(() => api.mods.remove(inst.id, m.file)); await reload() } }}>
              <Trash2 size={15} />
            </IconButton>
          </li>
        ))}
      </ul>
    </>
  )
}

function BrowseMods({ inst }: { inst: Instance }) {
  const { t, attempt, jobs, toast } = useApp()
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const { q, setQ, hits, total, error, more } = useModrinth('mod', inst.id, compatibleOnly)
  const [done, setDone] = useState<Set<string>>(new Set())

  const install = async (h: ModrinthHit) => {
    const files = await attempt(() => api.mods.install(inst.id, h.project_id))
    if (files) {
      setDone((s) => new Set(s).add(h.project_id))
      toast(t('mods.installedToast', { name: h.title, n: files.length }))
    }
  }
  return (
    <>
      <div className="mb-3 flex items-center gap-4">
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
                      {done.has(h.project_id) ? (
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
    </>
  )
}
