import { BattleMusic, type BattleMusicMode } from './BattleMusic';
import { MusicPlayer } from '../../audio/MusicPlayer';
import { musicTrack, type MusicTrackKey } from '../../audio/MusicRegistry';

export type SoundCue =
  | 'button'
  | 'homeSelect'
  | 'graze'
  | 'hurt'
  | 'full'
  | 'draw'
  | 'launch'
  | 'reflect'
  | 'bossHit'
  | 'bossDefeat'
  | 'win'
  | 'lose';

const cues: Record<SoundCue, [number, number, OscillatorType]> = {
  button: [420, 0.05, 'square'],
  homeSelect: [330, 0.24, 'triangle'],
  graze: [840, 0.055, 'sine'],
  hurt: [120, 0.16, 'sawtooth'],
  full: [620, 0.22, 'triangle'],
  draw: [260, 0.08, 'sine'],
  launch: [170, 0.18, 'sawtooth'],
  reflect: [1080, 0.13, 'triangle'],
  bossHit: [92, 0.2, 'square'],
  bossDefeat: [82, 1.1, 'sawtooth'],
  win: [880, 0.36, 'triangle'],
  lose: [90, 0.42, 'sawtooth']
};

export class AudioSystem {
  private context: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private fileMusic: MusicPlayer | null = null;
  private fallbackMusic: BattleMusic | null = null;
  private musicRequested = false;
  private musicPaused = false;
  private musicMode: BattleMusicMode = 'intro';
  private musicTrack: MusicTrackKey = 'battle.main';
  private musicLoading = false;
  private drawOscillators: OscillatorNode[] = [];
  private drawGain: GainNode | null = null;
  private drawModulationGains: GainNode[] = [];
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopDraw();
      this.sfxBus?.gain.setValueAtTime(0.0001, this.context?.currentTime ?? 0);
      this.fileMusic?.pause();
      this.fallbackMusic?.pause();
    } else {
      this.sfxBus?.gain.setValueAtTime(0.9, this.context?.currentTime ?? 0);
      this.startMusicIfReady();
    }
  }

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    const AudioContextConstructor = globalThis.AudioContext;
    if (typeof AudioContextConstructor === 'undefined') return;
    try {
      this.context ??= new AudioContextConstructor();
      if (this.context.state === 'suspended') await this.context.resume();
      this.ensureBuses();
      this.startMusicIfReady();
    } catch {
      // Audio is an enhancement; restricted/headless browsers stay playable.
      this.resetAudioGraph();
    }
  }

  play(cue: SoundCue): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    this.ensureBuses();
    if (cue === 'homeSelect') {
      this.playHomeSelect();
      return;
    }
    if (cue === 'bossDefeat') {
      this.playBossDefeat();
      return;
    }
    const [frequency, duration, type] = cues[cue];
    const now = this.context.currentTime;
    const endFrequency = cue === 'launch' ? 680 : cue === 'win' ? 1320 : frequency;
    this.scheduleTone(frequency, duration, type, now, 0.075, endFrequency);
  }

  startDraw(): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    this.stopDraw();
    this.ensureBuses();
    const now = this.context.currentTime;
    const voice = this.context.createOscillator();
    const overtone = this.context.createOscillator();
    const wobble = this.context.createOscillator();
    const voiceGain = this.context.createGain();
    const overtoneGain = this.context.createGain();
    const pitchWobble = this.context.createGain();
    const volumeWobble = this.context.createGain();

    // A falling onset reads as "喵—"; pull distance then raises the vowel into
    // a wobbling "敖敖敖" without sampling or claiming to be a real cat voice.
    voice.type = 'triangle';
    voice.frequency.setValueAtTime(430, now);
    voice.frequency.exponentialRampToValueAtTime(270, now + 0.17);
    overtone.type = 'sawtooth';
    overtone.frequency.setValueAtTime(780, now);
    overtone.frequency.exponentialRampToValueAtTime(510, now + 0.17);
    wobble.type = 'sine';
    wobble.frequency.setValueAtTime(8.2, now);

    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(0.046, now + 0.055);
    overtoneGain.gain.setValueAtTime(0.16, now);
    pitchWobble.gain.setValueAtTime(15, now);
    volumeWobble.gain.setValueAtTime(0.0001, now);
    volumeWobble.gain.exponentialRampToValueAtTime(0.011, now + 0.065);

    voice.connect(voiceGain);
    overtone.connect(overtoneGain).connect(voiceGain);
    wobble.connect(pitchWobble);
    wobble.connect(volumeWobble);
    pitchWobble.connect(voice.frequency);
    pitchWobble.connect(overtone.frequency);
    volumeWobble.connect(voiceGain.gain);
    voiceGain.connect(this.sfxBus ?? this.context.destination);
    voice.start(now);
    overtone.start(now);
    wobble.start(now);
    this.drawOscillators = [voice, overtone, wobble];
    this.drawGain = voiceGain;
    this.drawModulationGains = [pitchWobble, volumeWobble];
  }

  setDrawTension(pull01: number): void {
    const [voice, overtone, wobble] = this.drawOscillators;
    if (!this.context || !voice || !overtone || !wobble || !this.drawGain) return;
    const tension = Math.max(0, Math.min(1, pull01));
    const now = this.context.currentTime;
    const fundamental = 270 + tension * 360;
    voice.frequency.exponentialRampToValueAtTime(fundamental, now + 0.045);
    overtone.frequency.exponentialRampToValueAtTime(fundamental * 1.88, now + 0.045);
    wobble.frequency.exponentialRampToValueAtTime(7.4 + tension * 3.8, now + 0.045);
    this.drawGain.gain.exponentialRampToValueAtTime(0.032 + tension * 0.025, now + 0.045);
  }

  stopDraw(): void {
    if (!this.context || this.drawOscillators.length === 0 || !this.drawGain) return;
    const oscillators = this.drawOscillators;
    const gain = this.drawGain;
    const now = this.context.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    for (const modulation of this.drawModulationGains) {
      modulation.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    }
    for (const oscillator of oscillators) oscillator.stop(now + 0.075);
    this.drawOscillators = [];
    this.drawGain = null;
    this.drawModulationGains = [];
  }

  startMusic(track: MusicTrackKey = 'battle.main'): void {
    this.musicRequested = true;
    if (this.musicTrack !== track) {
      this.fileMusic?.stop();
      this.fallbackMusic?.stop();
      this.musicTrack = track;
      this.musicLoading = false;
      this.musicBus?.gain.setValueAtTime(
        musicTrack(track).volume,
        this.context?.currentTime ?? 0,
      );
    }
    this.startMusicIfReady();
  }

  setMusicMode(mode: BattleMusicMode): void {
    if (mode === this.musicMode) return;
    this.musicMode = mode;
    this.fallbackMusic?.setMode(mode);
  }

  setMusicPaused(paused: boolean): void {
    this.musicPaused = paused;
    if (paused) {
      this.fileMusic?.pause();
      this.fallbackMusic?.pause();
    } else {
      this.fileMusic?.resume();
      this.startMusicIfReady();
    }
  }

  stopMusic(): void {
    this.musicRequested = false;
    this.fileMusic?.stop();
    this.fallbackMusic?.stop();
    this.musicLoading = false;
  }

  close(): void {
    this.musicRequested = false;
    this.resetAudioGraph();
  }

  private resetAudioGraph(): void {
    this.stopDraw();
    this.fileMusic?.dispose();
    this.fallbackMusic?.stop();
    void this.context?.close();
    this.context = null;
    this.fileMusic = null;
    this.fallbackMusic = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.musicLoading = false;
  }

  private playHomeSelect(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.scheduleTone(330, 0.13, 'triangle', now, 0.052, 440);
    this.scheduleTone(495, 0.17, 'sine', now + 0.07, 0.042, 660);
    this.scheduleTone(990, 0.08, 'square', now + 0.16, 0.014, 1_320);
  }

  private playBossDefeat(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    // Low collapse followed by three rising notes timed against the 2.8 s
    // fragment animation. The sparse tail keeps the result title readable.
    this.scheduleTone(96, 1.15, 'sawtooth', now, 0.07, 38);
    this.scheduleTone(55, 1.7, 'sine', now + 0.08, 0.065, 31);
    this.scheduleTone(220, 0.32, 'triangle', now + 0.48, 0.048, 330);
    this.scheduleTone(330, 0.38, 'triangle', now + 0.92, 0.052, 495);
    this.scheduleTone(440, 0.85, 'triangle', now + 1.38, 0.056, 880);
    for (let fragment = 0; fragment < 7; fragment += 1) {
      const start = now + 0.12 + fragment * 0.19;
      this.scheduleTone(176 - fragment * 13, 0.09, 'square', start, 0.018, 72);
    }
    // A fast major-pentatonic climb turns the collapse into a clear reward,
    // capped by a bright four-note chord just before the results screen.
    const rewardNotes = [220, 277.18, 329.63, 440, 554.37, 659.25, 880, 1_108.73, 1_318.51];
    rewardNotes.forEach((frequency, index) => {
      this.scheduleTone(
        frequency,
        0.2 + index * 0.014,
        index < 5 ? 'triangle' : 'sine',
        now + 0.58 + index * 0.115,
        0.027 + index * 0.0018,
        frequency * 1.018,
      );
    });
    [440, 554.37, 659.25, 880].forEach((frequency, index) => {
      this.scheduleTone(frequency, 0.78, 'sine', now + 1.7, 0.028 - index * 0.003, frequency);
    });
    this.scheduleTone(1_760, 0.3, 'sine', now + 2.1, 0.022, 2_640);
  }

  private scheduleTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    start: number,
    peak: number,
    endFrequency: number,
  ): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.018, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.sfxBus ?? this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  private ensureBuses(): void {
    if (!this.context || this.sfxBus || this.musicBus) return;
    this.sfxBus = this.context.createGain();
    this.sfxBus.gain.setValueAtTime(0.9, this.context.currentTime);
    this.sfxBus.connect(this.context.destination);
    this.musicBus = this.context.createGain();
    // Keep music beneath short gameplay cues, especially graze and aim.
    this.musicBus.gain.setValueAtTime(musicTrack(this.musicTrack).volume, this.context.currentTime);
    this.musicBus.connect(this.context.destination);
    this.fileMusic = new MusicPlayer(this.context, this.musicBus);
    this.fallbackMusic = new BattleMusic(this.context, this.musicBus);
    this.fallbackMusic.setMode(this.musicMode);
  }

  private startMusicIfReady(): void {
    if (
      !this.enabled
      || !this.musicRequested
      || this.musicPaused
      || !this.context
      || this.context.state !== 'running'
    ) return;
    this.ensureBuses();
    if (this.fileMusic?.isPlaying || this.musicLoading) return;
    // Unit/headless contexts and older browsers without decoding use the
    // procedural score. Production browsers prefer the replaceable OGG file.
    if (typeof this.context.decodeAudioData !== 'function' || typeof fetch !== 'function') {
      this.fallbackMusic?.start();
      return;
    }
    this.musicLoading = true;
    void this.fileMusic?.play(this.musicTrack).then(() => {
      this.musicLoading = false;
      this.fallbackMusic?.stop();
      if (this.musicPaused || !this.musicRequested || !this.enabled) this.fileMusic?.pause();
    }).catch(() => {
      this.musicLoading = false;
      if (this.musicRequested && !this.musicPaused && this.enabled) this.fallbackMusic?.start();
    });
  }
}
