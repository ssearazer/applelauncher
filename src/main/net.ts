import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const USER_AGENT = 'AppleLauncher/1.0 (github.com/ssearazer/applelauncher)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if ((e as { noRetry?: boolean }).noRetry) break
      await sleep(500 * 2 ** i)
    }
  }
  throw last
}

export class HttpError extends Error {
  constructor(public status: number, public body: string, url: string) {
    super(`HTTP ${status} ${url}`)
  }
  get noRetry() {
    return this.status >= 400 && this.status < 500 && this.status !== 429
  }
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  return retry(async () => {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } })
    if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ''), url)
    return res
  })
}

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  return (await request(url, init)).json() as Promise<T>
}

export async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  return getJson<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }
  })
}

export async function fileHash(path: string, algorithm: 'sha1' | 'sha512'): Promise<string> {
  const h = createHash(algorithm)
  await pipeline(createReadStream(path), h)
  return h.digest('hex')
}

export interface Hashes { sha1?: string; sha512?: string }

/** Download to `dest` via a temp file; verifies any provided hash before the file appears. */
export async function download(urls: string | string[], dest: string, hashes: Hashes = {}, onBytes?: (n: number) => void): Promise<void> {
  const list = Array.isArray(urls) ? urls : [urls]
  if (!list.every((u) => u.startsWith('https://'))) throw new Error('Разрешены только HTTPS-загрузки')
  await mkdir(dirname(dest), { recursive: true })
  const tmp = dest + '.part'
  let lastError: unknown
  for (const url of list) {
    try {
      await retry(async () => {
        const res = await request(url)
        if (!res.body) throw new Error('Пустой ответ сервера')
        const body = Readable.fromWeb(res.body as never)
        if (onBytes) body.on('data', (c: Buffer) => onBytes(c.length))
        await pipeline(body, createWriteStream(tmp))
        for (const algo of ['sha512', 'sha1'] as const) {
          const want = hashes[algo]
          if (want && (await fileHash(tmp, algo)) !== want.toLowerCase()) {
            throw new Error(`Контрольная сумма не совпала: ${url}`)
          }
        }
      })
      await rename(tmp, dest)
      return
    } catch (e) {
      lastError = e
      await rm(tmp, { force: true })
    }
  }
  throw lastError
}
