import { safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFile } from 'node:fs/promises'
import type { Account } from '../shared/types'
import { OFFLINE_NAME, offlineUuid } from './offline'
import { getSettings, readStore, setSettings, writeJson } from './store'
import { HttpError, getJson, postJson, request } from './net'

/*
 * Microsoft OAuth 2.0 authorization-code flow with PKCE, opened in the system browser and
 * received on a loopback redirect. The launcher never sees the Microsoft password.
 * Requires an Azure app (personal accounts, redirect "http://localhost") that Mojang has approved
 * for the Minecraft services API — see README.
 */

const AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access'

interface StoredAccount {
  id: string
  name: string
  skinUrl?: string
  skinVariant: 'classic' | 'slim'
  refresh?: string // encrypted, base64; absent for offline accounts
  mcToken?: string // encrypted, base64
  mcExpires?: number
  valid: boolean
  offline?: boolean
}

const enc = (s: string) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Шифрование ОС недоступно — токены не могут быть сохранены безопасно')
  return safeStorage.encryptString(s).toString('base64')
}
const dec = (s: string) => safeStorage.decryptString(Buffer.from(s, 'base64'))

let accounts: StoredAccount[] = readStore<StoredAccount[]>('accounts.json', [])
const save = () => writeJson('accounts.json', accounts)

export const listAccounts = (): Account[] =>
  accounts.map(({ id, name, skinUrl, skinVariant, valid, offline }) => ({ id, name, skinUrl, skinVariant, valid, offline }))

const hasLicence = () => accounts.some((a) => !a.offline)

/** Offline nickname, Prism-style: allowed only for someone who has added a Microsoft account that owns the game. */
export function addOffline(name: string): Account {
  if (!hasLicence()) throw new Error('Сначала войдите в аккаунт Microsoft с купленной Minecraft: Java Edition')
  if (!OFFLINE_NAME.test(name)) throw new Error('Ник: 3–16 символов, латиница, цифры и _')
  const id = offlineUuid(name)
  if (!accounts.some((a) => a.id === id)) accounts = [...accounts, { id, name, skinVariant: 'classic', valid: true, offline: true }]
  save()
  setSettings({ selectedAccount: id })
  return listAccounts().find((a) => a.id === id)!
}

const b64url = (b: Buffer) => b.toString('base64url')

// AppleLauncher's own Azure app (public client, not a secret); settings or env can override it
const BUILT_IN_CLIENT_ID = 'cf19bd3a-0d9c-4c7a-b791-4ca1647cb852'
const clientId = () => getSettings().msClientId.trim() || process.env.APPLELAUNCHER_MS_CLIENT_ID || BUILT_IN_CLIENT_ID

/** Opens the browser and resolves with the authorization code from the loopback redirect. */
function authorize(): Promise<{ code: string; verifier: string; redirect: string }> {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  const client = clientId()
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname !== '/') return res.writeHead(404).end()
      const done = (ok: boolean, text: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html><meta charset="utf-8"><title>AppleLauncher</title><body style="font:16px -apple-system,Segoe UI,sans-serif;background:#080808;color:#fff;display:grid;place-items:center;height:100vh;margin:0"><p>${text}</p></body>`)
        clearTimeout(timer)
        server.close()
      }
      if (url.searchParams.get('state') !== state) {
        done(false, 'Неверный ответ авторизации. Вернитесь в AppleLauncher и попробуйте снова.')
        return reject(new Error('Ответ авторизации не прошёл проверку state'))
      }
      const code = url.searchParams.get('code')
      if (!code) {
        done(false, 'Вход отменён. Можно закрыть эту вкладку.')
        return reject(new Error(url.searchParams.get('error_description') ?? 'Вход отменён'))
      }
      done(true, 'Готово. Вернитесь в AppleLauncher — эту вкладку можно закрыть.')
      resolve({ code, verifier, redirect })
    })
    let redirect = ''
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('Время ожидания входа истекло'))
    }, 5 * 60_000)
    server.listen(0, () => {
      redirect = `http://localhost:${(server.address() as AddressInfo).port}`
      const q = new URLSearchParams({
        client_id: client,
        response_type: 'code',
        redirect_uri: redirect,
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account'
      })
      void shell.openExternal(`${AUTH}/authorize?${q}`)
    })
  })
}

async function msToken(params: Record<string, string>): Promise<{ access_token: string; refresh_token: string }> {
  return getJson(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), scope: SCOPE, ...params })
  })
}

const XSTS_ERRORS: Record<number, string> = {
  2148916233: 'У этой учётной записи Microsoft нет профиля Xbox. Создайте его на xbox.com и повторите вход.',
  2148916235: 'Xbox Live недоступен в вашей стране.',
  2148916236: 'Аккаунту требуется подтверждение возраста на xbox.com.',
  2148916237: 'Аккаунту требуется подтверждение возраста на xbox.com.',
  2148916238: 'Это детская учётная запись. Добавьте её в семейную группу Microsoft.'
}

/** MS access token → Xbox Live → XSTS → Minecraft services token + profile. */
async function minecraftLogin(msAccess: string) {
  const xbl = await postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccess}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' }
  )
  let xsts: { Token: string }
  try {
    xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  } catch (e) {
    const xerr = e instanceof HttpError ? (JSON.parse(e.body || '{}') as { XErr?: number }).XErr : undefined
    throw new Error((xerr && XSTS_ERRORS[xerr]) || 'Не удалось войти в Xbox Live')
  }
  const uhs = xbl.DisplayClaims.xui[0].uhs
  let mc: { access_token: string; expires_in: number }
  try {
    mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` })
  } catch (e) {
    if (e instanceof HttpError && e.status === 403)
      throw new Error('Minecraft отклонил это Azure-приложение. Client ID должен быть одобрен Mojang для Minecraft API (aka.ms/mce-reviewappid).')
    throw e
  }
  const auth = { Authorization: `Bearer ${mc.access_token}` }
  let profile: { id: string; name: string; skins?: { url: string; state: string; variant: string }[] }
  try {
    profile = await getJson('https://api.minecraftservices.com/minecraft/profile', { headers: auth })
  } catch (e) {
    if (e instanceof HttpError && e.status === 404)
      throw new Error('На этом аккаунте нет Minecraft: Java Edition. Купите игру на minecraft.net или войдите в другой аккаунт.')
    throw e
  }
  return { mc, profile }
}

function upsert(refresh: string, r: Awaited<ReturnType<typeof minecraftLogin>>): StoredAccount {
  const skin = r.profile.skins?.find((s) => s.state === 'ACTIVE')
  const acc: StoredAccount = {
    id: r.profile.id,
    name: r.profile.name,
    skinUrl: skin?.url.replace(/^http:/, 'https:'),
    skinVariant: skin?.variant?.toLowerCase() === 'slim' ? 'slim' : 'classic',
    refresh: enc(refresh),
    mcToken: enc(r.mc.access_token),
    mcExpires: Date.now() + r.mc.expires_in * 1000,
    valid: true
  }
  accounts = [...accounts.filter((a) => a.id !== acc.id), acc]
  save()
  return acc
}

export async function login(): Promise<Account> {
  const { code, verifier, redirect } = await authorize()
  const ms = await msToken({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect })
  const acc = upsert(ms.refresh_token, await minecraftLogin(ms.access_token))
  setSettings({ selectedAccount: acc.id })
  return listAccounts().find((a) => a.id === acc.id)!
}

export function logout(id: string): void {
  accounts = accounts.filter((a) => a.id !== id)
  save()
  if (getSettings().selectedAccount === id) setSettings({ selectedAccount: accounts[0]?.id })
}

/** Returns a usable Minecraft token, refreshing the Microsoft chain when it is close to expiry. */
export async function ensureFresh(id: string | undefined): Promise<{ id: string; name: string; token: string; offline?: boolean }> {
  const acc = accounts.find((a) => a.id === id)
  if (!acc) throw new Error('Войдите в аккаунт Microsoft, чтобы играть')
  if (acc.offline) {
    if (!hasLicence()) throw new Error('Оффлайн-аккаунт работает, только пока в лаунчер добавлен аккаунт Microsoft с купленной игрой')
    return { id: acc.id, name: acc.name, token: '0', offline: true }
  }
  if (acc.mcToken && (acc.mcExpires ?? 0) > Date.now() + 5 * 60_000) return { id: acc.id, name: acc.name, token: dec(acc.mcToken) }
  try {
    const ms = await msToken({ grant_type: 'refresh_token', refresh_token: dec(acc.refresh!) })
    const fresh = upsert(ms.refresh_token, await minecraftLogin(ms.access_token))
    return { id: fresh.id, name: fresh.name, token: dec(fresh.mcToken!) }
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) {
      acc.valid = false
      save()
      throw new Error('Сессия истекла. Войдите в аккаунт заново.')
    }
    throw e
  }
}

export async function skinDataUrl(id: string): Promise<string | undefined> {
  const acc = accounts.find((a) => a.id === id)
  if (!acc?.skinUrl) return undefined
  const buf = Buffer.from(await (await request(acc.skinUrl)).arrayBuffer())
  return `data:image/png;base64,${buf.toString('base64')}`
}

async function refreshProfile(id: string, token: string) {
  const p = await getJson<{ skins?: { url: string; state: string; variant: string }[] }>('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const acc = accounts.find((a) => a.id === id)!
  const skin = p.skins?.find((s) => s.state === 'ACTIVE')
  acc.skinUrl = skin?.url.replace(/^http:/, 'https:')
  acc.skinVariant = skin?.variant?.toLowerCase() === 'slim' ? 'slim' : 'classic'
  save()
}

const needOnline = (id: string) => {
  if (accounts.find((a) => a.id === id)?.offline) throw new Error('У оффлайн-аккаунта нет скина в сервисе Mojang')
}

export async function uploadSkin(id: string, file: string, variant: 'classic' | 'slim'): Promise<void> {
  needOnline(id)
  const png = await readFile(file)
  // PNG signature + IHDR width/height: Minecraft accepts 64x64 or legacy 64x32
  const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20)
  if (!isPng || w !== 64 || (h !== 64 && h !== 32)) throw new Error('Скин должен быть PNG размером 64×64 или 64×32')
  const { token } = await ensureFresh(id)
  const form = new FormData()
  form.append('variant', variant)
  form.append('file', new Blob([png], { type: 'image/png' }), 'skin.png')
  await request('https://api.minecraftservices.com/minecraft/profile/skins', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } })
  await refreshProfile(id, token)
}

export async function resetSkin(id: string): Promise<void> {
  needOnline(id)
  const { token } = await ensureFresh(id)
  await request('https://api.minecraftservices.com/minecraft/profile/skins/active', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  await refreshProfile(id, token)
}
