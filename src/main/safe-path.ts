import { isAbsolute, resolve, sep } from 'node:path'

/** Join a relative path from untrusted input (archives, API responses) and refuse anything escaping base. */
export function safeJoin(base: string, rel: string): string {
  if (isAbsolute(rel) || rel.includes('\0')) throw new Error(`Недопустимый путь: ${rel}`)
  const root = resolve(base)
  const full = resolve(root, rel)
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`Недопустимый путь: ${rel}`)
  return full
}
