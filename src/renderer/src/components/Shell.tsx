import { AnimatePresence, motion } from 'framer-motion'
import { Blocks, Boxes, Home, Layers, LogIn, Plus, Settings, Shirt, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, formatBytes, useApp, type Page } from '../state'
import { Button, IconButton, Input, Modal, Progress, cx } from '../ui'
import { Avatar } from './Avatar'
import iconUrl from '../assets/icon.svg'

export function AppIcon({ size = 22 }: { size?: number }) {
  return <img src={iconUrl} width={size} height={size} alt="" draggable={false} />
}

const NAV: { id: Page; icon: typeof Home }[] = [
  { id: 'home', icon: Home },
  { id: 'versions', icon: Layers },
  { id: 'mods', icon: Blocks },
  { id: 'packs', icon: Boxes },
  { id: 'skins', icon: Shirt },
  { id: 'settings', icon: Settings }
]

export function Sidebar() {
  const { page, go, t, account, dialogs } = useApp()
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="drag flex h-[52px] items-center gap-2.5 px-5">
        <AppIcon />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">AppleLauncher</span>
      </div>
      <nav aria-label={t('nav')} className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
        {NAV.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => go(id)}
            aria-current={page === id ? 'page' : undefined}
            className={cx('relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px] transition-colors duration-150', page === id ? 'text-fg' : 'text-muted hover:bg-hover hover:text-fg')}
          >
            {page === id && <motion.span layoutId="nav" transition={{ type: 'spring', stiffness: 550, damping: 45 }} className="absolute inset-0 rounded-[10px] bg-press" />}
            <Icon size={16} strokeWidth={1.75} className="relative" aria-hidden />
            <span className="relative">{t(`nav.${id}`)}</span>
          </button>
        ))}
      </nav>
      <button onClick={() => dialogs.setAccounts(true)} className="m-3 flex items-center gap-3 rounded-[14px] p-2.5 text-left transition-colors hover:bg-hover" aria-label={t('accounts.manage')}>
        {account ? <Avatar accountId={account.id} skinUrl={account.skinUrl} name={account.name} size={34} /> : <div className="grid size-[34px] place-items-center rounded-[8px] border border-line text-muted"><UserRound size={16} /></div>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{account?.name ?? t('accounts.none')}</div>
          <div className="truncate text-[12px] text-muted">{account ? t(account.offline ? 'accounts.offline' : account.valid ? 'accounts.licensed' : 'accounts.expired') : t('accounts.signInHint')}</div>
        </div>
      </button>
    </aside>
  )
}

/** Top strip: drag region plus a live indicator for background work. Native caption buttons sit on its right. */
export function TitleBar() {
  const { launch, jobs, t, attempt } = useApp()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const running = Object.values(jobs).filter((j) => !j.done)
  const busy = ['preparing', 'downloading', 'verifying', 'launching'].includes(launch.phase)
  const label = busy ? t(`phase.${launch.phase}`) + (launch.detail ? ` — ${launch.detail}` : '') : running[0]?.title
  const value = busy ? launch.progress : running[0]?.progress

  useEffect(() => {
    if (!label) setOpen(false)
  }, [label])
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', down)
    addEventListener('keydown', key)
    return () => {
      removeEventListener('pointerdown', down)
      removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="drag flex h-11 shrink-0 items-center justify-end pr-[150px]">
      <AnimatePresence>
        {label && (
          <motion.div ref={root} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="no-drag relative z-50 w-64">
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('downloads.title')} className="flex w-full flex-col gap-1 rounded-[8px] px-2 py-1 text-left transition-colors hover:bg-hover">
              <span className="flex w-full justify-between gap-2 text-[11px] text-muted">
                <span className="truncate">{label}</span>
                {value !== undefined && <span>{Math.round(value * 100)}%</span>}
              </span>
              <Progress value={value} />
            </button>
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.16 }}
                  className="glass absolute right-0 top-full z-50 mt-2 w-[360px] rounded-[16px] border border-line p-4 shadow-2xl"
                  role="dialog" aria-label={t('downloads.title')}
                >
                  {busy && (
                    <>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-semibold">{t(`phase.${launch.phase}`)}{launch.detail ? ` — ${launch.detail}` : ''}</span>
                        {value !== undefined && <span className="text-[12px] text-muted">{Math.round(value * 100)}%</span>}
                      </div>
                      <Progress value={value} />
                      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                        <span>{launch.totalBytes ? `${formatBytes(launch.doneBytes ?? 0)} / ${formatBytes(launch.totalBytes)}` : ''}</span>
                        <span>{launch.filesDone ? t('downloads.filesDone', { n: launch.filesDone }) : ''}</span>
                      </div>
                      <ul className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
                        {(launch.files ?? []).map((f) => (
                          <li key={f.name}>
                            <div className="flex justify-between gap-3 text-[12px]">
                              <span className="truncate" title={f.name}>{/^[0-9a-f]{40}$/.test(f.name) ? t('downloads.asset', { id: f.name.slice(0, 8) }) : f.name}</span>
                              <span className="shrink-0 text-muted">{f.total ? formatBytes(f.total) : ''}</span>
                            </div>
                            <Progress value={f.total ? f.done / f.total : undefined} className="mt-1 h-[3px]" />
                          </li>
                        ))}
                        {!launch.files?.length && <li className="text-[12px] text-muted">{t('downloads.waiting')}</li>}
                      </ul>
                      <Button size="sm" className="mt-3 w-full" onClick={() => attempt(() => api.launch.cancel())}>{t('common.cancel')}</Button>
                    </>
                  )}
                  {running.length > 0 && (
                    <ul className={cx('space-y-2.5', busy && 'mt-4 border-t border-line pt-3')}>
                      {running.map((j) => (
                        <li key={j.id}>
                          <div className="flex justify-between gap-3 text-[12px]">
                            <span className="truncate" title={j.title}>{j.title}</span>
                            {j.progress !== undefined && <span className="shrink-0 text-muted">{Math.round(j.progress * 100)}%</span>}
                          </div>
                          <Progress value={j.progress} className="mt-1 h-[3px]" />
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AccountsDialog() {
  const { dialogs, accounts, account, setSettings, reloadAccounts, attempt, t, toast } = useApp()
  const [waiting, setWaiting] = useState(false)
  const [nick, setNick] = useState('')
  const licensed = accounts.some((a) => !a.offline)
  const nickOk = /^[A-Za-z0-9_]{3,16}$/.test(nick)
  const addOffline = async () => {
    const acc = await attempt(() => api.accounts.addOffline(nick))
    if (acc) {
      setNick('')
      await reloadAccounts()
      await setSettings({ selectedAccount: acc.id })
    }
  }
  const login = async () => {
    setWaiting(true)
    const acc = await attempt(() => api.accounts.login())
    setWaiting(false)
    if (acc) {
      await reloadAccounts()
      await setSettings({ selectedAccount: acc.id })
      toast(t('accounts.welcome', { name: acc.name }))
    }
  }
  return (
    <Modal open={dialogs.accounts} onClose={() => dialogs.setAccounts(false)} title={t('accounts.title')}>
      <div className="flex flex-col gap-1.5">
        {accounts.map((a) => (
          <div key={a.id} className={cx('flex items-center gap-3 rounded-[14px] border p-2.5 transition-colors', a.id === account?.id ? 'border-fg/30 bg-hover' : 'border-line')}>
            <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setSettings({ selectedAccount: a.id })} aria-pressed={a.id === account?.id}>
              <Avatar accountId={a.id} skinUrl={a.skinUrl} name={a.name} size={36} />
              <div>
                <div className="text-[13px] font-medium">{a.name}</div>
                <div className="text-[12px] text-muted">{t(a.offline ? 'accounts.offline' : a.valid ? 'accounts.licensed' : 'accounts.expired')}</div>
              </div>
            </button>
            <IconButton label={t('accounts.signOut')} onClick={async () => { await attempt(() => api.accounts.logout(a.id)); await reloadAccounts() }}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        {accounts.length === 0 && <p className="py-2 text-[13px] text-muted">{t('accounts.empty')}</p>}
      </div>
      <Button variant="primary" className="mt-4 w-full" onClick={login} disabled={waiting}>
        {waiting ? t('accounts.waiting') : <><LogIn size={14} /> {accounts.length ? t('accounts.add') : t('accounts.signIn')}</>}
      </Button>
      <p className="mt-3 text-[12px] text-muted">{t('accounts.privacy')}</p>
      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[13px] font-medium">{t('accounts.offlineTitle')}</div>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nickOk) void addOffline() }}>
          <Input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={16} disabled={!licensed} placeholder={t('accounts.offlineNick')} aria-label={t('accounts.offlineNick')} className="flex-1" />
          <Button type="submit" disabled={!licensed || !nickOk}>{t('accounts.offlineAdd')}</Button>
        </form>
        <p className="mt-2 text-[12px] text-muted">{t(licensed ? 'accounts.offlineHint' : 'accounts.offlineLocked')}</p>
      </div>
    </Modal>
  )
}

export function LogDialog() {
  const { dialogs, t } = useApp()
  const [lines, setLines] = useState<string[]>([])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!dialogs.logs) return
    void api.launch.logs().then(setLines)
    return api.launch.onLog((l) => setLines((all) => [...all.slice(-4999), l]))
  }, [dialogs.logs])
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [lines])
  return (
    <Modal
      open={dialogs.logs}
      onClose={() => dialogs.setLogs(false)}
      title={t('logs.title')}
      width={820}
      footer={<><Button onClick={() => navigator.clipboard.writeText(lines.join('\n'))}>{t('logs.copy')}</Button><Button onClick={() => api.app.openLogs()}>{t('logs.folder')}</Button></>}
    >
      <div className="selectable h-[52vh] overflow-auto rounded-[12px] border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-muted">
        {lines.length === 0 ? t('logs.empty') : lines.map((l, i) => <div key={i} className={cx('whitespace-pre-wrap', /ERROR|Exception|FATAL/.test(l) && 'text-fg')}>{l}</div>)}
        <div ref={end} />
      </div>
    </Modal>
  )
}

export function Toasts() {
  const { toasts } = useApp()
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            role={x.kind === 'error' ? 'alert' : 'status'}
            className={cx('glass pointer-events-auto rounded-[14px] border px-4 py-3 text-[13px] shadow-[var(--shadow-pop)]', x.kind === 'error' ? 'border-fg/40' : 'border-line')}
          >
            {x.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export const AddIcon = Plus
