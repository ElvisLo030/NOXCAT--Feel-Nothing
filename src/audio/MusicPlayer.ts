import { musicTrack, type MusicTrackKey } from './MusicRegistry';

export interface MusicPlayback {
  play(track: MusicTrackKey): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  dispose(): void;
}

/** File-backed Web Audio transport used behind the public MusicPlayback API. */
export class MusicPlayer implements MusicPlayback {
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private activeTrack: MusicTrackKey | null = null;
  private startedAt = 0;
  private offset = 0;
  private paused = false;
  private generation = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  get isPlaying(): boolean {
    return this.source !== null;
  }

  get isLoading(): boolean {
    return this.activeTrack !== null && this.buffer === null && this.source === null;
  }

  async play(track: MusicTrackKey): Promise<void> {
    if (this.activeTrack === track && (this.source || this.buffer)) {
      this.resume();
      return;
    }
    this.stopSource();
    const generation = ++this.generation;
    this.activeTrack = track;
    this.buffer = null;
    this.offset = 0;
    this.paused = false;
    const definition = musicTrack(track);
    const response = await fetch(definition.src);
    if (!response.ok) throw new Error(`Music request failed with ${response.status}`);
    const encoded = await response.arrayBuffer();
    const decoded = await this.context.decodeAudioData(encoded.slice(0));
    if (generation !== this.generation || this.activeTrack !== track) return;
    this.buffer = decoded;
    if (!this.paused) this.startSource();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.source && this.buffer) {
      this.offset = (this.context.currentTime - this.startedAt) % this.buffer.duration;
    }
    this.stopSource();
  }

  resume(): void {
    this.paused = false;
    if (!this.source && this.buffer) this.startSource();
  }

  stop(): void {
    this.generation += 1;
    this.stopSource();
    this.buffer = null;
    this.activeTrack = null;
    this.offset = 0;
    this.paused = false;
  }

  dispose(): void {
    this.stop();
  }

  private startSource(): void {
    if (!this.buffer || !this.activeTrack || this.context.state !== 'running') return;
    const definition = musicTrack(this.activeTrack);
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = definition.loop;
    source.loopStart = definition.loopStartSeconds;
    source.loopEnd = Math.min(definition.loopEndSeconds, this.buffer.duration);
    source.connect(this.output);
    this.startedAt = this.context.currentTime - this.offset;
    source.start(0, this.offset);
    this.source = source;
  }

  private stopSource(): void {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      // A source can already have ended while the page was backgrounded.
    }
    this.source.disconnect();
    this.source = null;
  }
}
