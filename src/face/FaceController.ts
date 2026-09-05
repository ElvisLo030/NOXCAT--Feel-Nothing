import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

import {
  calculateNeutralBaseline,
  calculateNeutralScore,
  smoothNeutralScore,
  type FaceActivitySample,
} from './neutralScore';
import type {
  FaceWorkerFrameRequest,
  FaceWorkerRequest,
  FaceWorkerResponse,
} from './face.worker';

const DEFAULT_CALIBRATION_MS = 2_000;
const DEFAULT_MINIMUM_CALIBRATION_SAMPLES = 10;
const DEFAULT_WORKER_INFERENCE_HZ = 10;
const DEFAULT_MAIN_THREAD_INFERENCE_HZ = 5;
const WORKER_INIT_TIMEOUT_MS = 12_000;
const WORKER_CLOSE_GRACE_MS = 350;
const WORKER_FRAME_TIMEOUT_MS = 1_000;
const MAIN_THREAD_INIT_TIMEOUT_MS = 12_000;
const LOW_NEUTRAL_THRESHOLD = 70;
const LOW_NEUTRAL_HOLD_MS = 250;
const ACTIVITY_SUPPRESSION_MS = 600;
const BONUS_NEUTRAL_THRESHOLD = 88;

export type FaceTrackingMode = 'worker' | 'main-thread';

export type FaceControllerStatus =
  | 'idle'
  | 'requesting-camera'
  | 'initializing'
  | 'ready'
  | 'calibrating'
  | 'tracking'
  | 'face-lost'
  | 'calibration-failed'
  | 'skipped'
  | 'unavailable'
  | 'stopped';

export type FaceStatusReason =
  | 'consent-not-granted'
  | 'unsupported'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-busy'
  | 'camera-failed'
  | 'video-failed'
  | 'worker-fallback'
  | 'initialization-failed'
  | 'inference-failed'
  | 'no-face'
  | 'insufficient-samples'
  | 'stopped'
  | 'superseded';

export interface FaceStatusUpdate {
  status: FaceControllerStatus;
  mode: FaceTrackingMode | null;
  reason?: FaceStatusReason;
}

export interface FaceScoreUpdate {
  /** `null` means that no face is currently visible. */
  rawNeutral: number | null;
  /** EMA-smoothed score. `null` means that no face is currently visible. */
  neutral: number | null;
  sample: FaceActivitySample | null;
  baseline: FaceActivitySample | null;
  faceFound: boolean;
  inferenceMs: number;
  timestampMs: number;
  mode: FaceTrackingMode;
  /** True while Neutral may grant the optional energy bonus. */
  bonusEligible: boolean;
  /** A one-update pulse after Neutral stays below 70 for at least 250 ms. */
  activityDetected: boolean;
}

export interface FaceScoreStats {
  validSamples: number;
  averageNeutral: number | null;
  highestNeutral: number | null;
}

export interface FaceCalibrationResult {
  ok: boolean;
  baseline: FaceActivitySample | null;
  validSamples: number;
  reason?: 'not-running' | 'insufficient-samples' | 'stopped' | 'superseded';
}

export interface FaceControllerStartResult {
  ok: boolean;
  mode: FaceTrackingMode | null;
  reason?: FaceStatusReason;
}

export interface FaceControllerOptions {
  onStatus?: (update: FaceStatusUpdate) => void;
  onScore?: (update: FaceScoreUpdate) => void;
  onCalibrationProgress?: (progress01: number, validSamples: number) => void;
  /**
   * Pass a video only for an explicit debug preview. Otherwise an off-DOM,
   * muted video is used and never shown to the player.
   */
  videoElement?: HTMLVideoElement;
  wasmBaseUrl?: string;
  modelAssetUrl?: string;
  workerInferenceHz?: number;
  mainThreadInferenceHz?: number;
  workerInitTimeoutMs?: number;
}

interface ActiveCalibration {
  startedAt: number;
  durationMs: number;
  minimumSamples: number;
  samples: FaceActivitySample[];
  timeoutId: number;
  resolve: (result: FaceCalibrationResult) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const relativeUrl = `${base}${path}`;
  return typeof window === 'undefined'
    ? relativeUrl
    : new URL(relativeUrl, window.location.href).toString();
}

function cameraFailureReason(error: unknown): FaceStatusReason {
  if (!(error instanceof DOMException)) {
    return 'camera-failed';
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'no-camera';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'camera-busy';
    default:
      return 'camera-failed';
  }
}

function blendshapeScore(
  categories: readonly { categoryName: string; score: number }[],
  name: string,
): number {
  const value = categories.find((category) => category.categoryName === name)?.score ?? 0;
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function extractActivitySample(result: FaceLandmarkerResult): FaceActivitySample | null {
  const categories = result.faceBlendshapes[0]?.categories;
  if (categories == null || categories.length === 0) {
    return null;
  }

  const average = (left: number, right: number): number => (left + right) / 2;
  const outerBrow = average(
    blendshapeScore(categories, 'browOuterUpLeft'),
    blendshapeScore(categories, 'browOuterUpRight'),
  );

  return {
    smile: average(
      blendshapeScore(categories, 'mouthSmileLeft'),
      blendshapeScore(categories, 'mouthSmileRight'),
    ),
    jawOpen: blendshapeScore(categories, 'jawOpen'),
    browUp: Math.max(blendshapeScore(categories, 'browInnerUp'), outerBrow),
    eyeWide: average(
      blendshapeScore(categories, 'eyeWideLeft'),
      blendshapeScore(categories, 'eyeWideRight'),
    ),
  };
}

/**
 * Owns the camera and local Face Landmarker lifecycle. Frames only travel to a
 * same-page module worker and are immediately closed after synchronous local
 * inference; no image, landmark, or bitmap is uploaded or persisted.
 */
export class FaceController {
  private readonly onStatus?: FaceControllerOptions['onStatus'];
  private readonly onScore?: FaceControllerOptions['onScore'];
  private readonly onCalibrationProgress?: FaceControllerOptions['onCalibrationProgress'];
  private readonly suppliedVideoElement?: HTMLVideoElement;
  private readonly wasmBaseUrl: string;
  private readonly modelAssetUrl: string;
  private readonly workerInferenceHz: number;
  private readonly mainThreadInferenceHz: number;
  private readonly workerInitTimeoutMs: number;

  private status: FaceControllerStatus = 'idle';
  private mode: FaceTrackingMode | null = null;
  private stream: MediaStream | null = null;
  private readonly trackEndListeners: Array<{
    track: MediaStreamTrack;
    listener: EventListener;
  }> = [];
  private video: HTMLVideoElement | null = null;
  private ownsVideo = false;
  private worker: Worker | null = null;
  private workerReady = false;
  private workerFrameInFlight = false;
  private workerFrameTimeoutId: number | null = null;
  private workerInitResolver: ((ready: boolean) => void) | null = null;
  private workerCloseResolver: (() => void) | null = null;
  private mainThreadLandmarker: FaceLandmarker | null = null;
  private captureIntervalId: number | null = null;
  private captureBusy = false;
  private pendingBitmap: ImageBitmap | null = null;
  private frameId = 0;
  private lifecycle = 0;
  private switchingFallback = false;
  private consecutiveInferenceErrors = 0;

  private calibration: ActiveCalibration | null = null;
  private baseline: FaceActivitySample | null = null;
  private smoothedNeutral: number | null = null;
  private lowNeutralStartedAt: number | null = null;
  private bonusSuppressedUntil = 0;
  private validScoreSamples = 0;
  private neutralTotal = 0;
  private highestNeutral: number | null = null;

  public constructor(options: FaceControllerOptions = {}) {
    this.onStatus = options.onStatus;
    this.onScore = options.onScore;
    this.onCalibrationProgress = options.onCalibrationProgress;
    this.suppliedVideoElement = options.videoElement;
    this.wasmBaseUrl = options.wasmBaseUrl ?? publicAssetUrl('vendor/mediapipe/wasm');
    this.modelAssetUrl = options.modelAssetUrl ?? publicAssetUrl('models/face_landmarker.task');
    this.workerInferenceHz = clamp(
      options.workerInferenceHz ?? DEFAULT_WORKER_INFERENCE_HZ,
      8,
      10,
    );
    this.mainThreadInferenceHz = clamp(
      options.mainThreadInferenceHz ?? DEFAULT_MAIN_THREAD_INFERENCE_HZ,
      5,
      6,
    );
    this.workerInitTimeoutMs = Math.max(
      1_000,
      options.workerInitTimeoutMs ?? WORKER_INIT_TIMEOUT_MS,
    );
  }

  public get currentStatus(): FaceControllerStatus {
    return this.status;
  }

  public get currentMode(): FaceTrackingMode | null {
    return this.mode;
  }

  public get calibratedBaseline(): FaceActivitySample | null {
    return this.baseline == null ? null : { ...this.baseline };
  }

  /** The video stays off-DOM unless a caller explicitly displays it in debug mode. */
  public get debugVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  public getStats(): FaceScoreStats {
    return {
      validSamples: this.validScoreSamples,
      averageNeutral:
        this.validScoreSamples === 0 ? null : this.neutralTotal / this.validScoreSamples,
      highestNeutral: this.highestNeutral,
    };
  }

  /**
   * Must be called from the consent UI. Passing false guarantees that
   * getUserMedia is never invoked.
   */
  public async start(consentGranted: boolean): Promise<FaceControllerStartResult> {
    await this.releaseResources();
    this.resetScores();

    if (!consentGranted) {
      this.emitStatus('skipped', 'consent-not-granted');
      return { ok: false, mode: null, reason: 'consent-not-granted' };
    }

    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      navigator.mediaDevices?.getUserMedia == null
    ) {
      this.emitStatus('unavailable', 'unsupported');
      return { ok: false, mode: null, reason: 'unsupported' };
    }

    const activeLifecycle = this.lifecycle;
    this.emitStatus('requesting-camera');

    let requestedStream: MediaStream;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 24 },
        },
      });
    } catch (error) {
      // A previous start must never overwrite the status or release resources
      // belonging to a newer lifecycle after its permission prompt settles.
      if (activeLifecycle !== this.lifecycle) {
        return { ok: false, mode: null, reason: 'stopped' };
      }
      const reason = cameraFailureReason(error);
      this.emitStatus('unavailable', reason);
      return { ok: false, mode: null, reason };
    }

    if (activeLifecycle !== this.lifecycle) {
      requestedStream.getTracks().forEach((track) => track.stop());
      return { ok: false, mode: null, reason: 'stopped' };
    }

    this.stream = requestedStream;
    this.watchStreamEnd(requestedStream, activeLifecycle);
    try {
      await this.prepareVideo(requestedStream, activeLifecycle);
    } catch {
      if (activeLifecycle !== this.lifecycle) {
        return { ok: false, mode: null, reason: 'stopped' };
      }
      await this.releaseResources();
      this.emitStatus('unavailable', 'video-failed');
      return { ok: false, mode: null, reason: 'video-failed' };
    }

    if (activeLifecycle !== this.lifecycle) {
      return { ok: false, mode: null, reason: 'stopped' };
    }

    this.emitStatus('initializing');
    const workerReady = await this.initializeWorker();
    if (activeLifecycle !== this.lifecycle) {
      return { ok: false, mode: null, reason: 'stopped' };
    }
    if (workerReady) {
      this.mode = 'worker';
    } else {
      try {
        await this.initializeMainThreadLandmarker(activeLifecycle);
        this.mode = 'main-thread';
      } catch {
        if (activeLifecycle !== this.lifecycle) {
          return { ok: false, mode: null, reason: 'stopped' };
        }
        await this.releaseResources();
        this.emitStatus('unavailable', 'initialization-failed');
        return { ok: false, mode: null, reason: 'initialization-failed' };
      }
    }

    if (activeLifecycle !== this.lifecycle || this.stream == null) {
      return { ok: false, mode: null, reason: 'stopped' };
    }

    this.startCaptureLoop();
    this.emitStatus('ready');
    return { ok: true, mode: this.mode };
  }

  public calibrate(
    durationMs = DEFAULT_CALIBRATION_MS,
    minimumSamples = DEFAULT_MINIMUM_CALIBRATION_SAMPLES,
  ): Promise<FaceCalibrationResult> {
    if (this.stream == null || this.mode == null || this.captureIntervalId == null) {
      return Promise.resolve({
        ok: false,
        baseline: null,
        validSamples: 0,
        reason: 'not-running',
      });
    }

    this.cancelCalibration('superseded');
    this.baseline = null;
    this.resetScores();

    const safeDurationMs = Math.max(500, durationMs);
    const safeMinimumSamples = Math.max(1, Math.floor(minimumSamples));
    this.emitStatus('calibrating');
    this.emitCalibrationProgress(0, 0);

    return new Promise<FaceCalibrationResult>((resolve) => {
      const timeoutId = window.setTimeout(() => this.finishCalibration(), safeDurationMs);
      this.calibration = {
        startedAt: performance.now(),
        durationMs: safeDurationMs,
        minimumSamples: safeMinimumSamples,
        samples: [],
        timeoutId,
        resolve,
      };
    });
  }

  public async skip(): Promise<void> {
    await this.releaseResources();
    this.resetScores();
    this.emitStatus('skipped', 'consent-not-granted');
  }

  public async stop(): Promise<void> {
    await this.releaseResources();
    this.resetScores();
    this.emitStatus('stopped', 'stopped');
  }

  private emitStatus(status: FaceControllerStatus, reason?: FaceStatusReason): void {
    this.status = status;
    try {
      this.onStatus?.({ status, mode: this.mode, ...(reason == null ? {} : { reason }) });
    } catch {
      // A UI callback must never break camera cleanup or inference.
    }
  }

  private emitScore(update: FaceScoreUpdate): void {
    try {
      this.onScore?.(update);
    } catch {
      // A UI callback must never break camera cleanup or inference.
    }
  }

  private emitCalibrationProgress(progress01: number, validSamples: number): void {
    try {
      this.onCalibrationProgress?.(clamp(progress01, 0, 1), validSamples);
    } catch {
      // A UI callback must never break camera cleanup or inference.
    }
  }

  private async prepareVideo(stream: MediaStream, activeLifecycle: number): Promise<void> {
    const video = this.suppliedVideoElement ?? document.createElement('video');
    this.ownsVideo = this.suppliedVideoElement == null;
    this.video = video;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.width = 320;
    video.height = 240;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.srcObject = stream;

    if (video.readyState < 1) {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          cleanup();
          reject(new Error('Camera video metadata timed out'));
        }, 5_000);
        const onReady = (): void => {
          cleanup();
          resolve();
        };
        const onError = (): void => {
          cleanup();
          reject(new Error('Camera video failed'));
        };
        const cleanup = (): void => {
          window.clearTimeout(timeoutId);
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('error', onError);
        };

        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
      });
    }

    if (activeLifecycle !== this.lifecycle) {
      throw new Error('Camera start was cancelled');
    }
    await video.play();
  }

  private async initializeWorker(): Promise<boolean> {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      return false;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./face.worker.ts', import.meta.url), {
        type: 'module',
        name: 'noxcat-face-landmarker',
      });
    } catch {
      return false;
    }

    this.worker = worker;
    worker.addEventListener('message', (event: MessageEvent<FaceWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    });
    worker.addEventListener('error', () => {
      if (this.workerInitResolver != null) {
        this.workerInitResolver(false);
      } else if (this.mode === 'worker') {
        void this.switchToMainThreadFallback();
      }
    });

    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => finish(false), this.workerInitTimeoutMs);
      const finish = (success: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        this.workerInitResolver = null;
        resolve(success);
      };
      this.workerInitResolver = finish;

      const request: FaceWorkerRequest = {
        type: 'init',
        wasmBaseUrl: this.wasmBaseUrl,
        modelAssetUrl: this.modelAssetUrl,
      };
      worker.postMessage(request);
    });

    if (!ready) {
      worker.terminate();
      if (this.worker === worker) {
        this.worker = null;
      }
      this.workerReady = false;
      return false;
    }

    this.workerReady = true;
    return true;
  }

  private async initializeMainThreadLandmarker(activeLifecycle = this.lifecycle): Promise<void> {
    let cancelled = false;
    const operation = (async (): Promise<void> => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(this.wasmBaseUrl);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: this.modelAssetUrl,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (cancelled || activeLifecycle !== this.lifecycle || this.stream == null) {
        landmarker.close();
        throw new Error('Face Landmarker initialization was cancelled');
      }
      this.mainThreadLandmarker?.close();
      this.mainThreadLandmarker = landmarker;
    })();

    let timeoutId = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('Face Landmarker initialization timed out')),
        MAIN_THREAD_INIT_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([operation, timeout]);
    } catch (error) {
      cancelled = true;
      void operation.catch(() => undefined);
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private startCaptureLoop(): void {
    this.stopCaptureLoop();
    const hz = this.mode === 'worker' ? this.workerInferenceHz : this.mainThreadInferenceHz;
    this.captureIntervalId = window.setInterval(() => {
      void this.captureOnce();
    }, 1_000 / hz);
    void this.captureOnce();
  }

  private stopCaptureLoop(): void {
    if (this.captureIntervalId != null) {
      window.clearInterval(this.captureIntervalId);
      this.captureIntervalId = null;
    }
  }

  private async captureOnce(): Promise<void> {
    const video = this.video;
    if (
      video == null ||
      video.readyState < 2 ||
      this.captureBusy ||
      this.workerFrameInFlight
    ) {
      return;
    }

    this.captureBusy = true;
    const activeLifecycle = this.lifecycle;
    try {
      if (this.mode === 'worker') {
        await this.captureWorkerFrame(video, activeLifecycle);
      } else if (this.mode === 'main-thread') {
        this.captureMainThreadFrame(video);
      }
    } finally {
      this.captureBusy = false;
    }
  }

  private async captureWorkerFrame(
    video: HTMLVideoElement,
    activeLifecycle: number,
  ): Promise<void> {
    const worker = this.worker;
    if (worker == null || !this.workerReady) {
      return;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(video);
    } catch {
      void this.switchToMainThreadFallback();
      return;
    }

    if (activeLifecycle !== this.lifecycle || this.worker !== worker) {
      bitmap.close();
      return;
    }

    this.pendingBitmap = bitmap;
    const request: FaceWorkerFrameRequest = {
      type: 'frame',
      frameId: ++this.frameId,
      bitmap,
      timestampMs: performance.now(),
    };

    try {
      this.workerFrameInFlight = true;
      worker.postMessage(request, [bitmap]);
      this.pendingBitmap = null;
      this.clearWorkerFrameTimeout();
      const postedFrameId = request.frameId;
      this.workerFrameTimeoutId = window.setTimeout(() => {
        this.workerFrameTimeoutId = null;
        if (
          this.mode === 'worker' &&
          this.workerFrameInFlight &&
          this.frameId === postedFrameId
        ) {
          this.workerFrameInFlight = false;
          this.invalidateScore('worker');
          void this.switchToMainThreadFallback();
        }
      }, WORKER_FRAME_TIMEOUT_MS);
    } catch {
      this.clearWorkerFrameTimeout();
      this.workerFrameInFlight = false;
      this.pendingBitmap = null;
      bitmap.close();
      void this.switchToMainThreadFallback();
    }
  }

  private captureMainThreadFrame(video: HTMLVideoElement): void {
    const landmarker = this.mainThreadLandmarker;
    if (landmarker == null) {
      return;
    }

    const timestampMs = performance.now();
    const startedAt = performance.now();
    try {
      const result = landmarker.detectForVideo(video, timestampMs);
      this.consecutiveInferenceErrors = 0;
      this.consumeInference(
        extractActivitySample(result),
        timestampMs,
        performance.now() - startedAt,
      );
    } catch {
      this.consecutiveInferenceErrors += 1;
      if (this.consecutiveInferenceErrors >= 3) {
        void this.failRuntime('inference-failed');
      }
    }
  }

  private handleWorkerMessage(response: FaceWorkerResponse): void {
    switch (response.type) {
      case 'ready':
        this.workerInitResolver?.(true);
        break;
      case 'result':
        this.clearWorkerFrameTimeout();
        this.workerFrameInFlight = false;
        this.consecutiveInferenceErrors = 0;
        this.consumeInference(response.sample, response.timestampMs, response.inferenceMs);
        break;
      case 'error':
        if (response.fatal) {
          if (this.workerInitResolver != null) {
            this.workerInitResolver(false);
          } else {
            void this.switchToMainThreadFallback();
          }
          break;
        }

        this.clearWorkerFrameTimeout();
        this.workerFrameInFlight = false;
        this.consecutiveInferenceErrors += 1;
        if (this.consecutiveInferenceErrors >= 3) {
          void this.switchToMainThreadFallback();
        }
        break;
      case 'closed':
        this.workerCloseResolver?.();
        break;
    }
  }

  private consumeInference(
    sample: FaceActivitySample | null,
    timestampMs: number,
    inferenceMs: number,
  ): void {
    const mode = this.mode;
    if (mode == null || this.stream == null) {
      return;
    }

    const calibration = this.calibration;
    if (calibration != null) {
      if (sample != null) {
        calibration.samples.push(sample);
      }
      const elapsedMs = performance.now() - calibration.startedAt;
      this.emitCalibrationProgress(
        elapsedMs / calibration.durationMs,
        calibration.samples.length,
      );
      return;
    }

    if (sample == null || this.baseline == null) {
      this.lowNeutralStartedAt = null;
      if (this.baseline != null) {
        this.emitStatus('face-lost', 'no-face');
      }
      this.emitScore({
        rawNeutral: null,
        neutral: null,
        sample,
        baseline: this.baseline,
        faceFound: sample != null,
        inferenceMs,
        timestampMs,
        mode,
        bonusEligible: false,
        activityDetected: false,
      });
      return;
    }

    const rawNeutral = calculateNeutralScore(sample, this.baseline);
    if (rawNeutral == null) {
      return;
    }
    this.smoothedNeutral =
      this.smoothedNeutral == null
        ? rawNeutral
        : smoothNeutralScore(this.smoothedNeutral, rawNeutral);

    let activityDetected = false;
    if (this.smoothedNeutral < LOW_NEUTRAL_THRESHOLD) {
      if (this.lowNeutralStartedAt == null) {
        this.lowNeutralStartedAt = timestampMs;
      } else if (
        timestampMs - this.lowNeutralStartedAt >= LOW_NEUTRAL_HOLD_MS &&
        timestampMs >= this.bonusSuppressedUntil
      ) {
        this.bonusSuppressedUntil = timestampMs + ACTIVITY_SUPPRESSION_MS;
        this.lowNeutralStartedAt = null;
        activityDetected = true;
      }
    } else {
      this.lowNeutralStartedAt = null;
    }

    const bonusEligible =
      this.smoothedNeutral >= BONUS_NEUTRAL_THRESHOLD &&
      timestampMs >= this.bonusSuppressedUntil;

    this.validScoreSamples += 1;
    this.neutralTotal += this.smoothedNeutral;
    this.highestNeutral = Math.max(this.highestNeutral ?? 0, this.smoothedNeutral);
    this.emitStatus('tracking');
    this.emitScore({
      rawNeutral,
      neutral: this.smoothedNeutral,
      sample,
      baseline: this.baseline,
      faceFound: true,
      inferenceMs,
      timestampMs,
      mode,
      bonusEligible,
      activityDetected,
    });
  }

  private finishCalibration(): void {
    const calibration = this.calibration;
    if (calibration == null) {
      return;
    }
    this.calibration = null;
    window.clearTimeout(calibration.timeoutId);
    this.emitCalibrationProgress(1, calibration.samples.length);

    if (calibration.samples.length < calibration.minimumSamples) {
      this.baseline = null;
      this.emitStatus('calibration-failed', 'insufficient-samples');
      calibration.resolve({
        ok: false,
        baseline: null,
        validSamples: calibration.samples.length,
        reason: 'insufficient-samples',
      });
      void this.releaseResources();
      return;
    }

    this.baseline = calculateNeutralBaseline(calibration.samples);
    if (this.baseline == null) {
      this.emitStatus('calibration-failed', 'insufficient-samples');
      calibration.resolve({
        ok: false,
        baseline: null,
        validSamples: calibration.samples.length,
        reason: 'insufficient-samples',
      });
      void this.releaseResources();
      return;
    }

    this.emitStatus('tracking');
    calibration.resolve({
      ok: true,
      baseline: { ...this.baseline },
      validSamples: calibration.samples.length,
    });
  }

  private cancelCalibration(reason: 'stopped' | 'superseded'): void {
    const calibration = this.calibration;
    if (calibration == null) {
      return;
    }
    this.calibration = null;
    window.clearTimeout(calibration.timeoutId);
    calibration.resolve({
      ok: false,
      baseline: null,
      validSamples: calibration.samples.length,
      reason,
    });
  }

  private async switchToMainThreadFallback(): Promise<void> {
    if (this.switchingFallback || this.mode !== 'worker') {
      return;
    }
    this.switchingFallback = true;
    this.invalidateScore('worker');
    this.stopCaptureLoop();
    await this.shutdownWorker();

    try {
      if (this.stream == null || this.video == null) {
        return;
      }
      const activeLifecycle = this.lifecycle;
      await this.initializeMainThreadLandmarker(activeLifecycle);
      if (activeLifecycle !== this.lifecycle || this.stream == null) return;
      this.mode = 'main-thread';
      this.consecutiveInferenceErrors = 0;
      this.startCaptureLoop();
      this.emitStatus(this.baseline == null ? 'ready' : 'tracking', 'worker-fallback');
    } catch {
      await this.failRuntime('initialization-failed');
    } finally {
      this.switchingFallback = false;
    }
  }

  private async failRuntime(reason: FaceStatusReason): Promise<void> {
    this.invalidateScore(this.mode);
    await this.releaseResources();
    this.emitStatus('unavailable', reason);
  }

  private invalidateScore(mode: FaceTrackingMode | null): void {
    if (mode == null) return;
    this.lowNeutralStartedAt = null;
    this.emitScore({
      rawNeutral: null,
      neutral: null,
      sample: null,
      baseline: this.baseline,
      faceFound: false,
      inferenceMs: 0,
      timestampMs: performance.now(),
      mode,
      bonusEligible: false,
      activityDetected: false,
    });
  }

  private clearWorkerFrameTimeout(): void {
    if (this.workerFrameTimeoutId == null) return;
    window.clearTimeout(this.workerFrameTimeoutId);
    this.workerFrameTimeoutId = null;
  }

  private resetScores(): void {
    this.baseline = null;
    this.smoothedNeutral = null;
    this.lowNeutralStartedAt = null;
    this.bonusSuppressedUntil = 0;
    this.validScoreSamples = 0;
    this.neutralTotal = 0;
    this.highestNeutral = null;
  }

  private watchStreamEnd(stream: MediaStream, activeLifecycle: number): void {
    this.clearTrackEndListeners();
    for (const track of stream.getTracks()) {
      // MediaStreamTrack is an EventTarget in browsers. The feature check
      // keeps synthetic/test streams and older embedded webviews harmless.
      if (typeof track.addEventListener !== 'function') continue;
      const listener: EventListener = () => {
        if (activeLifecycle !== this.lifecycle || this.stream !== stream) return;
        void this.failRuntime('camera-failed');
      };
      track.addEventListener('ended', listener, { once: true });
      this.trackEndListeners.push({ track, listener });
    }
  }

  private clearTrackEndListeners(): void {
    for (const { track, listener } of this.trackEndListeners) {
      track.removeEventListener('ended', listener);
    }
    this.trackEndListeners.length = 0;
  }

  private async releaseResources(): Promise<void> {
    this.lifecycle += 1;
    this.stopCaptureLoop();
    this.cancelCalibration('stopped');
    this.pendingBitmap?.close();
    this.pendingBitmap = null;
    this.clearWorkerFrameTimeout();
    this.captureBusy = false;
    this.workerFrameInFlight = false;

    const stream = this.stream;
    this.stream = null;
    this.clearTrackEndListeners();
    stream?.getTracks().forEach((track) => track.stop());

    const video = this.video;
    this.video = null;
    if (video != null) {
      video.pause();
      video.srcObject = null;
      if (this.ownsVideo) {
        video.remove();
      }
    }
    this.ownsVideo = false;

    await this.shutdownWorker();
    this.mainThreadLandmarker?.close();
    this.mainThreadLandmarker = null;
    this.mode = null;
    this.consecutiveInferenceErrors = 0;
    this.switchingFallback = false;
  }

  private async shutdownWorker(): Promise<void> {
    const worker = this.worker;
    if (worker == null) {
      return;
    }

    const wasReady = this.workerReady;
    this.worker = null;
    this.workerReady = false;
    this.clearWorkerFrameTimeout();
    this.workerFrameInFlight = false;
    this.workerInitResolver?.(false);
    this.workerInitResolver = null;

    if (wasReady) {
      await new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId = 0;
        const finish = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          this.workerCloseResolver = null;
          resolve();
        };
        timeoutId = window.setTimeout(finish, WORKER_CLOSE_GRACE_MS);
        this.workerCloseResolver = finish;
        const request: FaceWorkerRequest = { type: 'close' };
        try {
          worker.postMessage(request);
        } catch {
          finish();
        }
      });
    }

    worker.terminate();
  }
}
