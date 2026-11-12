import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from './state'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

/* ---------- buttons ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }
export function Button({ variant = 'secondary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]',
        variant === 'primary' && 'bg-fg text-bg hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-card text-fg hover:bg-hover',
        variant === 'ghost' && 'text-fg hover:bg-hover',
        className
      )}
    />
  )
}

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...p}
      className={cx('grid size-8 place-items-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-40', className)}
    />
  )
}

/* ---------- toggle ---------- */

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40', checked ? 'bg-fg' : 'bg-line')}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        className={cx('absolute top-[2px] size-[18px] rounded-full shadow-sm', checked ? 'right-[2px] bg-bg' : 'left-[2px] bg-white')}
      />
    </button>
  )
}

/* ---------- segmented control ---------- */

export function Segmented<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; label: string }) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-hover p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('relative h-[26px] rounded-[8px] px-3 text-[12px] font-medium transition-colors duration-150', o.value === value ? 'text-fg' : 'text-muted hover:text-fg')}
        >
          {o.value === value && (
            <motion.span layoutId={id} transition={{ type: 'spring', stiffness: 600, damping: 45 }} className="absolute inset-0 rounded-[8px] border border-line bg-card shadow-[var(--shadow)]" />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- text input ---------- */

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx('h-8 rounded-[10px] border border-line bg-card px-3 text-[13px] text-fg outline-none transition-colors placeholder:text-muted focus:border-fg/40', className)}
    />
  )
}

export function SearchField({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const { t } = useApp()
  return (
    <label className={cx('flex h-8 items-center gap-2 rounded-[10px] border border-line bg-card px-2.5 transition-colors focus-within:border-fg/40', className)}>
      <Search size={14} className="text-muted" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
      {value && (
        <button aria-label={t('common.clear')} onClick={() => onChange('')} className="text-muted hover:text-fg">
          <X size={14} />
        </button>
      )}
    </label>
  )
}

/* ---------- dropdown ---------- */

export interface Option { value: string; label: string; hint?: string }
export function Select({ value, options, onChange, label, searchable, placeholder, className, loading, up }: {
  value?: string; options: Option[]; onChange: (v: string) => void; label: string; searchable?: boolean; placeholder?: string; className?: string; loading?: boolean; up?: boolean
}) {
  const { t } = useApp()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number; up: boolean }>()
  // The list lives in a portal with fixed position so dialogs and scroll areas never clip it; it opens toward the side with more room.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = ref.current!.getBoundingClientRect()
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12
      const want = (searchable ? 44 : 0) + 296
      const goUp = up ? above > 160 || above > below : below < want && above > below
      setPos({ left: r.left, width: r.width, maxH: Math.min(want, goUp ? above : below), up: goUp, ...(goUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, up, searchable])
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options), [q, options])
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (o?: Option) => {
    if (o) onChange(o.value)
    setOpen(false)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      return setOpen(true)
    }
    if (!open) return
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setActive((a) => Math.min(filtered.length - 1, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Enter') pick(filtered[active])
    else return
    e.preventDefault()
  }

  return (
    <div ref={ref} className={cx('relative', className)} onKeyDown={onKey}>
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-2 rounded-[10px] border border-line bg-card pl-3 pr-2 text-left text-[13px] transition-colors hover:bg-hover"
      >
        <span className={cx('flex-1 truncate', !current && 'text-muted')}>{loading ? '…' : (current?.label ?? placeholder ?? label)}</span>
        {current?.hint && <span className="text-[12px] text-muted">{current.hint}</span>}
        <ChevronDown size={14} className={cx('text-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      {createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={pop}
            style={{ position: 'fixed', left: pos.left, minWidth: pos.width, top: pos.top, bottom: pos.bottom }}
            initial={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cx('glass z-[60] flex flex-col overflow-hidden rounded-[14px] border border-line shadow-[var(--shadow-pop)]', pos.up ? 'origin-bottom' : 'origin-top')}
          >
            {searchable && (
              <div className="border-b border-line p-1.5">
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    setActive(0)
                  }}
                  placeholder={t('common.search')}
                  aria-label={t('common.search')}
                  className="h-7 w-full rounded-[8px] bg-hover px-2.5 text-[13px] outline-none placeholder:text-muted"
                />
              </div>
            )}
            <ul ref={listRef} role="listbox" aria-label={label} style={{ maxHeight: pos.maxH - (searchable ? 44 : 0) }} className="overflow-y-auto p-1">
              {filtered.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">{t('common.nothingFound')}</li>}
              {filtered.map((o, i) => (
                <li
                  key={o.value}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cx('flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[13px]', i === active && 'bg-hover')}
                >
                  <Check size={14} className={o.value === value ? 'opacity-100' : 'opacity-0'} aria-hidden />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-[12px] text-muted">{o.hint}</span>}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

/* ---------- modal ---------- */

export function Modal({ open, onClose, title, children, footer, width = 460 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const { t } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('input,button:not([data-close]),[tabindex]')?.focus())
    return () => {
      window.removeEventListener('keydown', key)
      prev?.focus()
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{ width }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="glass flex max-h-full max-w-full flex-col overflow-hidden rounded-[20px] border border-line shadow-[var(--shadow-pop)]"
          >
            <header className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <IconButton label={t('common.close')} data-close onClick={onClose}>
                <X size={16} />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- progress, skeleton, empty ---------- */

export function Progress({ value, className }: { value?: number; className?: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === undefined ? undefined : Math.round(value * 100)} className={cx('h-1 overflow-hidden rounded-full bg-line', className)}>
      {value === undefined ? (
        <motion.div className="h-full w-1/3 rounded-full bg-fg" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }} />
      ) : (
        <motion.div className="h-full rounded-full bg-fg" animate={{ width: `${Math.max(2, value * 100)}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
      )}
    </div>
  )
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('skeleton', className)} />

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="mb-1 grid size-12 place-items-center rounded-[14px] border border-line bg-card text-muted">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="max-w-sm text-[13px] text-muted">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/* ---------- settings-style groups ---------- */

export const Group = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="mb-6">
    {title && <h3 className="mb-2 px-1 text-[12px] font-medium text-muted">{title}</h3>}
    <div className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card">{children}</div>
  </section>
)

export const Row = ({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) => (
  <div className="flex min-h-12 items-center gap-4 px-4 py-2.5">
    <div className="min-w-0 flex-1">
      <div className="text-[13px]">{label}</div>
      {hint && <div className="text-[12px] text-muted">{hint}</div>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
)

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  )
}
