import { RotateCcw, Shirt, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IdleAnimation, SkinViewer, WalkingAnimation } from 'skinview3d'
import { useSkin } from '../components/Avatar'
import { api, useApp } from '../state'
import { Button, Empty, Group, PageHeader, Row, Segmented, Toggle } from '../ui'

export function Skins() {
  const { t, account, attempt, reloadAccounts, toast, dialogs, settings } = useApp()
  const skin = useSkin(account?.id, account?.skinUrl)
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<SkinViewer>(null)
  const [variant, setVariant] = useState<'classic' | 'slim'>(account?.skinVariant ?? 'classic')
  const [walk, setWalk] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => setVariant(account?.skinVariant ?? 'classic'), [account?.skinVariant])

  useEffect(() => {
    if (!canvas.current) return
    const v = new SkinViewer({ canvas: canvas.current, width: 320, height: 420, zoom: 0.85 })
    v.autoRotate = settings.animations
    v.autoRotateSpeed = 0.6
    viewer.current = v
    return () => {
      v.dispose()
      viewer.current = null
    }
  }, [account, settings.animations])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    v.animation = settings.animations ? (walk ? new WalkingAnimation() : new IdleAnimation()) : null
  }, [walk, account, settings.animations])

  useEffect(() => {
    if (viewer.current && skin) void viewer.current.loadSkin(skin, { model: variant === 'slim' ? 'slim' : 'default' })
  }, [skin, variant, account, settings.animations])

  if (account?.offline)
    return (
      <div>
        <PageHeader title={t('nav.skins')} />
        <Empty icon={<Shirt size={20} />} title={t('skins.offline')} text={t('skins.offlineText')} />
      </div>
    )
  if (!account)
    return (
      <div>
        <PageHeader title={t('nav.skins')} />
        <Empty icon={<Shirt size={20} />} title={t('skins.signIn')} text={t('skins.signInText')} action={<Button variant="primary" onClick={() => dialogs.setAccounts(true)}>{t('accounts.signIn')}</Button>} />
      </div>
    )

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    const ok = await attempt(async () => (await fn()) !== false)
    setBusy(false)
    if (!ok) return
    await reloadAccounts()
    toast(done)
  }
  return (
    <div>
      <PageHeader title={t('nav.skins')} subtitle={t('skins.subtitle', { name: account.name })} />
      <div className="flex gap-6">
        <div className="grid h-[440px] w-[340px] shrink-0 place-items-center rounded-[20px] border border-line bg-card">
          <canvas ref={canvas} aria-label={t('skins.preview', { name: account.name })} role="img" className="cursor-grab active:cursor-grabbing" />
        </div>
        <div className="flex-1">
          <Group title={t('skins.model')}>
            <Row label={t('skins.model')} hint={t('skins.modelHint')}>
              <Segmented label={t('skins.model')} value={variant} onChange={setVariant} options={[{ value: 'classic', label: t('skins.classic') }, { value: 'slim', label: t('skins.slim') }]} />
            </Row>
            <Row label={t('skins.walk')}>
              <Toggle label={t('skins.walk')} checked={walk} onChange={setWalk} disabled={!settings.animations} />
            </Row>
          </Group>
          <Group title={t('skins.change')}>
            <Row label={t('skins.upload')} hint={t('skins.uploadHint')}>
              <Button disabled={busy} onClick={() => run(() => api.accounts.uploadSkin(account.id, variant), t('skins.uploaded'))}><Upload size={14} /> {t('common.choose')}</Button>
            </Row>
            <Row label={t('skins.reset')} hint={t('skins.resetHint')}>
              <Button disabled={busy} onClick={() => run(() => api.accounts.resetSkin(account.id), t('skins.wasReset'))}><RotateCcw size={14} /> {t('common.reset')}</Button>
            </Row>
          </Group>
        </div>
      </div>
    </div>
  )
}
