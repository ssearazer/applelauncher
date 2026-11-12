// Renders build/icon.png (512×512): the sidebar mark, a cube on a dark rounded tile. No dependencies.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 512, SS = 4 // 4×4 supersampling for smooth edges
const k = S / 64
const tile = { r: 15 * k }
const faces = [
  { pts: [[32, 14], [47, 22.5], [32, 31], [17, 22.5]], c: 245 },
  { pts: [[17, 25.5], [30.5, 33.5], [30.5, 50], [17, 42]], c: 150 },
  { pts: [[47, 25.5], [33.5, 33.5], [33.5, 50], [47, 42]], c: 92 }
].map((f) => ({ ...f, pts: f.pts.map(([x, y]) => [x * k, y * k]) }))

const inPoly = (x, y, p) => {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside
  return inside
}
const inTile = (x, y) => {
  const r = tile.r, cx = Math.min(Math.max(x, r), S - r), cy = Math.min(Math.max(y, r), S - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  for (let x = 0; x < S; x++) {
    let a = 0, v = 0
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS
        if (!inTile(px, py)) continue
        a++
        v += faces.find((f) => inPoly(px, py, f.pts))?.c ?? 12
      }
    const o = y * (S * 4 + 1) + 1 + x * 4
    const g = a ? Math.round(v / a) : 0
    raw[o] = raw[o + 1] = raw[o + 2] = g
    raw[o + 3] = Math.round((a / (SS * SS)) * 255)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
const crc = (b) => {
  let c = ~0
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8)
  return ~c >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr.set([8, 6, 0, 0, 0], 8)
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log('build/icon.png written')
