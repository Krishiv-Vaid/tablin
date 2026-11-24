/**
 * Tiny synthesized sound effects (WebAudio oscillators): no audio files, no
 * network requests. Silent unless enabled; failures (autoplay policy) are ignored.
 */
export type SoundName = 'appear' | 'grab' | 'launch' | 'arrive' | 'celebrate';

export class CharacterSound {
  private ctx: AudioContext | null = null;

  constructor(private enabled: boolean) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private context(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    ctx: AudioContext,
    {
      from,
      to,
      start = 0,
      duration,
      type = 'sine',
      gain = 0.06,
    }: {
      from: number;
      to: number;
      start?: number;
      duration: number;
      type?: OscillatorType;
      gain?: number;
    },
  ): void {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  play(name: SoundName): void {
    const ctx = this.context();
    if (!ctx) return;
    try {
      switch (name) {
        case 'appear':
          this.tone(ctx, { from: 520, to: 880, duration: 0.12 });
          this.tone(ctx, { from: 780, to: 1180, start: 0.09, duration: 0.1 });
          break;
        case 'grab':
          this.tone(ctx, { from: 900, to: 640, duration: 0.08, type: 'triangle' });
          break;
        case 'launch':
          this.tone(ctx, { from: 180, to: 760, duration: 0.28, type: 'triangle', gain: 0.07 });
          break;
        case 'arrive':
          this.tone(ctx, { from: 660, to: 990, duration: 0.09, type: 'square', gain: 0.025 });
          break;
        case 'celebrate':
          [0, 0.08, 0.16].forEach((start, i) =>
            this.tone(ctx, { from: 660 + i * 220, to: 700 + i * 240, start, duration: 0.1 }),
          );
          break;
      }
    } catch {
      // Audio is a nicety; never let it break the character.
    }
  }

  destroy(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
