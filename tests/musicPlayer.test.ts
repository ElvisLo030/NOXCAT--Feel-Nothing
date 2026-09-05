import { afterEach, describe, expect, it, vi } from 'vitest';

import { MusicPlayer, type MusicPlayback } from '../src/audio/MusicPlayer';
import { musicTrack } from '../src/audio/MusicRegistry';

afterEach(() => vi.unstubAllGlobals());

describe('MusicPlayer', () => {
  it('loads a registry track and resumes its loop from the paused offset', async () => {
    const starts: Array<[number, number]> = [];
    let stops = 0;
    let disconnects = 0;
    let createdSources = 0;
    const fakeBuffer = { duration: 16 } as AudioBuffer;
    const context = {
      state: 'running',
      currentTime: 0,
      decodeAudioData: vi.fn(async () => fakeBuffer),
      createBufferSource: () => {
        createdSources += 1;
        return {
          buffer: null,
          loop: false,
          connect: () => undefined,
          disconnect: () => { disconnects += 1; },
          start: (when: number, offset: number) => starts.push([when, offset]),
          stop: () => { stops += 1; },
        } as unknown as AudioBufferSourceNode;
      },
    } as unknown as AudioContext;
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requested.push(url);
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response;
    }));

    const playback: MusicPlayback = new MusicPlayer(context, {} as AudioNode);
    await playback.play('battle.main');
    expect(requested).toEqual([musicTrack('battle.main').src]);
    expect(starts).toEqual([[0, 0]]);

    (context as { currentTime: number }).currentTime = 4;
    playback.pause();
    playback.resume();
    expect(starts).toEqual([[0, 0], [0, 4]]);
    expect(createdSources).toBe(2);

    playback.stop();
    expect(stops).toBe(2);
    expect(disconnects).toBe(2);
  });
});
