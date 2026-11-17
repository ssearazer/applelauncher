// Pure helpers with no Electron or DOM imports, so tests can run them in plain Node.

/** NeoForge versions encode the game version: 21.1.x → 1.21.1, 20.4.x → 1.20.4, 26.1.x → 26.1 */
export function neoForgeMatches(neo: string, mc: string): boolean {
  const [a, b] = neo.split('.')
  if (Number(a) >= 26) return mc === (b === '0' ? a : `${a}.${b}`) || mc.startsWith(`${a}.${b}.`)
  return mc === (b === '0' ? `1.${a}` : `1.${a}.${b}`)
}

export function splitArgs(s: string): string[] {
  // a token is a run of non-space chars and quoted segments, so -Dfoo="a b" stays whole
  return (s.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((a) => a.replace(/"/g, ''))
}

/** Java the game will get from Mojang. shortcut: inferred from the version id; exact value lives in the installed version json. */
export function javaFor(mc: string): number {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(mc)
  if (!m) return /^\d{2}\./.test(mc) ? 25 : 21
  const minor = Number(m[1]), patch = Number(m[2] ?? 0)
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21
  if (minor >= 18) return 17
  if (minor === 17) return 16
  return 8
}

export interface PackTarget { minecraft: string; loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'; loaderVersion?: string }

/** Prism / MultiMC mmc-pack.json → game + loader. */
export function fromMmcPack(json: { components?: { uid: string; version?: string }[] }): PackTarget {
  const v = (uid: string) => json.components?.find((c) => c.uid === uid)?.version
  const minecraft = v('net.minecraft')
  if (!minecraft) throw new Error('В mmc-pack.json нет версии Minecraft')
  const pairs = [['fabric', 'net.fabricmc.fabric-loader'], ['quilt', 'org.quiltmc.quilt-loader'], ['neoforge', 'net.neoforged'], ['forge', 'net.minecraftforge']] as const
  for (const [loader, uid] of pairs) if (v(uid)) return { minecraft, loader, loaderVersion: v(uid) }
  return { minecraft, loader: 'vanilla' }
}

/** A version json as TLauncher (and the vanilla launcher) stores it → game + loader. */
export function fromVersionJson(json: {
  id?: string; inheritsFrom?: string; jar?: string; libraries?: { name?: string }[]; arguments?: { game?: unknown[] }; minecraftArguments?: string
}): PackTarget {
  const libs = (json.libraries ?? []).map((l) => l.name ?? '')
  const lib = (re: RegExp) => libs.map((n) => re.exec(n)?.[1]).find(Boolean)
  const args = [...(json.arguments?.game ?? []).filter((a): a is string => typeof a === 'string'), ...(json.minecraftArguments?.split(' ') ?? [])]
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const isMc = (s?: string) => !!s && /^(1\.\d+(\.\d+)?|\d{2}\.\d+(\.\d+)?)$/.test(s)
  const minecraft = [json.inheritsFrom, arg('--fml.mcVersion'), lib(/^net\.fabricmc:intermediary:(.+)$/), lib(/^org\.quiltmc:hashed:(.+)$/), json.jar, json.id].find(isMc)
  if (!minecraft) throw new Error('Не удалось определить версию Minecraft сборки')
  const fabric = lib(/^net\.fabricmc:fabric-loader:(.+)$/)
  if (fabric) return { minecraft, loader: 'fabric', loaderVersion: fabric }
  const quilt = lib(/^org\.quiltmc:quilt-loader:(.+)$/)
  if (quilt) return { minecraft, loader: 'quilt', loaderVersion: quilt }
  const neo = arg('--fml.neoForgeVersion') ?? lib(/^net\.neoforged:neoforge:(.+?)(?::.*)?$/)
  if (neo) return { minecraft, loader: 'neoforge', loaderVersion: neo }
  const forge = arg('--fml.forgeVersion') ?? lib(/^net\.minecraftforge:(?:forge|fmlloader):([^:]+)/)
  // forge coordinates look like 1.20.1-47.2.0 or 1.7.10-10.13.4.1614-1.7.10
  if (forge) return { minecraft, loader: 'forge', loaderVersion: forge.replace(`${minecraft}-`, '').replace(`-${minecraft}`, '') }
  return { minecraft, loader: 'vanilla' }
}

/** Readable text for any thrown value; AggregateError (parallel downloads) has an empty message of its own. */
export function errorText(e: unknown): string {
  if (e instanceof AggregateError && e.errors.length) {
    const first = errorText(e.errors[0])
    return e.errors.length > 1 ? `Не удалось скачать файлов: ${e.errors.length}. Первая ошибка: ${first}` : first
  }
  if (e instanceof Error) return e.message || (e as { code?: string }).code || e.name
  return String(e)
}

/**
 * The first JSON object in a model reply. Skips <think> blocks and code fences and balances braces
 * outside of strings, so prose before or after the object does not break parsing.
 */
export function extractJson(text: string): unknown {
  const src = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
  for (let start = src.indexOf('{'); start >= 0; start = src.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false
    for (let i = start; i < src.length; i++) {
      const c = src[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(src.slice(start, i + 1))
        } catch {
          break // not valid JSON from this brace; try the next one
        }
      }
    }
  }
  throw new Error('В ответе модели нет JSON-объекта')
}

/** Single-line display text from untrusted input: control characters removed, spaces collapsed, length capped. */
export function cleanText(s: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

/** True when version `a` (e.g. "v1.2.0") is newer than `b`. Compares numeric parts; a missing part counts as 0. */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
  const x = parts(a), y = parts(b)
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/** Text of an OpenAI-style chat completion: the content of the first choice (a string or a list of text parts). */
export function completionText(data: unknown): string {
  const d = data as { choices?: { message?: { content?: string | { type?: string; text?: string }[] | null } }[] }
  const content = d?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
  return ''
}

/**
 * Search hits from several queries mixed in turn (first of each list, then second of each, ...), duplicates removed,
 * so every theme of a request stays represented when only the first `max` can be used.
 */
export function interleaveHits<T extends { project_id: string }>(lists: T[][], max: number): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const h = l[i]
      if (h && out.length < max && !seen.has(h.project_id)) {
        seen.add(h.project_id)
        out.push(h)
      }
    }
  }
  return out
}

/** True for the assistant's messages about a spent quota, a rejected key or a rate limit: the player can fix those with their own key. */
export const isAiLimitError = (message: string | undefined): boolean => !!message && /лимит|ключ отклонён|rate limit|quota/i.test(message)
