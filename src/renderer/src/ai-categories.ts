import { Car, Cog, Compass, Crown, Cuboid, Flame, Ghost, Hammer, LayoutGrid, Map, Music, PawPrint, Rocket, Skull, Sun, Swords, Users, WandSparkles, Wheat, Zap, type LucideIcon } from 'lucide-react'
import type { Key } from './i18n'

/*
 * Themes the player can pick for the AI assistant. Any number of them can be combined: their texts are put together
 * into one request (see AiProvider.run). Labels and request texts live in i18n.ts as `ai.cat.<id>` and `ai.cat.<id>.text`.
 */
export interface AiCategory { id: string; icon: LucideIcon; label: Key; text: Key }

const cat = (id: string, icon: LucideIcon): AiCategory => ({ id, icon, label: `ai.cat.${id}` as Key, text: `ai.cat.${id}.text` as Key })

export const AI_CATEGORIES: AiCategory[] = [
  cat('perf', Zap),
  cat('shaders', Sun),
  cat('tech', Cog),
  cat('magic', WandSparkles),
  cat('adventure', Compass),
  cat('weapons', Swords),
  cat('vehicles', Car),
  cat('bosses', Skull),
  cat('survival', Flame),
  cat('rpg', Crown),
  cat('exploration', Map),
  cat('building', Hammer),
  cat('farming', Wheat),
  cat('creatures', PawPrint),
  cat('horror', Ghost),
  cat('space', Rocket),
  cat('atmosphere', Music),
  cat('qol', LayoutGrid),
  cat('vanilla', Cuboid),
  cat('coop', Users),
]
