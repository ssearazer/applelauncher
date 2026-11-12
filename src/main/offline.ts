import { createHash } from 'node:crypto'

export const OFFLINE_NAME = /^[A-Za-z0-9_]{3,16}$/

/** The UUID offline-mode servers assign: UUIDv3 of "OfflinePlayer:<name>", without dashes. */
export function offlineUuid(name: string): string {
  const b = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  b[6] = (b[6] & 0x0f) | 0x30
  b[8] = (b[8] & 0x3f) | 0x80
  return b.toString('hex')
}
