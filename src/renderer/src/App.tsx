import { AnimatePresence, motion } from 'framer-motion'
import { AccountsDialog, LogDialog, Sidebar, TitleBar, Toasts } from './components/Shell'
import { Home } from './pages/Home'
import { Mods } from './pages/Mods'
import { Packs } from './pages/Packs'
import { Settings } from './pages/Settings'
import { Skins } from './pages/Skins'
import { Versions } from './pages/Versions'
import { useApp } from './state'

const PAGES = { home: Home, versions: Versions, mods: Mods, packs: Packs, skins: Skins, settings: Settings }

export function App() {
  const { page } = useApp()
  const Page = PAGES[page]
  return (
    <div className="flex h-screen bg-bg text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-10 pb-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={page} className="mx-auto h-full max-w-[1040px]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AccountsDialog />
      <LogDialog />
      <Toasts />
    </div>
  )
}
