import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { playIntroSound } from '../intro-sound'

// Geometry comes from assets/icon.svg (viewBox 0 0 64 64): the ring is tilted -16° around the apple.
const APPLE = 'M32 23C27 19.6 18.5 20.2 17 28.5 15.6 37 20.5 46.6 25.8 49.2 28.2 50.3 30 49.4 32 49.4S35.8 50.3 38.2 49.2C43.5 46.6 48.4 37 47 28.5 45.5 20.2 37 19.6 32 23Z'
const STEM = 'M32 23C32 19.6 32.8 17.2 34.6 15.2'
const LEAF = 'M34 18.4C35.6 14.4 39.6 12.9 43.6 13.8 42.3 17.6 38.2 19.4 34 18.4Z'
// the line travels left → over the top → right → under the apple → back to the left
const RING_BACK = 'M10 37A22 6 0 0 1 54 37'
const RING_FRONT = 'M54 37A22 6 0 0 1 10 37'

const ease = [0.22, 1, 0.36, 1] as const
let played = false // StrictMode mounts twice in dev; the intro (and its sound) runs once per launch

/** Launch animation: the apple appears, a line orbits it, then the leaf grows. Click or any key skips it. */
export function Intro({ sound }: { sound: boolean }) {
  const [show, setShow] = useState(() => {
    if (played) return false
    played = true
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (!show) return
    if (sound) playIntroSound()
    const end = setTimeout(() => setShow(false), 2600)
    const skip = () => setShow(false)
    window.addEventListener('keydown', skip)
    return () => {
      clearTimeout(end)
      window.removeEventListener('keydown', skip)
    }
  }, [show, sound])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          className="no-drag fixed inset-0 z-[100] grid place-items-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          onClick={() => setShow(false)}
          aria-hidden
        >
          <svg viewBox="0 0 64 64" width="168" height="168" fill="none" stroke="var(--text)" strokeLinecap="round" overflow="visible">
            <defs>
              <linearGradient id="intro-fruit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--text)" />
                <stop offset="1" stopColor="var(--text)" stopOpacity=".62" />
              </linearGradient>
            </defs>
            <g transform="rotate(-16 32 37)" strokeWidth="1.7">
              <motion.path d={RING_BACK} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.35 }} transition={{ pathLength: { duration: 0.55, delay: 0.55, ease: 'easeInOut' }, opacity: { duration: 0.1, delay: 0.55 } }} />
            </g>
            <motion.path
              d={APPLE}
              fill="url(#intro-fruit)"
              stroke="none"
              style={{ transformOrigin: '32px 38px' }}
              initial={{ opacity: 0, scale: 0.8, y: 3 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease }}
            />
            <motion.path d={STEM} strokeWidth="2" stroke="var(--text)" strokeOpacity=".85" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3, delay: 1.5, ease: 'easeOut' }} />
            <g transform="rotate(-16 32 37)" strokeWidth="1.7">
              <motion.path d={RING_FRONT} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ pathLength: { duration: 0.6, delay: 1.05, ease: 'easeInOut' }, opacity: { duration: 0.1, delay: 1.05 } }} />
            </g>
            <motion.path
              d={LEAF}
              fill="var(--text)"
              stroke="none"
              fillOpacity=".92"
              style={{ transformOrigin: '34px 18.4px' }}
              initial={{ opacity: 0, scale: 0, rotate: -40 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 170, damping: 14, delay: 1.7 }}
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
