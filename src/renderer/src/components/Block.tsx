import { useMemo } from 'react'

/** A monochrome isometric grass block: 8×8 "pixels" per face, shaded by a seeded noise. */
const N = 8
function noise(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

function face(rand: () => number, shade: (row: number) => [number, number]) {
  const cells: { x: number; y: number; l: number }[] = []
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const [base, spread] = shade(y)
      cells.push({ x, y, l: base + (rand() - 0.5) * spread })
    }
  return cells
}

export function Block({ size = 220, dark }: { size?: number; dark: boolean }) {
  const faces = useMemo(() => {
    const r = noise(7)
    // lightness in %, top lightest; the side's first rows are the grass overhang
    return {
      top: face(r, () => [dark ? 78 : 86, 14]),
      left: face(r, (y) => (y < 2 || (y === 2 && r() > 0.5) ? [dark ? 62 : 70, 10] : [dark ? 32 : 46, 12])),
      right: face(r, (y) => (y < 2 || (y === 2 && r() > 0.5) ? [dark ? 50 : 60, 10] : [dark ? 22 : 36, 10]))
    }
  }, [dark])
  const S = 100
  const c = S / N
  const k = Math.cos(Math.PI / 6)
  const W = 2 * k * S
  const H = 2 * S
  const fill = (l: number) => `hsl(0 0% ${l.toFixed(1)}%)`
  const cells = (list: { x: number; y: number; l: number }[]) =>
    list.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x * c} y={p.y * c} width={c + 0.4} height={c + 0.4} fill={fill(p.l)} />)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={size} height={(size * H) / W} role="img" aria-label="Блок Minecraft">
      <g transform={`matrix(${k} 0.5 ${-k} 0.5 ${W / 2} 0)`}>{cells(faces.top)}</g>
      <g transform={`matrix(${k} 0.5 0 1 0 ${S / 2})`}>{cells(faces.left)}</g>
      <g transform={`matrix(${k} -0.5 0 1 ${W / 2} ${S})`}>{cells(faces.right)}</g>
    </svg>
  )
}
