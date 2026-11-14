import { ExternalLink, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { isAiLimitError } from '../../../shared/pure'
import { api, useApp } from '../state'
import { Button, Input, Modal } from '../ui'

/**
 * Shown under an assistant error that a personal OpenRouter key fixes (shared free quota spent, key rejected).
 * The modal holds the step-by-step instruction and a field to paste the key right there.
 */
export function AiKeyHint({ error }: { error?: string }) {
  const { t, settings, setSettings, attempt, toast } = useApp()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  if (!isAiLimitError(error)) return null

  const save = async () => {
    const v = key.trim()
    if (!/^sk-or-[\w.-]+$/.test(v)) return toast(t('aiKey.invalid'), 'error')
    await setSettings({ aiKey: v })
    setKey('')
    setOpen(false)
    toast(t('aiKey.saved'))
  }
  const steps = [t('aiKey.s1'), t('aiKey.s2'), t('aiKey.s3'), t('aiKey.s4')]
  return (
    <>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <KeyRound size={13} aria-hidden /> {t('aiKey.remind')}
        <button onClick={() => setOpen(true)} className="font-medium text-fg underline underline-offset-2">{t('aiKey.how')}</button>
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title={t('aiKey.title')} width={520}
        footer={<><Button onClick={() => setOpen(false)}>{t('common.close')}</Button><Button variant="primary" disabled={!key.trim()} onClick={() => void save()}>{t('aiKey.save')}</Button></>}>
        <p className="text-[13px] text-muted">{t('aiKey.why')}</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px]">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <Button size="sm" className="mt-3" onClick={() => attempt(() => api.app.openExternal('https://openrouter.ai/keys'))}><ExternalLink size={13} /> {t('aiKey.open')}</Button>
        <label className="mt-4 block text-[12px] text-muted" htmlFor="ai-key-field">{t('settings.aiKey')}</label>
        <Input id="ai-key-field" className="mt-1 w-full" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings?.aiKey ? t('aiKey.have') : 'sk-or-v1-…'} onKeyDown={(e) => e.key === 'Enter' && void save()} />
        <p className="mt-3 text-[12px] text-muted">{t('aiKey.note')}</p>
      </Modal>
    </>
  )
}
