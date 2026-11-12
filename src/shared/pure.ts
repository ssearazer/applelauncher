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
