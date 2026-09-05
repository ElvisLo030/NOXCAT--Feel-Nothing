export type MusicTrackKey = 'battle.main';

export interface MusicTrackDefinition {
  /** Public-root URL. Replace the file without changing any battle code. */
  readonly src: string;
  readonly loop: boolean;
  readonly loopStartSeconds: number;
  readonly loopEndSeconds: number;
  readonly volume: number;
  readonly title: string;
}

export const MUSIC_TRACKS: Readonly<Record<MusicTrackKey, MusicTrackDefinition>> = {
  'battle.main': {
    src: '/assets/audio/music/noxcat-battle-loop-v1.ogg',
    loop: true,
    loopStartSeconds: 0,
    loopEndSeconds: 16.551_723,
    volume: 0.72,
    title: 'NULL SIGNAL',
  },
};

export function musicTrack(key: MusicTrackKey): MusicTrackDefinition {
  return MUSIC_TRACKS[key];
}
