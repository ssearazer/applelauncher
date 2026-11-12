import { useEffect, useMemo, useState } from 'react'
import { LOADERS, type Instance, type Loader, type McVersion } from '../../../shared/types'
import { api, useApp } from '../state'
import { Button, Input, Modal, Row, Segmented, Select, Toggle } from '../ui'

export const LOADER_NAME: Record<Loader, string> = { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }

let mcCache: Promise<McVersion[]> | undefined
export function useMinecraftVersions() {
  const [list, setList] = useState<McVersion[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    mcCache ??= api.versions.minecraft()
    mcCache.then(setList, (e: Error) => {
      mcCache = undefined
      setError(e.message)
    })
  }, [])
  return { list, error }
}

/** Create a new instance, or edit an existing one's name and overrides. */
export function InstanceDialog({ open, onClose, edit, preset, onCreated }: {
  open: boolean
  onClose: () => void
  edit?: Instance
  preset?: { minecraft?: string; loader?: Loader }
  onCreated?: (i: Instance) => void
}) {
  const { t, attempt, reloadInstances, setSettings, toast } = useApp()
  const { list } = useMinecraftVersions()
  const [name, setName] = useState('')
  const [mc, setMc] = useState('')
  const [loader, setLoader] = useState<Loader>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState<string>()
  const [loaderVersions, setLoaderVersions] = useState<string[]>()
  const [snapshots, setSnapshots] = useState(false)
  const [memory, setMemory] = useState('')
  const [javaPath, setJavaPath] = useState('')
  const [jvmArgs, setJvmArgs] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(edit?.name ?? '')
    setMc(edit?.minecraft ?? preset?.minecraft ?? '')
    setLoader(edit?.loader ?? preset?.loader ?? 'vanilla')
    setMemory(edit?.memory ? String(edit.memory) : '')
    setJavaPath(edit?.javaPath ?? '')
    setJvmArgs(edit?.jvmArgs ?? '')
  }, [open, edit, preset])

  useEffect(() => {
    if (!mc && list) setMc(list.find((v) => v.type === 'release')?.id ?? '')
  }, [list, mc])

  useEffect(() => {
    setLoaderVersion(undefined)
    setLoaderVersions(undefined)
    if (edit || loader === 'vanilla' || !mc) return
    let live = true
    api.versions.loaders(loader, mc).then(
      (v) => live && (setLoaderVersions(v), setLoaderVersion(v[0])),
      () => live && setLoaderVersions([])
    )
    return () => {
      live = false
    }
  }, [loader, mc, edit])

  const options = useMemo(
    () => (list ?? []).filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot') || v.id === mc).map((v) => ({ value: v.id, label: v.id, hint: v.type === 'snapshot' ? t('versions.snapshot') : undefined })),
    [list, snapshots, mc, t]
  )

  const submit = async () => {
    setBusy(true)
    if (edit) {
      const mem = Number(memory)
      const r = await attempt(() => api.instances.update(edit.id, { name: name.trim() || edit.name, memory: memory ? Math.round(mem) : 0, javaPath, jvmArgs }))
      if (r) toast(t('instance.saved'))
    } else {
      const r = await attempt(() => api.instances.create({ name: name.trim() || `${LOADER_NAME[loader]} ${mc}`, minecraft: mc, loader, loaderVersion }))
      if (r) {
        await setSettings({ selectedInstance: r.id })
        onCreated?.(r)
      }
    }
    await reloadInstances()
    setBusy(false)
    onClose()
  }

  const noLoader = !edit && loader !== 'vanilla' && loaderVersions?.length === 0
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={edit ? t('instance.edit') : t('instance.new')}
      width={500}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" onClick={submit} disabled={busy || !mc || noLoader || (!edit && loader !== 'vanilla' && !loaderVersion)}>{edit ? t('common.save') : t('instance.create')}</Button></>}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">{t('instance.name')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={edit?.name ?? `${LOADER_NAME[loader]} ${mc}`} />
        </label>
        {!edit ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">{t('instance.loader')}</span>
              <Segmented label={t('instance.loader')} value={loader} onChange={setLoader} options={LOADERS.map((l) => ({ value: l, label: LOADER_NAME[l] }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">Minecraft</span>
                <Select label="Minecraft" value={mc} onChange={setMc} options={options} searchable loading={!list} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">{t('instance.loaderVersion')}</span>
                <Select
                  label={t('instance.loaderVersion')}
                  value={loaderVersion}
                  onChange={setLoaderVersion}
                  options={(loaderVersions ?? []).map((v) => ({ value: v, label: v }))}
                  searchable
                  loading={loader !== 'vanilla' && !loaderVersions}
                  placeholder={loader === 'vanilla' ? t('instance.noLoader') : t('instance.pick')}
                />
              </div>
            </div>
            <div className="rounded-[14px] border border-line">
              <Row label={t('instance.showSnapshots')}><Toggle label={t('instance.showSnapshots')} checked={snapshots} onChange={setSnapshots} /></Row>
            </div>
            {noLoader && <p className="text-[12px] text-muted">{t('instance.loaderMissing', { loader: LOADER_NAME[loader], mc })}</p>}
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">{t('instance.memory')}</span>
              <Input type="number" min={512} max={65536} step={256} value={memory} onChange={(e) => setMemory(e.target.value)} placeholder={t('instance.useGlobal')} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">{t('settings.java')}</span>
              <div className="flex gap-2">
                <Input className="flex-1" value={javaPath} readOnly placeholder={t('settings.javaAuto')} />
                <Button onClick={async () => { const p = await attempt(() => api.app.pickJava()); if (p) setJavaPath(p) }}>{t('common.choose')}</Button>
                {javaPath && <Button variant="ghost" onClick={() => setJavaPath('')}>{t('common.reset')}</Button>}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">{t('settings.jvmArgs')}</span>
              <Input value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} placeholder={t('instance.useGlobal')} maxLength={2000} />
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}
