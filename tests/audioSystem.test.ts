import { afterEach, describe, expect, it, vi } from 'vitest';

import { AudioSystem } from '../src/game/systems/AudioSystem';

interface AudioProbe {
  contexts: number;
  resumes: number;
  starts: number;
}

function installAudioProbe(): AudioProbe {
  const probe: AudioProbe = { contexts: 0, resumes: 0, starts: 0 };
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
        stop: () => undefined,
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

afterEach(() => vi.unstubAllGlobals());

describe('AudioSystem', () => {
  it('does not create an AudioContext or play cues while sound is disabled', async () => {
    const probe = installAudioProbe();
    const audio = new AudioSystem();
    audio.setEnabled(false);

    await audio.unlock();
    audio.play('button');

    expect(probe).toEqual({ contexts: 0, resumes: 0, starts: 0 });
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
});
