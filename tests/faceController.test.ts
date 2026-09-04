import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaPipe = vi.hoisted(() => {
  const detectForVideo = vi.fn();
  const close = vi.fn();
  const createFromOptions = vi.fn(async () => ({ detectForVideo, close }));
  const forVisionTasks = vi.fn(async () => ({ fileset: true }));

  return { close, createFromOptions, detectForVideo, forVisionTasks };
});

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: { createFromOptions: mediaPipe.createFromOptions },
  FilesetResolver: { forVisionTasks: mediaPipe.forVisionTasks },
}));

import {
  FaceController,
  type FaceScoreUpdate,
  type FaceStatusUpdate,
} from '../src/face/FaceController';
import type { FaceWorkerRequest, FaceWorkerResponse } from '../src/face/face.worker';
import type { FaceActivitySample } from '../src/face/neutralScore';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 320 },
    height: { ideal: 240 },
    frameRate: { ideal: 15, max: 24 },
  },
};

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
}

interface FakeVideo {
  autoplay: boolean;
  height: number;
  muted: boolean;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  playsInline: boolean;
  readyState: number;
  remove: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  srcObject: MediaProvider | null;
  width: number;
}

function createStream(trackCount = 1): {
  stream: MediaStream;
  tracks: FakeTrack[];
} {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }));
  const stream = {
    getTracks: vi.fn(() => tracks),
  } as unknown as MediaStream;
  return { stream, tracks };
}

function createVideo(play = vi.fn(async () => undefined)): FakeVideo {
  return {
    autoplay: false,
    height: 0,
    muted: false,
    pause: vi.fn(),
    play,
    playsInline: false,
    readyState: 2,
    remove: vi.fn(),
    setAttribute: vi.fn(),
    srcObject: null,
    width: 0,
  };
}

function installBrowser(
  getUserMedia: ReturnType<typeof vi.fn>,
  video: FakeVideo,
): void {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('location', { href: 'https://noxcat.test/' });
  vi.stubGlobal('document', {
    createElement: vi.fn(() => video),
  });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
}

function faceResult(sample: FaceActivitySample): object {
  return {
    faceBlendshapes: [
      {
        categories: [
          { categoryName: 'mouthSmileLeft', score: sample.smile },
          { categoryName: 'mouthSmileRight', score: sample.smile },
          { categoryName: 'jawOpen', score: sample.jawOpen },
          { categoryName: 'browInnerUp', score: sample.browUp },
          { categoryName: 'browOuterUpLeft', score: sample.browUp },
          { categoryName: 'browOuterUpRight', score: sample.browUp },
          { categoryName: 'eyeWideLeft', score: sample.eyeWide },
          { categoryName: 'eyeWideRight', score: sample.eyeWide },
        ],
      },
    ],
  };
}

class FakeWorker {
  public static instances: FakeWorker[] = [];

  public readonly posted: FaceWorkerRequest[] = [];
  public readonly terminate = vi.fn();
  private readonly messageListeners: Array<(event: MessageEvent<FaceWorkerResponse>) => void> = [];
  private readonly errorListeners: Array<(event: Event) => void> = [];

  public constructor() {
    FakeWorker.instances.push(this);
  }

  public addEventListener(
    type: 'message' | 'error',
    listener: EventListenerOrEventListenerObject,
  ): void {
    const callback = listener as EventListener;
    if (type === 'message') {
      this.messageListeners.push(
        callback as unknown as (event: MessageEvent<FaceWorkerResponse>) => void,
      );
    } else {
      this.errorListeners.push(callback);
    }
  }

  public postMessage(request: FaceWorkerRequest): void {
    this.posted.push(request);
    if (request.type === 'init') {
      this.emit({ type: 'ready' });
    } else if (request.type === 'close') {
      this.emit({ type: 'closed' });
    }
  }

  private emit(data: FaceWorkerResponse): void {
    const event = { data } as MessageEvent<FaceWorkerResponse>;
    this.messageListeners.forEach((listener) => listener(event));
  }
}

describe('FaceController camera lifecycle', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    mediaPipe.close.mockReset();
    mediaPipe.detectForVideo.mockReset();
    mediaPipe.createFromOptions.mockClear();
    mediaPipe.forVisionTasks.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('never requests the camera without explicit consent', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const statuses: FaceStatusUpdate[] = [];
    const controller = new FaceController({ onStatus: (update) => statuses.push(update) });

    await expect(controller.start(false)).resolves.toEqual({
      ok: false,
      mode: null,
      reason: 'consent-not-granted',
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({
      status: 'skipped',
      mode: null,
      reason: 'consent-not-granted',
    });
  });

  it('requests only the specified low-resolution front-camera stream', async () => {
    const { stream, tracks } = createStream();
    const video = createVideo(vi.fn(async () => {
      throw new Error('Synthetic video failure');
    }));
    const getUserMedia = vi.fn(async () => stream);
    installBrowser(getUserMedia, video);
    const controller = new FaceController({
      videoElement: video as unknown as HTMLVideoElement,
    });

    await expect(controller.start(true)).resolves.toEqual({
      ok: false,
      mode: null,
      reason: 'video-failed',
    });

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS);
    expect(tracks[0]?.stop).toHaveBeenCalledOnce();
  });

  it('returns the standard permission-denied fallback without leaking an error', async () => {
    const denial = new DOMException('Synthetic denial', 'NotAllowedError');
    const getUserMedia = vi.fn(async () => {
      throw denial;
    });
    const video = createVideo();
    const statuses: FaceStatusUpdate[] = [];
    installBrowser(getUserMedia, video);
    const controller = new FaceController({
      onStatus: (update) => statuses.push(update),
      videoElement: video as unknown as HTMLVideoElement,
    });

    await expect(controller.start(true)).resolves.toEqual({
      ok: false,
      mode: null,
      reason: 'permission-denied',
    });
    expect(statuses.at(-1)).toEqual({
      status: 'unavailable',
      mode: null,
      reason: 'permission-denied',
    });
  });

  it('stops every track, capture timer, worker, and hidden video resource', async () => {
    vi.useFakeTimers();
    const { stream, tracks } = createStream(2);
    const video = createVideo();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    installBrowser(vi.fn(async () => stream), video);
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    const controller = new FaceController({
      videoElement: video as unknown as HTMLVideoElement,
      workerInitTimeoutMs: 1_000,
    });

    await expect(controller.start(true)).resolves.toEqual({ ok: true, mode: 'worker' });
    await vi.advanceTimersByTimeAsync(0);
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    expect(worker?.posted[0]).toEqual({
      type: 'init',
      wasmBaseUrl: 'https://noxcat.test/vendor/mediapipe/wasm',
      modelAssetUrl: 'https://noxcat.test/models/face_landmarker.task',
    });
    expect(worker?.posted.some((request) => request.type === 'frame')).toBe(true);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await controller.stop();

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(worker?.posted.at(-1)).toEqual({ type: 'close' });
    expect(worker?.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the main-thread landmarker and its timer on stop', async () => {
    vi.useFakeTimers();
    const { stream, tracks } = createStream();
    const video = createVideo();
    installBrowser(vi.fn(async () => stream), video);
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('createImageBitmap', undefined);
    mediaPipe.detectForVideo.mockReturnValue({ faceBlendshapes: [] });
    const controller = new FaceController({
      videoElement: video as unknown as HTMLVideoElement,
    });

    await expect(controller.start(true)).resolves.toEqual({
      ok: true,
      mode: 'main-thread',
    });
    expect(mediaPipe.createFromOptions).toHaveBeenCalledOnce();
    expect(mediaPipe.forVisionTasks).toHaveBeenCalledWith(
      'https://noxcat.test/vendor/mediapipe/wasm',
    );
    expect(mediaPipe.createFromOptions).toHaveBeenCalledWith(
      { fileset: true },
      {
        baseOptions: {
          modelAssetPath: 'https://noxcat.test/models/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      },
    );
    expect(vi.getTimerCount()).toBe(1);

    await controller.stop();

    expect(tracks[0]?.stop).toHaveBeenCalledOnce();
    expect(mediaPipe.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates bonus eligibility when a worker frame becomes stale', async () => {
    vi.useFakeTimers();
    const { stream } = createStream();
    const video = createVideo();
    const scores: FaceScoreUpdate[] = [];
    installBrowser(vi.fn(async () => stream), video);
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ close: vi.fn() }) as unknown as ImageBitmap),
    );
    mediaPipe.detectForVideo.mockReturnValue({ faceBlendshapes: [] });
    const controller = new FaceController({
      onScore: (update) => scores.push(update),
      videoElement: video as unknown as HTMLVideoElement,
      workerInitTimeoutMs: 1_000,
    });

    await controller.start(true);
    await vi.advanceTimersByTimeAsync(1_001);
    await vi.waitFor(() => expect(controller.currentMode).toBe('main-thread'));

    expect(scores).toContainEqual(expect.objectContaining({
      rawNeutral: null,
      neutral: null,
      faceFound: false,
      bonusEligible: false,
      activityDetected: false,
      mode: 'worker',
    }));
    await controller.stop();
  });

  it('revokes a previously eligible score after repeated runtime inference failures', async () => {
    vi.useFakeTimers();
    const { stream, tracks } = createStream();
    const video = createVideo();
    const scores: FaceScoreUpdate[] = [];
    const statuses: FaceStatusUpdate[] = [];
    const neutralSample: FaceActivitySample = {
      smile: 0.1,
      jawOpen: 0.08,
      browUp: 0.1,
      eyeWide: 0.1,
    };
    installBrowser(vi.fn(async () => stream), video);
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('createImageBitmap', undefined);
    mediaPipe.detectForVideo.mockReturnValue(faceResult(neutralSample));
    const controller = new FaceController({
      onScore: (update) => scores.push(update),
      onStatus: (update) => statuses.push(update),
      videoElement: video as unknown as HTMLVideoElement,
    });

    await controller.start(true);
    const calibration = controller.calibrate(500, 1);
    await vi.advanceTimersByTimeAsync(600);
    await expect(calibration).resolves.toMatchObject({ ok: true });
    expect(scores.some((score) => score.bonusEligible && score.neutral === 100)).toBe(true);

    mediaPipe.detectForVideo.mockImplementation(() => {
      throw new Error('Synthetic runtime failure');
    });
    await vi.advanceTimersByTimeAsync(600);

    expect(scores.at(-1)).toMatchObject({
      rawNeutral: null,
      neutral: null,
      faceFound: false,
      bonusEligible: false,
      activityDetected: false,
      mode: 'main-thread',
    });
    expect(statuses.at(-1)).toEqual({
      status: 'unavailable',
      mode: null,
      reason: 'inference-failed',
    });
    expect(tracks[0]?.stop).toHaveBeenCalledOnce();
    expect(mediaPipe.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
