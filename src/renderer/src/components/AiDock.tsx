import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronUp, ExternalLink, Sparkles, Square, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAi } from '../ai-session'
import { StepRow } from '../pages/AiBuilder'
import { useApp } from '../state'
import { IconButton, Progress } from '../ui'

/** Corner widget: follows the AI assistant on every page, so the player can leave the Packs tab while it works. */
export function AiDock() {
  const ai = useAi()
  const { t, jobs } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const job = jobs['ai-build']

  const failed = ai.phase === 'idle' && !!ai.error
  const visible = (ai.phase !== 'idle' || failed) && !ai.viewing
  const working = ai.phase === 'planning' || ai.phase === 'building'

  // news the player should not miss: open the widget again when the state changes to one of these
  useEffect(() => {
    if (ai.phase === 'ready' || ai.phase === 'done' || failed) setCollapsed(false)
  }, [ai.phase, failed])

  let title = ''
  let detail = ''
  let value: number | undefined
  let Icon = Sparkles
  if (ai.phase === 'planning') {
    title = t('aiDock.planning')
    detail = ai.steps.at(-1)?.text ?? t('ai.working')
  } else if (ai.phase === 'ready') {
    title = t('aiDock.ready')
    detail = t('aiDock.readyText', { name: ai.plan?.name ?? '', n: ai.plan?.mods.length ?? 0 })
  } else if (ai.phase === 'building') {
    title = t('aiDock.building')
    detail = job?.title ?? t('ai.building')
    value = job?.progress
  } else if (ai.phase === 'done') {
    title = t('aiDock.done')
    detail = ai.result ? t(ai.result.extended ? 'ai.addDoneTitle' : 'ai.doneTitle', { name: ai.result.instance.name }) : ''
    Icon = Check
  } else if (failed) {
    title = t('aiDock.error')
    detail = ai.error ?? ''
    Icon = TriangleAlert
  }
  const closable = ai.phase === 'done' || failed
  const recent = ai.phase === 'planning' ? ai.steps.slice(-3) : []

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="ai-dock"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className="glass fixed right-5 bottom-24 z-40 w-[300px] overflow-hidden rounded-[16px] border border-line shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-card text-muted"><Icon size={15} aria-hidden /></span>
            <button onClick={ai.openBuilder} title={t('aiDock.open')} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-semibold">{title}</span>
              {!collapsed && <span className="block truncate text-[12px] text-muted">{detail}</span>}
            </button>
            {collapsed && value !== undefined && <span className="text-[11px] text-muted">{Math.round(value * 100)}%</span>}
            <IconButton label={collapsed ? t('aiDock.expand') : t('aiDock.collapse')} onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </IconButton>
            {closable && <IconButton label={t('common.close')} onClick={ai.dismiss}><X size={14} /></IconButton>}
          </div>
          {working && <Progress value={value} className="mx-3.5 mb-3" />}
          {!collapsed && recent.length > 0 && (
            <ol className="flex flex-col gap-1 px-3.5 pb-3">
              {recent.map((s) => <StepRow key={s.id} step={s} />)}
            </ol>
          )}
          {!collapsed && (
            <div className="flex items-center justify-end gap-1 border-t border-line px-2 py-1.5">
              {working && (
                <button onClick={ai.stop} className="flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg">
                  <Square size={11} /> {t('ai.stop')}
                </button>
              )}
              <button onClick={ai.openBuilder} className="flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[12px] transition-colors hover:bg-hover">
                <ExternalLink size={12} /> {t('aiDock.open')}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
