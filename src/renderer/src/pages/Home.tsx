import { motion } from 'framer-motion'
import { FolderOpen, Pencil, Plus, ScrollText, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Block } from '../components/Block'
import { InstanceDialog, LOADER_NAME } from '../components/InstanceDialog'
import { api, formatBytes, javaFor, useApp } from '../state'
import { Button, Empty, IconButton, Progress, Select, cx } from '../ui'

function useDark() {
  const q = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(q.matches)
  useEffect(() => {
    const f = () => setDark(q.matches)
    q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [q])
  return dark
}

export function Home() {
  const { t, account, instances, selected, setSettings, launch, attempt, dialogs } = useApp()
  const [dialog, setDialog] = useState<'new' | 'edit'>()
  const dark = useDark()
  const hour = new Date().getHours()
  const greeting = t(hour < 5 ? 'home.night' : hour < 12 ? 'home.morning' : hour < 18 ? 'home.day' : 'home.evening')

  const mine = launch.instanceId === selected?.id
  const busy = ['preparing', 'downloading', 'verifying', 'launching'].includes(launch.phase)
  const running = launch.phase === 'running'
  const otherBusy = (busy || running) && !mine

  const play = async () => {
    if (!selected) return
    if (!account) return dialogs.setAccounts(true)
    await attempt(() => api.launch.start(selected.id))
  }

  const label = mine && (busy || running) ? t(`phase.${launch.phase}`) : t('home.play')
  const progressText = mine && busy && launch.totalBytes ? `${formatBytes(launch.doneBytes ?? 0)} / ${formatBytes(launch.totalBytes)}` : undefined

  return (
    <div className="flex h-full flex-col">
      <header className="mb-6">
        <p className="text-[14px] text-muted">{account ? `${greeting}, ${account.name}` : greeting}</p>
        <h1 className="mt-1 text-[34px] leading-tight font-semibold tracking-[-0.025em]">{t('home.title')}</h1>
      </header>

      {!selected ? (
        <div className="flex flex-1 items-center justify-center rounded-[20px] border border-line bg-card">
          <Empty icon={<Plus size={20} />} title={t('home.emptyTitle')} text={t('home.emptyText')} action={<Button variant="primary" onClick={() => setDialog('new')}><Plus size={14} /> {t('instance.new')}</Button>} />
        </div>
      ) : (
        <>
          <section className="relative flex flex-1 items-center gap-10 overflow-hidden rounded-[20px] border border-line bg-card px-10 py-8">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="shrink-0">
              <Block size={200} dark={dark} />
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[24px] font-semibold tracking-[-0.02em]">{selected.name}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{selected.lastPlayed ? t('home.lastPlayed', { date: new Date(selected.lastPlayed).toLocaleDateString() }) : t('home.neverPlayed')}</p>
                </div>
                <div className="flex shrink-0">
                  <IconButton label={t('instance.edit')} onClick={() => setDialog('edit')}><Pencil size={15} /></IconButton>
                  <IconButton label={t('common.openFolder')} onClick={() => attempt(() => api.instances.open(selected.id))}><FolderOpen size={15} /></IconButton>
                  <IconButton label={t('logs.title')} onClick={() => dialogs.setLogs(true)}><ScrollText size={15} /></IconButton>
                </div>
              </div>
              <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5">
                <Field label={t('home.version')} value={selected.minecraft} />
                <Field label={t('instance.loader')} value={selected.loader === 'vanilla' ? LOADER_NAME.vanilla : `${LOADER_NAME[selected.loader]} ${selected.loaderVersion ?? ''}`} />
                <Field label="Java" value={selected.javaPath ? t('home.javaCustom') : `Java ${javaFor(selected.minecraft)}`} />
                <Field label={t('home.status')} value={running && mine ? t('phase.running') : selected.versionId ? t('home.installed') : t('home.notInstalled')} />
              </dl>
            </div>
          </section>

          <div className="mt-4 flex items-center gap-3">
            <Select
              up
              className="w-72"
              label={t('home.profile')}
              value={selected.id}
              onChange={(v) => setSettings({ selectedInstance: v })}
              options={instances.map((i) => ({ value: i.id, label: i.name, hint: i.minecraft }))}
              searchable={instances.length > 8}
            />
            <IconButton label={t('instance.new')} onClick={() => setDialog('new')} className="border border-line bg-card"><Plus size={15} /></IconButton>
            <div className="min-w-0 flex-1 px-2">
              {mine && busy && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3 text-[12px] text-muted">
                    <span className="truncate">{launch.detail ?? t(`phase.${launch.phase}`)}</span>
                    <span className="shrink-0">{progressText ?? (launch.progress !== undefined ? `${Math.round(launch.progress * 100)}%` : '')}</span>
                  </div>
                  <Progress value={launch.progress} />
                </div>
              )}
              {mine && launch.phase === 'error' && <p role="alert" className="line-clamp-2 text-[12px] text-fg">{launch.error}</p>}
              {otherBusy && <p className="text-[12px] text-muted">{t('home.otherBusy')}</p>}
            </div>
            {mine && busy && <IconButton label={t('common.cancel')} onClick={() => attempt(() => api.launch.cancel())}><X size={16} /></IconButton>}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={play}
              disabled={busy || running}
              className={cx('h-12 min-w-[176px] rounded-[14px] bg-fg px-8 text-[15px] font-semibold text-bg transition-opacity duration-150 hover:opacity-90', (busy || running) && 'cursor-default opacity-70 hover:opacity-70')}
            >
              {label}
            </motion.button>
          </div>
        </>
      )}

      <InstanceDialog open={dialog === 'new'} onClose={() => setDialog(undefined)} />
      <InstanceDialog open={dialog === 'edit'} onClose={() => setDialog(undefined)} edit={selected} />
    </div>
  )
}

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-[12px] text-muted">{label}</dt>
    <dd className="mt-0.5 truncate text-[15px] font-medium">{value}</dd>
  </div>
)
