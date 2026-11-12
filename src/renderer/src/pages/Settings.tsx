import { Cpu, Gamepad2, Paintbrush, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Settings as S } from '../../../shared/types'
import { api, useApp } from '../state'
import { Button, Group, Input, PageHeader, Row, Segmented, Select, Toggle, cx } from '../ui'

type Section = 'appearance' | 'minecraft' | 'launcher' | 'advanced'
const SECTIONS: { id: Section; icon: typeof Cpu }[] = [
  { id: 'appearance', icon: Paintbrush },
  { id: 'minecraft', icon: Gamepad2 },
  { id: 'launcher', icon: Cpu },
  { id: 'advanced', icon: Wrench }
]

/** Number field that saves on blur/Enter, so typing "4" on the way to "4096" doesn't hit validation. */
function NumberField({ value, onSave, min, max, step = 1, width = 'w-24', suffix }: { value: number; onSave: (n: number) => void; min: number; max: number; step?: number; width?: string; suffix?: string }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(v))
    if (Number.isFinite(n) && n >= min && n <= max) n !== value && onSave(n)
    else setV(String(value))
  }
  return (
    <span className="flex items-center gap-1.5">
      <Input type="number" min={min} max={max} step={step} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} className={cx(width, 'text-right')} />
      {suffix && <span className="text-[12px] text-muted">{suffix}</span>}
    </span>
  )
}

function TextField({ value, onSave, placeholder }: { value: string; onSave: (s: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <Input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="w-72" />
}

function PathRow({ label, hint, value, pick, onReset }: { label: string; hint?: string; value: string; pick: () => void; onReset?: () => void }) {
  const { t } = useApp()
  return (
    <Row label={label} hint={hint}>
      <span className="max-w-[260px] truncate text-[12px] text-muted" title={value}>{value || t('settings.javaAuto')}</span>
      <Button size="sm" onClick={pick}>{t('common.choose')}</Button>
      {onReset && value && <Button size="sm" variant="ghost" onClick={onReset}>{t('common.reset')}</Button>}
    </Row>
  )
}

export function Settings() {
  const { t } = useApp()
  const [section, setSection] = useState<Section>('appearance')
  return (
    <div className="flex gap-6">
      <nav aria-label={t('nav.settings')} className="sticky top-0 flex w-44 shrink-0 flex-col gap-0.5 self-start">
        <h1 className="mb-4 px-2 text-[28px] leading-tight font-semibold tracking-[-0.02em]">{t('nav.settings')}</h1>
        {SECTIONS.map(({ id, icon: Icon }) => (
          <button key={id} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={cx('flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13px] transition-colors', section === id ? 'bg-press text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
            <span className="grid size-6 place-items-center rounded-[6px] border border-line bg-card"><Icon size={13} aria-hidden /></span>
            {t(`settings.${id}`)}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 pt-1">
        {section === 'appearance' && <Appearance />}
        {section === 'minecraft' && <Minecraft />}
        {section === 'launcher' && <Launcher />}
        {section === 'advanced' && <Advanced />}
      </div>
    </div>
  )
}

function useSet() {
  const { setSettings } = useApp()
  return <K extends keyof S>(k: K) => (v: S[K]) => setSettings({ [k]: v } as Partial<S>)
}

function Appearance() {
  const { t, settings: s } = useApp()
  const set = useSet()
  return (
    <>
      <PageHeader title={t('settings.appearance')} />
      <Group>
        <Row label={t('settings.theme')}>
          <Segmented label={t('settings.theme')} value={s.theme} onChange={set('theme')} options={[{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }, { value: 'system', label: t('settings.system') }]} />
        </Row>
        <Row label={t('settings.animations')} hint={t('settings.animationsHint')}>
          <Toggle label={t('settings.animations')} checked={s.animations} onChange={set('animations')} />
        </Row>
        <Row label={t('settings.scale')}>
          <Select className="w-28" label={t('settings.scale')} value={String(s.scale)} onChange={(v) => set('scale')(Number(v))} options={[0.8, 0.9, 1, 1.1, 1.25, 1.5].map((n) => ({ value: String(n), label: `${Math.round(n * 100)}%` }))} />
        </Row>
      </Group>
    </>
  )
}

function Minecraft() {
  const { t, settings: s, attempt } = useApp()
  const set = useSet()
  const [ram, setRam] = useState<number>()
  const [mem, setMem] = useState(s.memory)
  useEffect(() => setMem(s.memory), [s.memory])
  useEffect(() => {
    // navigator.deviceMemory is capped at 8 in Chromium; good enough for a soft hint
    setRam((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
  }, [])
  return (
    <>
      <PageHeader title={t('settings.minecraft')} />
      <Group title={t('settings.performance')}>
        <Row label={t('settings.memory')} hint={t('settings.memoryHint')}>
          <input
            type="range"
            min={1024}
            max={Math.max(16384, s.memory)}
            step={512}
            value={mem}
            onChange={(e) => setMem(Number(e.target.value))}
            onPointerUp={() => mem !== s.memory && set('memory')(mem)}
            onKeyUp={() => mem !== s.memory && set('memory')(mem)}
            aria-label={t('settings.memory')}
            className="w-48 accent-[var(--fg)]"
          />
          <span className="w-16 text-right text-[13px] tabular-nums">{(mem / 1024).toFixed(1)} {t('settings.gb')}</span>
        </Row>
        <PathRow label={t('settings.java')} hint={t('settings.javaHint')} value={s.javaPath} pick={async () => { const p = await attempt(() => api.app.pickJava()); if (p) await set('javaPath')(p) }} onReset={() => set('javaPath')('')} />
        <Row label={t('settings.jvmArgs')} hint={t('settings.jvmHint')}>
          <TextField value={s.jvmArgs} onSave={set('jvmArgs')} placeholder="-XX:+UseG1GC" />
        </Row>
      </Group>
      {ram !== undefined && ram < 8 && s.memory > ram * 1024 * 0.75 && <p className="-mt-4 mb-6 px-1 text-[12px] text-muted">{t('settings.memoryWarn')}</p>}
      <Group title={t('settings.window')}>
        <Row label={t('settings.resolution')}>
          <NumberField value={s.width} onSave={set('width')} min={320} max={7680} />
          <span className="text-muted">×</span>
          <NumberField value={s.height} onSave={set('height')} min={240} max={4320} />
        </Row>
        <Row label={t('settings.fullscreen')}>
          <Toggle label={t('settings.fullscreen')} checked={s.fullscreen} onChange={set('fullscreen')} />
        </Row>
      </Group>
      <Group title={t('settings.files')}>
        <PathRow label={t('settings.gameDir')} hint={t('settings.gameDirHint')} value={s.gameDir} pick={async () => { const p = await attempt(() => api.app.pickDir()); if (p) await set('gameDir')(p) }} />
      </Group>
    </>
  )
}

function Launcher() {
  const { t, settings: s, attempt, toast } = useApp()
  const set = useSet()
  const [checking, setChecking] = useState(false)
  const check = async () => {
    setChecking(true)
    const r = await attempt(() => api.app.checkUpdates())
    setChecking(false)
    if (r) toast(r.status === 'dev' ? t('settings.updDev') : r.status === 'latest' ? t('settings.updLatest') : t('settings.updAvailable', { v: r.version ?? '' }))
  }
  return (
    <>
      <PageHeader title={t('settings.launcher')} />
      <Group>
        <Row label={t('settings.autostart')} hint={t('settings.autostartHint')}>
          <Toggle label={t('settings.autostart')} checked={s.autostart} onChange={set('autostart')} />
        </Row>
        <Row label={t('settings.closeOnLaunch')} hint={t('settings.closeOnLaunchHint')}>
          <Toggle label={t('settings.closeOnLaunch')} checked={s.closeOnLaunch} onChange={set('closeOnLaunch')} />
        </Row>
        <Row label={t('settings.language')}>
          <Segmented label={t('settings.language')} value={s.language} onChange={set('language')} options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} />
        </Row>
      </Group>
      <Group title={t('settings.updates')}>
        <Row label={t('settings.autoUpdate')} hint={t('settings.autoUpdateHint')}>
          <Toggle label={t('settings.autoUpdate')} checked={s.checkUpdates} onChange={set('checkUpdates')} />
        </Row>
        <Row label={t('settings.checkNow')}>
          <Button size="sm" disabled={checking} onClick={check}>{checking ? t('settings.checking') : t('settings.check')}</Button>
        </Row>
      </Group>
      <Group title={t('settings.files')}>
        <PathRow label={t('settings.downloads')} hint={t('settings.downloadsHint')} value={s.downloadsDir} pick={async () => { const p = await attempt(() => api.app.pickDir()); if (p) await set('downloadsDir')(p) }} />
      </Group>
    </>
  )
}

function Advanced() {
  const { t, settings: s, attempt, toast, selected, launch, dialogs } = useApp()
  const set = useSet()
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.app.info>>>()
  useEffect(() => void api.app.info().then(setInfo), [])
  const busy = ['preparing', 'downloading', 'verifying', 'launching', 'running'].includes(launch.phase)
  return (
    <>
      <PageHeader title={t('settings.advanced')} />
      <Group title={t('settings.account')}>
        <Row label={t('settings.clientId')} hint={t('settings.clientIdHint')}>
          <TextField value={s.msClientId} onSave={set('msClientId')} placeholder="00000000-0000-0000-0000-000000000000" />
        </Row>
        <Row label={t('settings.azureGuide')}>
          <Button size="sm" variant="ghost" onClick={() => attempt(() => api.app.openExternal('https://aka.ms/mce-reviewappid'))}>{t('settings.openGuide')}</Button>
        </Row>
      </Group>
      <Group title={t('settings.maintenance')}>
        <Row label={t('logs.title')} hint={t('settings.logsHint')}>
          <Button size="sm" onClick={() => dialogs.setLogs(true)}>{t('settings.show')}</Button>
          <Button size="sm" variant="ghost" onClick={() => attempt(() => api.app.openLogs())}>{t('logs.folder')}</Button>
        </Row>
        <Row label={t('settings.verify')} hint={selected ? t('settings.verifyHint', { name: selected.name }) : t('settings.verifyNone')}>
          <Button size="sm" disabled={!selected || busy} onClick={async () => { if (selected && (await attempt(async () => (await api.launch.verify(selected.id), true)))) toast(t('versions.verified')) }}>{t('settings.verifyBtn')}</Button>
        </Row>
        <Row label={t('settings.cache')} hint={t('settings.cacheHint')}>
          <Button size="sm" disabled={busy} onClick={async () => { if (await attempt(async () => (await api.app.clearCache(), true))) toast(t('settings.cacheCleared')) }}>{t('settings.clear')}</Button>
        </Row>
      </Group>
      <Group title={t('settings.about')}>
        <Row label="AppleLauncher" hint={info ? `${t('settings.version')} ${info.version}` : undefined} />
        {info && <Row label="Electron" hint={`Electron ${info.electron}, Chromium ${info.chrome}, Node ${info.node}`} />}
        <Row label={t('settings.disclaimer')} hint={t('settings.disclaimerText')} />
      </Group>
    </>
  )
}
