export type BattleMusicMode =
  | 'intro'
  | 'dodge'
  | 'vulnerable'
  | 'aiming'
  | 'launched'
  | 'staggered';

const BPM = 116;
const STEP_SECONDS = 60 / BPM / 4;
const LOOK_AHEAD_SECONDS = 0.16;
const SCHEDULER_INTERVAL_MS = 45;
const ROOT_FREQUENCY = 55;

const BASS_STEPS = [0, 0, 3, 0, 5, 3, 7, 5] as const;
const ARP_STEPS = [12, 15, 19, 22, 19, 15, 10, 15] as const;

function semitonesFromRoot(semitones: number): number {
  return ROOT_FREQUENCY * 2 ** (semitones / 12);
}

/** A deterministic, offline-safe Web Audio score with a sample-accurate loop. */
export class BattleMusic {
  private mode: BattleMusicMode = 'intro';
  private timer: ReturnType<typeof globalThis.setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  setMode(mode: BattleMusicMode): void {
    this.mode = mode;
  }

  start(): void {
    if (this.timer !== null || this.context.state !== 'running') return;
    this.nextStepTime = this.context.currentTime + 0.035;
    this.scheduleWindow();
    this.timer = globalThis.setInterval(() => this.scheduleWindow(), SCHEDULER_INTERVAL_MS);
  }

  pause(): void {
    if (this.timer !== null) globalThis.clearInterval(this.timer);
    this.timer = null;
  }

  stop(): void {
    this.pause();
    this.step = 0;
  }

  private scheduleWindow(): void {
    const horizon = this.context.currentTime + LOOK_AHEAD_SECONDS;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += STEP_SECONDS;
    }
  }

  private scheduleStep(absoluteStep: number, time: number): void {
    const step16 = absoluteStep % 16;
    const step8 = absoluteStep % 8;
    const isFocus = this.mode === 'vulnerable' || this.mode === 'aiming';

    if (this.mode === 'intro') {
      if (step16 === 0) this.pulse(time, 73.42, 0.32, 0.035);
      if (step16 === 12) this.signal(time, semitonesFromRoot(19), 0.08, 0.012);
      return;
    }

    if (isFocus) {
      // Half-time heartbeat leaves room for the pull gesture and aim SFX.
      if (step16 === 0 || step16 === 8) this.kick(time, 0.045);
      if (step16 === 4 || step16 === 12) this.pulse(time, 82.41, 0.18, 0.025);
      if (this.mode === 'aiming' && step16 % 2 === 1) {
        this.signal(time, semitonesFromRoot(ARP_STEPS[step8] ?? 12), 0.045, 0.008);
      }
      return;
    }

    if (step16 === 0 || step16 === 8 || (this.mode === 'launched' && step16 === 12)) {
      this.kick(time, 0.052);
    }
    if (step16 === 4 || step16 === 12) this.snare(time, 0.026);
    if (step16 % 2 === 1) this.hat(time, step16 % 4 === 3 ? 0.012 : 0.008);

    if (step16 % 4 === 0) {
      const bassIndex = Math.floor(absoluteStep / 4) % BASS_STEPS.length;
      this.bass(time, semitonesFromRoot(BASS_STEPS[bassIndex] ?? 0));
    }

    const melodicDensity = this.mode === 'staggered' ? 2 : 4;
    if (step16 % melodicDensity === 2) {
      this.signal(time, semitonesFromRoot(ARP_STEPS[step8] ?? 12), 0.07, 0.012);
    }
  }

  private voice(
    time: number,
    frequency: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    endFrequency = frequency,
  ): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    }
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private kick(time: number, peak: number): void {
    this.voice(time, 112, 0.17, peak, 'sine', 46);
  }

  private snare(time: number, peak: number): void {
    this.voice(time, 174, 0.095, peak, 'square', 91);
    this.voice(time + 0.006, 1180, 0.045, peak * 0.24, 'sawtooth', 540);
  }

  private hat(time: number, peak: number): void {
    this.voice(time, 3240, 0.025, peak, 'square', 2380);
  }

  private bass(time: number, frequency: number): void {
    this.voice(time, frequency, STEP_SECONDS * 2.7, 0.026, 'triangle', frequency * 0.985);
  }

  private pulse(time: number, frequency: number, duration: number, peak: number): void {
    this.voice(time, frequency, duration, peak, 'triangle', frequency * 0.93);
  }

  private signal(time: number, frequency: number, duration: number, peak: number): void {
    this.voice(time, frequency, duration, peak, 'sine', frequency * 1.006);
  }
}
