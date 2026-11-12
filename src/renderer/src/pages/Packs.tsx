import { Blocks, Boxes, Download, FileArchive, FileDown, FolderInput, FileUp, FolderOpen, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Instance } from '../../../shared/types'
import { InstanceDialog, LOADER_NAME } from '../components/InstanceDialog'
import { api, useApp } from '../state'
import { Button, Empty, IconButton, Modal, PageHeader, SearchField, Segmented, Skeleton } from '../ui'
import { InstalledMods, ModIcon, compact, useModrinth } from './Mods'

export function Packs() {
  const { t, attempt, reloadInstances, setSettings, toast } = useApp()
  const [tab, setTab] = useState<'mine' | 'browse'>('mine')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  const importPack = async (kind: 'archive' | 'prism' | 'tlauncher') => {
    setImporting(false)
    const inst = await attempt(() => api.instances.importPack(kind))
    if (inst) {
      await reloadInstances()
      await setSettings({ selectedInstance: inst.id })
      toast(t('packs.imported', { name: inst.name }))
    }
  }
  return (
    <div>
      <PageHeader title={t('nav.packs')} subtitle={t('packs.subtitle')}>
        <Button onClick={() => setImporting(true)}><FileUp size={14} /> {t('packs.import')}</Button>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> {t('instance.new')}</Button>
      </PageHeader>
      <div className="mb-4">
        <Segmented label={t('nav.packs')} value={tab} onChange={setTab} options={[{ value: 'mine', label: t('packs.mine') }, { value: 'browse', label: 'Modrinth' }]} />
      </div>
      {tab === 'mine' ? <MyPacks onCreate={() => setCreating(true)} /> : <BrowsePacks onInstalled={() => setTab('mine')} />}
      <InstanceDialog open={creating} onClose={() => setCreating(false)} />
      <Modal open={importing} onClose={() => setImporting(false)} title={t('packs.importTitle')}>
        <div className="flex flex-col gap-1.5">
          {([
            ['archive', <FileArchive key="a" size={18} />, t('packs.fromFile'), t('packs.fromFileHint')],
            ['prism', <FolderInput key="p" size={18} />, 'Prism Launcher', t('packs.fromPrismHint')],
            ['tlauncher', <FolderInput key="t" size={18} />, 'TLauncher', t('packs.fromTlHint')]
          ] as const).map(([kind, icon, title, hint]) => (
            <button key={kind} onClick={() => importPack(kind)} className="flex items-center gap-3 rounded-[14px] border border-line p-3 text-left transition-colors hover:bg-hover">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-hover text-muted">{icon}</span>
              <span>
                <span className="block text-[13px] font-medium">{title}</span>
                <span className="block text-[12px] text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted">{t('packs.importNote')}</p>
      </Modal>
    </div>
  )
}

function MyPacks({ onCreate }: { onCreate: () => void }) {
  const { t, instances, selected, attempt, reloadInstances, setSettings, go, toast } = useApp()
  const [edit, setEdit] = useState<Instance>()
  const [mods, setMods] = useState<Instance>()
  const [removing, setRemoving] = useState<Instance>()

  if (!instances.length) return <Empty icon={<Boxes size={20} />} title={t('packs.empty')} text={t('packs.emptyText')} action={<Button variant="primary" onClick={onCreate}>{t('instance.new')}</Button>} />

  const remove = async (files: boolean) => {
    if (!removing) return
    await attempt(() => api.instances.remove(removing.id, files))
    await reloadInstances()
    setRemoving(undefined)
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-3">
        {instances.map((i) => (
          <li key={i.id} className="flex flex-col rounded-[16px] border border-line bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-hover text-muted"><Boxes size={18} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[14px] font-semibold">{i.name}</h3>
                <p className="text-[12px] text-muted">{i.loader === 'vanilla' ? `Minecraft ${i.minecraft}` : `${LOADER_NAME[i.loader]} ${i.loaderVersion ?? ''}, Minecraft ${i.minecraft}`}</p>
              </div>
              {i.id === selected?.id && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{t('packs.selected')}</span>}
            </div>
            <p className="mt-3 text-[12px] text-muted">
              {[i.memory ? `${(i.memory / 1024).toFixed(1)} ${t('settings.gb')} RAM` : t('packs.globalRam'), i.javaPath ? t('home.javaCustom') : t('packs.autoJava')].join(', ')}
            </p>
            <div className="mt-4 flex items-center gap-1">
              <Button size="sm" variant="primary" onClick={async () => { await setSettings({ selectedInstance: i.id }); go('home') }}><Play size={12} /> {t('packs.open')}</Button>
              <span className="flex-1" />
              {i.loader !== 'vanilla' && <IconButton label={t('nav.mods')} onClick={() => setMods(i)}><Blocks size={15} /></IconButton>}
              <IconButton label={t('instance.edit')} onClick={() => setEdit(i)}><Pencil size={15} /></IconButton>
              <IconButton label={t('common.openFolder')} onClick={() => attempt(() => api.instances.open(i.id))}><FolderOpen size={15} /></IconButton>
              <IconButton label={t('packs.export')} onClick={async () => { if (await attempt(() => api.instances.exportPack(i.id))) toast(t('packs.exported')) }}><FileDown size={15} /></IconButton>
              <IconButton label={t('common.remove')} onClick={() => setRemoving(i)}><Trash2 size={15} /></IconButton>
            </div>
          </li>
        ))}
      </ul>
      <InstanceDialog open={!!edit} edit={edit} onClose={() => setEdit(undefined)} />
      <Modal open={!!mods} onClose={() => setMods(undefined)} title={mods ? t('packs.modsOf', { name: mods.name }) : ''} width={720}>
        {mods && <div className="max-h-[60vh]"><InstalledMods inst={mods} /></div>}
      </Modal>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(undefined)}
        title={t('packs.removeTitle')}
        footer={<><Button onClick={() => setRemoving(undefined)}>{t('common.cancel')}</Button><Button onClick={() => remove(false)}>{t('packs.removeKeep')}</Button><Button variant="primary" onClick={() => remove(true)}>{t('packs.removeAll')}</Button></>}
      >
        <p className="text-[13px] text-muted">{t('packs.removeText', { name: removing?.name ?? '' })}</p>
      </Modal>
    </>
  )
}

function BrowsePacks({ onInstalled }: { onInstalled: () => void }) {
  const { t, attempt, jobs, reloadInstances, setSettings, toast } = useApp()
  const { q, setQ, hits, total, error, more } = useModrinth('modpack', undefined, false)
  const install = async (id: string) => {
    const inst = await attempt(() => api.instances.installPack(id))
    if (!inst) return
    await reloadInstances()
    await setSettings({ selectedInstance: inst.id })
    toast(t('packs.imported', { name: inst.name }))
    onInstalled()
  }
  return (
    <>
      <SearchField value={q} onChange={setQ} placeholder={t('packs.search')} className="mb-3" />
      {error && <p role="alert" className="mb-3 text-[13px]">{t('mods.searchError', { error })}</p>}
      {!hits ? (
        <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-[14px]" />)}</div>
      ) : hits.length === 0 && !error ? (
        <p className="py-10 text-center text-[13px] text-muted">{t('common.nothingFound')}</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {hits.map((h) => {
              const job = jobs[`pack:${h.project_id}`]
              const running = job && !job.done
              return (
                <li key={h.project_id} className="flex gap-3 rounded-[14px] border border-line bg-card p-3">
                  <ModIcon url={h.icon_url} size={48} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{h.title}</span>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{h.description}</p>
                    <div className="mt-auto flex items-center gap-3 pt-2 text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1"><Download size={12} aria-hidden />{compact(h.downloads)}</span>
                      <span className="truncate">{h.versions.at(-1)}</span>
                      <span className="flex-1" />
                      <Button size="sm" disabled={running} onClick={() => install(h.project_id)}>
                        {running ? `${Math.round((job.progress ?? 0) * 100)}%` : t('versions.install')}
                      </Button>
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
