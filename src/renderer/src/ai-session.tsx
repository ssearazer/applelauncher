import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AiBuildResult, AiPlan, AiStep } from '../../shared/types'
import { AI_CATEGORIES } from './ai-categories'
import { api, useApp } from './state'

/*
 * The assistant's session lives here, above every page, so it keeps running when the player leaves the Packs tab:
 * the agent itself works in the main process, and this provider keeps what it reports (steps, plan, progress, result).
 */

export type AiPhase = 'idle' | 'planning' | 'ready' | 'building' | 'done'

interface AiCtx {
  phase: AiPhase
  prompt: string
  setPrompt: (s: string) => void
  /** themes picked as chips; any number of them are combined into one request */
  categories: Set<string>
  toggleCategory: (id: string) => void
  clearCategories: () => void
  /** true when there is something to send: a typed request or at least one theme */
  canRun: boolean
  /** profile to add mods to; undefined means "create a new modpack" */
  baseId?: string
  setBaseId: (id?: string) => void
  steps: AiStep[]
  plan?: AiPlan
  picked: Set<string>
  toggle: (id: string) => void
  error?: string
  result?: AiBuildResult
  run: () => Promise<void>
  stop: () => void
  build: () => Promise<void>
  discard: () => void
  dismiss: () => void
  /** the builder page is on screen, so the corner widget stays hidden */
  setViewing: (v: boolean) => void
  viewing: boolean
  /** asks the Packs page to show the assistant tab */
  openBuilder: () => void
  pendingOpen: boolean
  clearOpen: () => void
}

const AiContext = createContext<AiCtx>(null as never)
export const useAi = () => useContext(AiContext)

export function AiProvider({ children }: { children: ReactNode }) {
  const { t, go, toast, reloadInstances, setSettings } = useApp()
  const [phase, setPhase] = useState<AiPhase>('idle')
  const [prompt, setPrompt] = useState('')
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [baseId, setBaseId] = useState<string>()
  const [steps, setSteps] = useState<AiStep[]>([])
  const [plan, setPlan] = useState<AiPlan>()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<AiBuildResult>()
  const [viewing, setViewing] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const stopped = useRef(false)
  const viewingRef = useRef(false)
  viewingRef.current = viewing

  useEffect(() => api.ai.onStep((s) => setSteps((all) => [...all, s])), [])

  // the typed text plus the text of every picked theme, in the catalogue's order
  const themes = AI_CATEGORIES.filter((c) => categories.has(c.id)).map((c) => t(c.text))
  const request = [prompt.trim(), themes.length ? `${t('ai.catsLead')}${themes.join('; ')}` : ''].filter(Boolean).join('\n\n')
  const canRun = request.length >= 3

  const run = async () => {
    if (!canRun || phase === 'planning' || phase === 'building') return
    stopped.current = false
    setError(undefined)
    setPlan(undefined)
    setResult(undefined)
    setSteps([])
    setPhase('planning')
    try {
      const p = await api.ai.plan(request, baseId)
      setPlan(p)
      setPicked(new Set(p.mods.map((m) => m.projectId)))
      setPhase('ready')
      if (!viewingRef.current) toast(t('aiDock.ready'))
    } catch (e) {
      if (!stopped.current) setError((e as Error).message)
      setPhase('idle')
    }
  }

  const stop = () => {
    stopped.current = true
    void api.ai.cancel().catch(() => undefined)
  }

  const build = async () => {
    if (!plan || phase !== 'ready') return
    stopped.current = false
    setPhase('building')
    try {
      const r = await api.ai.build(plan.id, plan.mods.map((m) => m.projectId).filter((id) => picked.has(id)))
      await reloadInstances()
      if (!r.extended) await setSettings({ selectedInstance: r.instance.id })
      toast(t(r.extended ? 'ai.addedToast' : 'ai.built', { name: r.instance.name, n: r.files }))
      if (r.skipped.length) toast(t('ai.skipped', { list: r.skipped.join(', ') }), 'error')
      setResult(r)
      setPlan(undefined)
      setSteps([])
      setPrompt('')
      setCategories(new Set())
      setPhase('done')
    } catch (e) {
      if (!stopped.current) toast((e as Error).message, 'error')
      setPhase('ready') // the plan is still valid: the player can try again
    }
  }

  const reset = () => {
    setPlan(undefined)
    setResult(undefined)
    setError(undefined)
    setSteps([])
    setPhase('idle')
  }

  const value: AiCtx = {
    phase, prompt, setPrompt, baseId, setBaseId, categories, canRun, clearCategories: () => setCategories(new Set()), steps, plan, picked, error, result, run, stop, build,
    toggle: (id) =>
      setPicked((s) => {
        const next = new Set(s)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    toggleCategory: (id) =>
      setCategories((s) => {
        const next = new Set(s)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    discard: reset,
    dismiss: reset,
    viewing, setViewing,
    openBuilder: () => {
      setPendingOpen(true)
      go('packs')
    },
    pendingOpen,
    clearOpen: () => setPendingOpen(false)
  }
  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}
