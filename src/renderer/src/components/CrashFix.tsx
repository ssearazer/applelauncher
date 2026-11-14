import { Check, TriangleAlert, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AiFixResult, Instance } from '../../../shared/types'
import { api, useApp } from '../state'
import { Button, Progress } from '../ui'
import { AiKeyHint } from './AiKeyHint'

/**
 * Appears under the Play row after the game crashed. One click: the assistant reads the game log and the crash report,
 * switches off the mods that broke the game and installs what was missing. Switched-off mods are only renamed,
 * so nothing is lost; the player can turn them back on in the Mods tab.
 */
export function CrashFix({ inst, crashed }: { inst: Instance; crashed: boolean }) {
  const { t, settings, toast, reloadInstances } = useApp()
  const [phase, setPhase] = useState<'idle' | 'working' | 'done'>('idle')
  const [step, setStep] = useState('')
  const [result, setResult] = useState<AiFixResult>()
  const [error, setError] = useState<string>()

  useEffect(() => api.ai.onStep((s) => setStep(s.text)), [])
  // a new launch starts: the old verdict is no longer about the current state
  useEffect(() => {
    if (!crashed && phase === 'done') {
      setPhase('idle')
      setResult(undefined)
    }
  }, [crashed, phase])

  if (inst.loader === 'vanilla' || (!crashed && phase === 'idle')) return null

  const run = async () => {
    setPhase('working')
    setError(undefined)
    setResult(undefined)
    setStep('')
    try {
      const r = await api.ai.fix(inst.id, settings?.language === 'en' ? 'en' : 'ru')
      setResult(r)
      setPhase('done')
      await reloadInstances()
    } catch (e) {
      setError((e as Error).message)
      setPhase('idle')
    }
  }
  const stop = () => void api.ai.cancel().catch(() => undefined)

  return (
    <section role="status" aria-live="polite" className="mt-4 rounded-[16px] border border-line bg-card p-4">
      {phase === 'idle' && (
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-hover text-muted"><TriangleAlert size={16} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{t('fix.title')}</p>
            <p className="text-[12px] text-muted">{error ?? t('fix.hint')}</p>
            <AiKeyHint error={error} />
          </div>
          <Button variant="primary" onClick={() => void run()}><Wrench size={14} /> {t('fix.button')}</Button>
        </div>
      )}
      {phase === 'working' && (
        <div>
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-[13px]">{t('fix.working')} <span className="text-muted">{step}</span></p>
            <Button onClick={stop}>{t('ai.stop')}</Button>
          </div>
          <Progress className="mt-3" />
        </div>
      )}
      {phase === 'done' && result && (
        <div>
          <div className="flex items-start gap-3">
            <Check size={16} aria-hidden className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{result.disabled.length || result.added.length ? t('fix.done') : t('fix.nothing')}</p>
              {result.diagnosis && <p className="mt-1 text-[13px]">{result.diagnosis}</p>}
            </div>
            <button aria-label={t('common.close')} onClick={() => { setPhase('idle'); setResult(undefined) }} className="grid size-7 place-items-center rounded-[8px] text-muted hover:bg-hover hover:text-fg"><X size={14} /></button>
          </div>
          {result.disabled.length > 0 && (
            <div className="mt-3">
              <p className="text-[12px] text-muted">{t('fix.disabled', { n: result.disabled.length })}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">
                {result.disabled.map((d) => <li key={d.file}><span className="font-medium">{d.title}</span>{d.reason && <span className="text-muted">: {d.reason}</span>}</li>)}
              </ul>
            </div>
          )}
          {result.added.length > 0 && (
            <div className="mt-3">
              <p className="text-[12px] text-muted">{t('fix.added', { n: result.added.length })}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">
                {result.added.map((d) => <li key={d.title}><span className="font-medium">{d.title}</span>{d.reason && <span className="text-muted">: {d.reason}</span>}</li>)}
              </ul>
            </div>
          )}
          {result.skipped.length > 0 && <p className="mt-3 text-[12px] text-muted">{t('ai.skipped', { list: result.skipped.join(', ') })}</p>}
          {(result.disabled.length > 0 || result.added.length > 0) && <p className="mt-3 text-[12px] text-muted">{t('fix.after')}</p>}
        </div>
      )}
    </section>
  )
}
