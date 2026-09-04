/// <reference lib="webworker" />

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

import type { FaceActivitySample } from './neutralScore';

export interface FaceWorkerInitRequest {
  type: 'init';
  wasmBaseUrl: string;
  modelAssetUrl: string;
}

export interface FaceWorkerFrameRequest {
  type: 'frame';
  frameId: number;
  bitmap: ImageBitmap;
  timestampMs: number;
}

export interface FaceWorkerCloseRequest {
  type: 'close';
}

export type FaceWorkerRequest =
  | FaceWorkerInitRequest
  | FaceWorkerFrameRequest
  | FaceWorkerCloseRequest;

export interface FaceWorkerReadyResponse {
  type: 'ready';
}

export interface FaceWorkerResultResponse {
  type: 'result';
  frameId: number;
  timestampMs: number;
  sample: FaceActivitySample | null;
  inferenceMs: number;
}

export interface FaceWorkerErrorResponse {
  type: 'error';
  fatal: boolean;
  message: string;
  frameId?: number;
}

export interface FaceWorkerClosedResponse {
  type: 'closed';
}

export type FaceWorkerResponse =
  | FaceWorkerReadyResponse
  | FaceWorkerResultResponse
  | FaceWorkerErrorResponse
  | FaceWorkerClosedResponse;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let faceLandmarker: FaceLandmarker | null = null;

function post(response: FaceWorkerResponse): void {
  workerScope.postMessage(response);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown face inference error';
}

function blendshapeScore(
  categories: readonly { categoryName: string; score: number }[],
  name: string,
): number {
  const value = categories.find((category) => category.categoryName === name)?.score ?? 0;
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function pairAverage(left: number, right: number): number {
  return (left + right) / 2;
}

function extractActivitySample(result: FaceLandmarkerResult): FaceActivitySample | null {
  const categories = result.faceBlendshapes[0]?.categories;
  if (categories == null || categories.length === 0) {
    return null;
  }

  const smileLeft = blendshapeScore(categories, 'mouthSmileLeft');
  const smileRight = blendshapeScore(categories, 'mouthSmileRight');
  const browOuterLeft = blendshapeScore(categories, 'browOuterUpLeft');
  const browOuterRight = blendshapeScore(categories, 'browOuterUpRight');
  const eyeWideLeft = blendshapeScore(categories, 'eyeWideLeft');
  const eyeWideRight = blendshapeScore(categories, 'eyeWideRight');

  return {
    smile: pairAverage(smileLeft, smileRight),
    jawOpen: blendshapeScore(categories, 'jawOpen'),
    browUp: Math.max(
      blendshapeScore(categories, 'browInnerUp'),
      pairAverage(browOuterLeft, browOuterRight),
    ),
    eyeWide: pairAverage(eyeWideLeft, eyeWideRight),
  };
}

async function initialize(request: FaceWorkerInitRequest): Promise<void> {
  faceLandmarker?.close();
  faceLandmarker = null;

  const vision = await FilesetResolver.forVisionTasks(request.wasmBaseUrl);
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: request.modelAssetUrl,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function processFrame(request: FaceWorkerFrameRequest): void {
  const startedAt = performance.now();

  try {
    if (faceLandmarker == null) {
      throw new Error('Face Landmarker is not initialized');
    }

    const result = faceLandmarker.detectForVideo(request.bitmap, request.timestampMs);
    post({
      type: 'result',
      frameId: request.frameId,
      timestampMs: request.timestampMs,
      sample: extractActivitySample(result),
      inferenceMs: performance.now() - startedAt,
    });
  } catch (error) {
    post({
      type: 'error',
      fatal: false,
      frameId: request.frameId,
      message: errorMessage(error),
    });
  } finally {
    request.bitmap.close();
  }
}

function closeWorkerResources(): void {
  faceLandmarker?.close();
  faceLandmarker = null;
  post({ type: 'closed' });
}

workerScope.addEventListener('message', (event: MessageEvent<FaceWorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'init':
      void initialize(request)
        .then(() => post({ type: 'ready' }))
        .catch((error: unknown) => {
          post({ type: 'error', fatal: true, message: errorMessage(error) });
        });
      break;
    case 'frame':
      processFrame(request);
      break;
    case 'close':
      closeWorkerResources();
      break;
  }
});
