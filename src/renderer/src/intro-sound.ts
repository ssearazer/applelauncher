/** Quiet synthesized sound for the launch animation (no audio file: nothing to bundle). Peak level stays very low. */
export function playIntroSound(): void {
  try {
    const ctx = new AudioContext()
    const t0 = ctx.currentTime + 0.05
    const master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)

    const tone = (freq: number, at: number, peak: number, decay: number) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0 + at)
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.04)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + decay)
      osc.connect(g).connect(master)
      osc.start(t0 + at)
      osc.stop(t0 + at + decay + 0.05)
    }

    // 1. the apple appears: a soft low note
    tone(392, 0.1, 0.05, 0.9)
    tone(587.33, 0.14, 0.025, 0.8)

    // 2. the line orbits: a gentle filtered-noise sweep
    const len = Math.floor(ctx.sampleRate * 1.3)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3
    bp.frequency.setValueAtTime(500, t0 + 0.55)
    bp.frequency.exponentialRampToValueAtTime(2600, t0 + 1.6)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t0 + 0.55)
    ng.gain.exponentialRampToValueAtTime(0.018, t0 + 1.0)
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7)
    noise.connect(bp).connect(ng).connect(master)
    noise.start(t0 + 0.55)
    noise.stop(t0 + 1.9)

    // 3. the leaf grows: a small bright chime
    tone(1318.5, 1.75, 0.03, 1.1)
    tone(1760, 1.82, 0.018, 1.0)

    setTimeout(() => void ctx.close(), 4000)
  } catch {
    /* audio is optional */
  }
}
