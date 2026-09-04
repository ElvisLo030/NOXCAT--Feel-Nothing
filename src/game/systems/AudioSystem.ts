export type SoundCue = 'button' | 'graze' | 'hurt' | 'full' | 'draw' | 'launch' | 'reflect' | 'bossHit' | 'win' | 'lose';

const cues: Record<SoundCue, [number, number, OscillatorType]> = {
  button: [420, 0.05, 'square'],
  graze: [840, 0.055, 'sine'],
  hurt: [120, 0.16, 'sawtooth'],
  full: [620, 0.22, 'triangle'],
  draw: [260, 0.08, 'sine'],
  launch: [170, 0.18, 'sawtooth'],
  reflect: [1080, 0.13, 'triangle'],
  bossHit: [92, 0.2, 'square'],
  win: [880, 0.36, 'triangle'],
  lose: [90, 0.42, 'sawtooth']
};

export class AudioSystem {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    const AudioContextConstructor = globalThis.AudioContext;
    if (typeof AudioContextConstructor === 'undefined') return;
    try {
      this.context ??= new AudioContextConstructor();
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Audio is an enhancement; restricted/headless browsers stay playable.
      this.context = null;
    }
  }

  play(cue: SoundCue): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const [frequency, duration, type] = cues[cue];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (cue === 'launch') oscillator.frequency.exponentialRampToValueAtTime(680, now + duration);
    if (cue === 'win') oscillator.frequency.exponentialRampToValueAtTime(1320, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  close(): void {
    void this.context?.close();
    this.context = null;
  }
}
