import { Download, FolderOpen, HardDrive, ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InstalledVersion, Loader } from '../../../shared/types'
import { InstanceDialog, LOADER_NAME, useMinecraftVersions } from '../components/InstanceDialog'
import { api, formatBytes, useApp } from '../state'
import { Button, IconButton, PageHeader, SearchField, Segmented, Skeleton } from '../ui'

type Kind = 'release' | 'snapshot' | Exclude<Loader, 'vanilla'>
const KINDS: { value: Kind; label: string }[] = [
  { value: 'release', label: 'Release' },
  { value: 'snapshot', label: 'Snapshot' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'quilt', label: 'Quilt' }
]

export function Versions() {
  const { t, settings, setSettings, attempt, instances, launch, toast, go } = useApp()
  const { list, error } = useMinecraftVersions()
  const [installed, setInstalled] = useState<InstalledVersion[]>()
  const [kind, setKind] = useState<Kind>('release')
  const [q, setQ] = useState('')
  const [preset, setPreset] = useState<{ minecraft: string; loader: Loader }>()

  const reload = useCallback(async () => setInstalled(await api.versions.installed().catch(() => [])), [])
  useEffect(() => {
    void reload()
  }, [reload, settings.gameDir])
  useEffect(() => {
    if (launch.phase === 'idle' || launch.phase === 'running') void reload()
  }, [launch.phase, reload])

  const catalog = useMemo(() => {
    const type = kind === 'snapshot' ? 'snapshot' : 'release'
    return (list ?? []).filter((v) => v.type === type && v.id.includes(q.trim())).slice(0, 200)
  }, [list, kind, q])

  const remove = async (v: InstalledVersion) => {
    if (v.usedBy.length && !confirm(t('versions.removeUsed', { id: v.id, n: v.usedBy.length }))) return
    if (await attempt(async () => (await api.versions.remove(v.id), true))) toast(t('versions.removed', { id: v.id }))
    await reload()
  }
  const changeDir = async () => {
    const dir = await attempt(() => api.app.pickDir())
    if (dir) await setSettings({ gameDir: dir })
  }

  const totalSize = installed?.reduce((s, v) => s + v.size, 0) ?? 0
  const busy = ['preparing', 'downloading', 'verifying', 'launching'].includes(launch.phase)

  return (
    <div>
      <PageHeader title={t('nav.versions')} subtitle={t('versions.subtitle')} />

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{t('versions.installed')}</h2>
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <HardDrive size={14} aria-hidden />
            <span className="max-w-[320px] truncate" title={settings.gameDir}>{settings.gameDir}</span>
            <span>{formatBytes(totalSize)}</span>
            <Button size="sm" onClick={changeDir}>{t('versions.changeDir')}</Button>
            <IconButton label={t('common.openFolder')} onClick={() => attempt(() => api.app.openGameDir())}><FolderOpen size={15} /></IconButton>
          </div>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-line bg-card">
          {!installed ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-[10px]" />)}</div>
          ) : installed.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-muted">{t('versions.noneInstalled')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {installed.map((v) => {
                const users = instances.filter((i) => v.usedBy.includes(i.id))
                return (
                  <li key={v.id} className="flex h-12 items-center gap-4 px-4">
                    <span className="flex-1 truncate text-[13px] font-medium">{v.id}</span>
                    <span className="w-56 truncate text-[12px] text-muted">{users.length ? users.map((u) => u.name).join(', ') : t('versions.unused')}</span>
                    <span className="w-20 text-right text-[12px] text-muted">{formatBytes(v.size)}</span>
                    {users[0] && (
                      <IconButton label={t('versions.verify')} disabled={busy} onClick={async () => { if (await attempt(async () => (await api.launch.verify(users[0].id), true))) toast(t('versions.verified')) }}>
                        <ShieldCheck size={15} />
                      </IconButton>
                    )}
                    <IconButton label={t('common.remove')} disabled={busy} onClick={() => remove(v)}><Trash2 size={15} /></IconButton>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 text-[15px] font-semibold">{t('versions.catalog')}</h2>
          <SearchField value={q} onChange={setQ} placeholder={t('versions.search')} className="w-56" />
          <Segmented label={t('versions.kind')} value={kind} onChange={setKind} options={KINDS} />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-line bg-card">
          {error ? (
            <p role="alert" className="px-4 py-5 text-[13px]">{t('versions.loadError', { error })}</p>
          ) : !list ? (
            <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 rounded-[10px]" />)}</div>
          ) : catalog.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-muted">{t('common.nothingFound')}</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {catalog.map((v) => {
                const loader: Loader = kind === 'release' || kind === 'snapshot' ? 'vanilla' : kind
                const id = loader === 'vanilla' ? v.id : `${LOADER_NAME[loader]} ${v.id}`
                const have = loader === 'vanilla' && installed?.some((x) => x.id === v.id)
                return (
                  <li key={v.id} className="flex h-11 items-center gap-4 px-4">
                    <span className="flex-1 text-[13px] font-medium">{id}</span>
                    <span className="text-[12px] text-muted">{new Date(v.releaseTime).toLocaleDateString()}</span>
                    {have ? (
                      <span className="w-28 text-right text-[12px] text-muted">{t('home.installed')}</span>
                    ) : (
                      <Button size="sm" className="w-28" onClick={() => setPreset({ minecraft: v.id, loader })}><Download size={13} /> {t('versions.install')}</Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <p className="mt-2 px-1 text-[12px] text-muted">{t('versions.installHint')}</p>
      </section>

      <InstanceDialog
        open={!!preset}
        preset={preset}
        onClose={() => setPreset(undefined)}
        onCreated={async (i) => {
          go('home')
          await attempt(() => api.launch.verify(i.id))
          await reload()
        }}
      />
    </div>
  )
}
