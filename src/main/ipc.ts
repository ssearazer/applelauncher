import { errorText } from '../shared/pure'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

let allowedOrigin = ''
export const setAllowedOrigin = (url: string) => {
  allowedOrigin = url.startsWith('file:') ? 'file://' : new URL(url).origin
}

/** Every IPC entry point: sender check, argument validation, errors reduced to a message. */
export function handle<S extends z.ZodTypeAny[], R>(channel: string, schemas: [...S], fn: (...args: { [K in keyof S]: z.infer<S[K]> }) => R) {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...raw: unknown[]) => {
    const url = event.senderFrame?.url ?? ''
    if (!allowedOrigin || !url.startsWith(allowedOrigin)) throw new Error('Запрос отклонён')
    if (raw.length > schemas.length) throw new Error(`Лишние аргументы для ${channel}`)
    const args = schemas.map((s, i) => s.parse(raw[i])) as { [K in keyof S]: z.infer<S[K]> }
    try {
      return { ok: true, value: await fn(...args) }
    } catch (e) {
      // returned rather than thrown so the renderer gets the plain message, not Electron's wrapper text
      return { ok: false, error: errorText(e) }
    }
  })
}

export { z }
