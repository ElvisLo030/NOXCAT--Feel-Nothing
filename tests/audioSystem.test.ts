import { afterEach, describe, expect, it, vi } from 'vitest';

import { AudioSystem } from '../src/game/systems/AudioSystem';

interface AudioProbe {
  contexts: number;
  resumes: number;
  starts: number;
  stops: number;
}

function installAudioProbe(): AudioProbe {
  const probe: AudioProbe = { contexts: 0, resumes: 0, starts: 0, stops: 0 };
  class FakeAudioContext {
    state: AudioContextState = 'suspended';
    currentTime = 0;
    destination = {} as AudioDestinationNode;

    constructor() {
      probe.contexts += 1;
    }

    async resume(): Promise<void> {
      probe.resumes += 1;
      this.state = 'running';
    }

    createOscillator(): OscillatorNode {
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: (target: AudioNode) => target,
        start: () => { probe.starts += 1; },
        stop: () => { probe.stops += 1; },
      } as unknown as OscillatorNode;
    }

    createGain(): GainNode {
      return {
        gain: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: (target: AudioNode) => target,
      } as unknown as GainNode;
    }

    async close(): Promise<void> {
      this.state = 'closed';
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  return probe;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AudioSystem', () => {
  it('does not create an AudioContext or play cues while sound is disabled', async () => {
    const probe = installAudioProbe();
    const audio = new AudioSystem();
    audio.setEnabled(false);

    await audio.unlock();
    audio.play('button');

    expect(probe).toEqual({ contexts: 0, resumes: 0, starts: 0, stops: 0 });
  });

  it('unlocks on demand, plays the button cue, and respects a later mute', async () => {
    const probe = installAudioProbe();
    const audio = new AudioSystem();

    await audio.unlock();
    audio.play('button');
    audio.setEnabled(false);
    audio.play('button');

    expect(probe.contexts).toBe(1);
    expect(probe.resumes).toBe(1);
    expect(probe.starts).toBe(1);
  });

  it('uses the procedural fallback when file decoding is unavailable and releases its scheduler', async () => {
    vi.useFakeTimers();
    const probe = installAudioProbe();
    const audio = new AudioSystem();

    audio.setMusicMode('dodge');
    audio.startMusic('battle.main');
    expect(probe.contexts).toBe(0);
    await audio.unlock();

    expect(probe.starts).toBeGreaterThanOrEqual(2);
    expect(vi.getTimerCount()).toBe(1);

    audio.setMusicMode('vulnerable');
    audio.setMusicPaused(true);
    expect(vi.getTimerCount()).toBe(0);

    audio.setMusicPaused(false);
    expect(vi.getTimerCount()).toBe(1);
    audio.stopMusic();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not create or schedule music while all sound is disabled', async () => {
    vi.useFakeTimers();
    const probe = installAudioProbe();
    const audio = new AudioSystem();
    audio.setEnabled(false);

    audio.setMusicMode('dodge');
    audio.startMusic('battle.main');
    await audio.unlock();

    expect(probe.contexts).toBe(0);
    expect(probe.starts).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('layers the home and boss-defeat signatures and cleans up a continuous draw', async () => {
    const probe = installAudioProbe();
    const audio = new AudioSystem();
    await audio.unlock();

    audio.play('homeSelect');
    expect(probe.starts).toBe(3);

    audio.startDraw();
    audio.setDrawTension(0.75);
    audio.stopDraw();
    expect(probe.starts).toBe(6);

    audio.play('bossDefeat');
    expect(probe.starts).toBe(32);
    expect(probe.stops).toBe(32);
  });

  it('rebuilds every audio bus after a suspended context fails to resume', async () => {
    let failNextResume = false;
    let contexts = 0;
    let gains = 0;
    const instances: Array<{ state: AudioContextState }> = [];
    class RecoveringAudioContext {
      state: AudioContextState = 'suspended';
      currentTime = 0;
      destination = {} as AudioDestinationNode;

      constructor() {
        contexts += 1;
        instances.push(this);
      }

      async resume(): Promise<void> {
        if (failNextResume) {
          failNextResume = false;
          throw new Error('simulated interruption');
        }
        this.state = 'running';
      }

      createGain(): GainNode {
        gains += 1;
        return {
          gain: { setValueAtTime: () => undefined },
          connect: (target: AudioNode) => target,
        } as unknown as GainNode;
      }

      async close(): Promise<void> {
        this.state = 'closed';
      }
    }
    vi.stubGlobal('AudioContext', RecoveringAudioContext);
    const audio = new AudioSystem();

    await audio.unlock();
    expect({ contexts, gains }).toEqual({ contexts: 1, gains: 2 });

    const first = instances[0];
    if (!first) throw new Error('missing first AudioContext');
    first.state = 'suspended';
    failNextResume = true;
    await audio.unlock();
    await audio.unlock();

    expect({ contexts, gains }).toEqual({ contexts: 2, gains: 4 });
  });

  it('stops an active draw immediately when sound is disabled', async () => {
    const probe = installAudioProbe();
    const audio = new AudioSystem();
    await audio.unlock();
    audio.startDraw();

    expect(probe.starts).toBe(3);
    audio.setEnabled(false);
    expect(probe.stops).toBe(3);

    audio.setDrawTension(1);
    audio.startDraw();
    expect(probe.starts).toBe(3);
  });
});
