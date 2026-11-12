import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Api } from '../../preload/index'
import type { Account, Instance, JobState, LaunchState, Settings } from '../../shared/types'
import { makeT, type T } from './i18n'

declare global {
  interface Window { api: Api }
}
export const api = window.api

export type Page = 'home' | 'versions' | 'mods' | 'packs' | 'skins' | 'settings'
export interface Toast { id: number; text: string; kind: 'info' | 'error' }

interface Ctx {
  settings: Settings
  setSettings: (p: Partial<Settings>) => Promise<void>
  instances: Instance[]
  reloadInstances: () => Promise<void>
  selected?: Instance
  accounts: Account[]
  reloadAccounts: () => Promise<void>
  account?: Account
  launch: LaunchState
  jobs: Record<string, JobState>
  page: Page
  go: (p: Page) => void
  toast: (text: string, kind?: Toast['kind']) => void
  toasts: Toast[]
  /** run an action and turn a failure into an error toast */
  attempt: <R>(fn: () => Promise<R>) => Promise<R | undefined>
  t: T
  dialogs: { accounts: boolean; logs: boolean; setAccounts: (v: boolean) => void; setLogs: (v: boolean) => void }
}

const AppCtx = createContext<Ctx>(null as never)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setLocal] = useState<Settings>()
  const [instances, setInstances] = useState<Instance[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [launch, setLaunch] = useState<LaunchState>({ phase: 'idle' })
  const [jobs, setJobs] = useState<Record<string, JobState>>({})
  const [page, go] = useState<Page>('home')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const seq = useRef(0)

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500)
  }, [])
  const attempt = useCallback(
    async <R,>(fn: () => Promise<R>) => {
      try {
        return await fn()
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error')
        return undefined
      }
    },
    [toast]
  )

  const reloadInstances = useCallback(async () => setInstances(await api.instances.list()), [])
  const reloadAccounts = useCallback(async () => setAccounts(await api.accounts.list()), [])

  useEffect(() => {
    void api.settings.get().then(setLocal)
    void reloadInstances()
    void reloadAccounts()
    void api.launch.state().then(setLaunch)
    const offState = api.launch.onState((s) => {
      setLaunch(s)
      if (s.phase === 'idle' || s.phase === 'error') void reloadInstances()
    })
    const offJob = api.app.onJob((j) => setJobs((all) => ({ ...all, [j.id]: j })))
    return () => {
      offState()
      offJob()
    }
  }, [reloadInstances, reloadAccounts])

  const setSettings = useCallback(
    async (p: Partial<Settings>) => {
      const next = await attempt(() => api.settings.set(p))
      if (next) setLocal(next)
    },
    [attempt]
  )

  const t = useMemo(() => makeT(settings?.language ?? 'ru'), [settings?.language])

  if (!settings) return null
  const selected = instances.find((i) => i.id === settings.selectedInstance) ?? instances[0]
  const account = accounts.find((a) => a.id === settings.selectedAccount) ?? accounts[0]

  return (
    <AppCtx.Provider
      value={{
        settings, setSettings, instances, reloadInstances, selected, accounts, reloadAccounts, account, launch, jobs,
        page, go, toast, toasts, attempt, t,
        dialogs: { accounts: accountsOpen, logs: logsOpen, setAccounts: setAccountsOpen, setLogs: setLogsOpen }
      }}
    >
      {children}
    </AppCtx.Provider>
  )
}

export const formatBytes = (n: number) => {
  if (n < 1024) return `${n} Б`
  const u = ['КБ', 'МБ', 'ГБ']
  let i = -1
  do {
    n /= 1024
    i++
  } while (n >= 1024 && i < u.length - 1)
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`
}

export { javaFor } from '../../shared/pure'
