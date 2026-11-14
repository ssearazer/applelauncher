import { MotionConfig } from 'framer-motion'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AiProvider } from './ai-session'
import { AppProvider, useApp } from './state'
import './styles.css'

function Motion({ children }: { children: React.ReactNode }) {
  const { settings } = useApp()
  useEffect(() => {
    document.documentElement.classList.toggle('no-motion', !settings.animations)
    document.documentElement.lang = settings.language
  }, [settings.animations, settings.language])
  return <MotionConfig reducedMotion={settings.animations ? 'user' : 'always'}>{children}</MotionConfig>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <AiProvider>
        <Motion>
          <App />
        </Motion>
      </AiProvider>
    </AppProvider>
  </StrictMode>
)
