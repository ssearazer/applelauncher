import { Check, ChevronDown, ChevronUp, Layers, Library, Lightbulb, Search, ShieldCheck, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { AiStep } from '../../../shared/types'
import { AI_CATEGORIES } from '../ai-categories'
import { useAi } from '../ai-session'
import { AiKeyHint } from '../components/AiKeyHint'
import { LOADER_NAME } from '../components/InstanceDialog'
import { useApp } from '../state'
import { Button, Progress, Segmented, Select, Toggle, cx } from '../ui'
import { ModIcon } from './Mods'

export function AiBuilder({ onCreated }: { onCreated: () => void }) {
  const { t, jobs, instances } = useApp()
  const ai = useAi()
  const { plan, result, setViewing } = ai
  const promptId = useId()

  // while this page is open the corner widget has nothing to add; leaving it does NOT stop the assistant
  useEffect(() => {
    setViewing(true)
    return () => setViewing(false)
  }, [setViewing])

  const planning = ai.phase === 'planning'
  const building = ai.phase === 'building'
  const busy = planning || building
  const canSend = ai.canRun && !busy
  const [showAll, setShowAll] = useState(false)
  const COLLAPSED = 8
  // picked themes stay visible when the list is folded
  const visible = showAll ? AI_CATEGORIES : AI_CATEGORIES.filter((c, i) => i < COLLAPSED || ai.categories.has(c.id))
  const buildJob = jobs['ai-build']
  const modded = instances.filter((i) => i.loader !== 'vanilla')
  // the chosen profile may have been deleted since: fall back to creating a new one
  const adding = !!ai.baseId && modded.some((i) => i.id === ai.baseId)
  const { setBaseId } = ai
  useEffect(() => {
    if (ai.baseId && !adding) setBaseId(undefined)
  }, [ai.baseId, adding, setBaseId])

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t('ai.mode')}
          value={adding ? 'add' : 'new'}
          onChange={(v) => !busy && ai.setBaseId(v === 'add' ? modded.find((i) => i.id === ai.baseId)?.id ?? modded[0]?.id : undefined)}
          options={[{ value: 'new', label: t('ai.modeNew') }, { value: 'add', label: t('ai.modeAdd') }]}
        />
        {adding && (
          <Select
            className="w-64"
            label={t('ai.target')}
            value={ai.baseId!}
            onChange={(v) => ai.setBaseId(v)}
            options={modded.map((i) => ({ value: i.id, label: i.name, hint: `${LOADER_NAME[i.loader]} ${i.minecraft}` }))}
          />
        )}
        {!adding && modded.length === 0 && <span className="text-[12px] text-muted">{t('ai.noModded')}</span>}
      </div>
      <section className="rounded-[16px] border border-line bg-card p-4 transition-colors focus-within:border-fg/40">
        <label htmlFor={promptId} className="sr-only">{t('ai.promptLabel')}</label>
        <textarea
          id={promptId}
          value={ai.prompt}
          onChange={(e) => ai.setPrompt(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && void ai.run()}
          maxLength={1500}
          rows={3}
          disabled={busy}
          placeholder={t(adding ? 'ai.addPlaceholder' : 'ai.placeholder')}
          className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[12px] text-muted">{t('ai.catsHint')}</p>
          {ai.categories.size > 0 && (
            <button disabled={busy} onClick={ai.clearCategories} className="flex h-6 items-center gap-1 rounded-full px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40">
              <X size={12} aria-hidden /> {t('ai.catsClear')} ({ai.categories.size})
            </button>
          )}
        </div>
        <div role="group" aria-label={t('ai.catsHint')} className="mt-2 flex flex-wrap items-center gap-2">
          {visible.map((c) => {
            const on = ai.categories.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => ai.toggleCategory(c.id)}
                className={cx(
                  'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors disabled:opacity-40',
                  on ? 'border-fg bg-fg text-bg' : 'border-line text-muted hover:bg-hover hover:text-fg'
                )}
              >
                <c.icon size={13} aria-hidden />
                {t(c.label)}
              </button>
            )
          })}
          <button type="button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className="flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg">
            {showAll ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
            {showAll ? t('ai.catsLess') : `${t('ai.catsMore')} (${AI_CATEGORIES.length})`}
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          {planning ? (
            <Button onClick={ai.stop}><Square size={12} /> {t('ai.stop')}</Button>
          ) : (
            <Button variant="primary" disabled={!canSend} onClick={() => void ai.run()}><Sparkles size={14} /> {t(adding ? 'ai.sendAdd' : 'ai.send')}</Button>
          )}
        </div>
      </section>

      {ai.error && (
        <div className="px-1">
          <p role="alert" className="text-[13px]">{ai.error}</p>
          <AiKeyHint error={ai.error} />
        </div>
      )}

      {(ai.steps.length > 0 || planning) && (
        <section className="rounded-[16px] border border-line bg-card p-4">
          {planning && (
            <div className="mb-3">
              <p className="mb-2 text-[12px] text-muted">{t('ai.working')}</p>
              <Progress />
            </div>
          )}
          <ol aria-live="polite" className="flex flex-col gap-1.5">
            {ai.steps.map((s) => <StepRow key={s.id} step={s} />)}
          </ol>
        </section>
      )}

      {plan && (
        <section aria-label={t('ai.planTitle')} className="overflow-hidden rounded-[16px] border border-line bg-card">
          <div className="p-4">
            <p className="text-[12px] text-muted">{t(plan.instanceId ? 'ai.planTitleAdd' : 'ai.planTitle')}</p>
            <h3 className="mt-0.5 text-[16px] font-semibold">{plan.name}</h3>
            <p className="text-[12px] text-muted">{`${LOADER_NAME[plan.loader]} ${plan.loaderVersion ?? ''}, Minecraft ${plan.minecraft}`}</p>
            {plan.summary && <p className="mt-3 text-[13px]">{plan.summary}</p>}
            {!!plan.already && <p className="mt-2 text-[12px] text-muted">{t('ai.already', { n: plan.already })}</p>}
            {plan.dropped > 0 && <p className="mt-2 text-[12px] text-muted">{t('ai.dropped', { n: plan.dropped })}</p>}
          </div>
          {plan.libraries.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] text-muted"><Library size={13} aria-hidden /> {t('ai.libs', { n: plan.libraries.length })}</p>
              <ul className="flex flex-wrap gap-1.5">
                {plan.libraries.map((l) => <li key={l.projectId} className="rounded-full border border-line px-2.5 py-0.5 text-[12px]">{l.title}</li>)}
              </ul>
            </div>
          )}
          {plan.mods.length ? (
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto border-t border-line">
              {plan.mods.map((m) => (
                <li key={m.projectId} className="flex items-center gap-3 px-4 py-2.5">
                  <ModIcon url={m.iconUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{m.title}</span>
                    <span className="block truncate text-[12px] text-muted" title={m.reason || m.description}>{m.reason || m.description}</span>
                  </div>
                  <Toggle checked={ai.picked.has(m.projectId)} onChange={() => ai.toggle(m.projectId)} label={t('ai.toggle', { name: m.title })} disabled={busy} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line p-4 text-[13px] text-muted">{t('ai.noMods')}</p>
          )}
          <div className="flex items-center gap-2 border-t border-line p-3">
            <span className="min-w-0 truncate px-1 text-[12px] text-muted">
              {building ? `${t('ai.building')}${buildJob?.title ? ` ${buildJob.title}` : ''}` : t('ai.selected', { n: ai.picked.size, all: plan.mods.length })}
            </span>
            <span className="flex-1" />
            {building ? (
              <Button onClick={ai.stop}><Square size={12} /> {t('ai.stop')}</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={ai.discard}>{t('ai.discard')}</Button>
                <Button variant="primary" onClick={() => void ai.build()}>{t(plan.instanceId ? 'ai.buildAdd' : 'ai.build')}</Button>
              </>
            )}
          </div>
          {building && <Progress value={buildJob?.progress} className="rounded-none" />}
        </section>
      )}

      {ai.phase === 'done' && result && (
        <section className="rounded-[16px] border border-line bg-card p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold"><Check size={16} aria-hidden /> {t(result.extended ? 'ai.addDoneTitle' : 'ai.doneTitle', { name: result.instance.name })}</p>
          <p className="mt-1.5 text-[12px] text-muted">{t('ai.doneStats', { mods: result.mods, libs: result.libs })}</p>
          <p className="mt-1 text-[12px] text-muted">{result.extended ? t('ai.addDoneNote') : result.gameReady ? t('ai.gameReady') : t('ai.gameLater')}</p>
          {result.skipped.length > 0 && <p className="mt-1 text-[12px] text-muted">{t('ai.skipped', { list: result.skipped.join(', ') })}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => { ai.dismiss(); onCreated() }}>{t('ai.toPacks')}</Button>
            <Button variant="ghost" onClick={ai.dismiss}>{t('common.close')}</Button>
          </div>
        </section>
      )}

      <footer className="px-1 text-[12px] text-muted">{t('ai.note')}</footer>
    </div>
  )
}

const STEP_ICON = { thought: Lightbulb, target: Layers, search: Search, verify: ShieldCheck }

export function StepRow({ step }: { step: AiStep }) {
  const { t } = useApp()
  const Icon = STEP_ICON[step.kind]
  return (
    <li className="flex items-start gap-2.5 text-[12px]">
      <Icon size={13} aria-hidden className="mt-[3px] shrink-0 text-muted" />
      {step.kind === 'verify' ? (
        <span>{t('ai.step.verify', { text: step.text })}</span>
      ) : (
        <span className="min-w-0">
          <span className={cx('font-medium', step.kind === 'thought' && 'sr-only')}>{t(`ai.step.${step.kind}`)}</span>
          <span className={cx(step.kind === 'thought' ? 'text-muted italic' : 'ml-1.5 text-muted')}>{step.text}</span>
        </span>
      )}
    </li>
  )
}
