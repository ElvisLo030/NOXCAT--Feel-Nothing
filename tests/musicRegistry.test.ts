import { stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { MUSIC_TRACKS, musicTrack } from '../src/audio/MusicRegistry';

describe('MusicRegistry', () => {
  it('maps the stable battle key to a local, replaceable OGG asset', async () => {
    const track = musicTrack('battle.main');
    expect(track).toBe(MUSIC_TRACKS['battle.main']);
    expect(track.src).toMatch(/^\/assets\/audio\/music\/.+\.ogg$/);
    expect(track.loop).toBe(true);
    expect(track.loopStartSeconds).toBe(0);
    expect(track.loopEndSeconds).toBeCloseTo(16.551_723, 5);
    expect(track.volume).toBeGreaterThan(0);
    expect(track.volume).toBeLessThanOrEqual(1);

    const file = path.join(process.cwd(), 'public', track.src.replace(/^\//, ''));
    const metadata = await stat(file);
    expect(metadata.size).toBeGreaterThan(10_000);
    expect(metadata.size).toBeLessThan(2_000_000);
  });
});
