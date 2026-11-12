import { useEffect, useRef, useState } from 'react'
import { api } from '../state'

const cache = new Map<string, Promise<string | undefined>>()
export function useSkin(accountId?: string, skinUrl?: string) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!accountId) return setUrl(undefined)
    const key = `${accountId}:${skinUrl}`
    if (!cache.has(key)) cache.set(key, api.accounts.skin(accountId).catch(() => undefined))
    let live = true
    void cache.get(key)!.then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [accountId, skinUrl])
  return url
}

/** Face (8×8 at 8,8) plus hat layer (40,8) cut from the skin texture. */
export function Avatar({ accountId, skinUrl, name, size = 32 }: { accountId?: string; skinUrl?: string; name?: string; size?: number }) {
  const skin = useSkin(accountId, skinUrl)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !skin) return
    const img = new Image()
    img.onload = () => {
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, 8, 8)
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8)
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8)
    }
    img.src = skin
  }, [skin])
  const style = { width: size, height: size }
  if (!skin)
    return (
      <div style={style} className="grid shrink-0 place-items-center rounded-[8px] border border-line bg-hover text-[12px] font-medium text-muted" aria-hidden>
        {name?.[0]?.toUpperCase() ?? '?'}
      </div>
    )
  return <canvas ref={ref} width={8} height={8} style={style} className="pixelated shrink-0 rounded-[8px]" aria-label={name} role="img" />
}
