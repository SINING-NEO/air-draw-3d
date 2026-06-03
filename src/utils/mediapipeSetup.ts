import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerOptions,
  type HandLandmarkerOptions,
} from '@mediapipe/tasks-vision'
import { isEdgeBrowser } from './browserSupport'

/** Same-origin WASM — Edge often blocks or stalls third-party CDN WASM. */
function getWasmPath(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return new URL('mediapipe/wasm', base).href
}

const HAND_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const FACE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

type Delegate = 'GPU' | 'CPU'
type VisionWasm = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

let visionLoadPromise: Promise<VisionWasm> | null = null

/** Start loading WASM early (no camera permission needed). */
export function preloadVisionWasm(): Promise<VisionWasm> {
  if (!visionLoadPromise) {
    visionLoadPromise = FilesetResolver.forVisionTasks(getWasmPath())
  }
  return visionLoadPromise
}

async function createHandLandmarker(
  vision: VisionWasm,
  delegate: Delegate,
): Promise<HandLandmarker> {
  const options: HandLandmarkerOptions = {
    baseOptions: {
      modelAssetPath: HAND_MODEL_PATH,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 2,
  }
  return HandLandmarker.createFromOptions(vision, options)
}

async function createFaceLandmarker(
  vision: VisionWasm,
  delegate: Delegate,
): Promise<FaceLandmarker> {
  const options: FaceLandmarkerOptions = {
    baseOptions: {
      modelAssetPath: FACE_MODEL_PATH,
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  }
  return FaceLandmarker.createFromOptions(vision, options)
}

async function withDelegateFallback<T>(
  create: (delegate: Delegate) => Promise<T>,
  preferCpu: boolean,
): Promise<T> {
  if (preferCpu) {
    return create('CPU')
  }
  try {
    return await create('GPU')
  } catch {
    return create('CPU')
  }
}

export async function createVisionLandmarkers(): Promise<{
  handLandmarker: HandLandmarker
  faceLandmarker: FaceLandmarker
}> {
  const vision = await preloadVisionWasm()
  const preferCpu = isEdgeBrowser()

  if (preferCpu) {
    const handLandmarker = await withDelegateFallback(
      (d) => createHandLandmarker(vision, d),
      true,
    )
    const faceLandmarker = await withDelegateFallback(
      (d) => createFaceLandmarker(vision, d),
      true,
    )
    return { handLandmarker, faceLandmarker }
  }

  const [handLandmarker, faceLandmarker] = await Promise.all([
    withDelegateFallback((d) => createHandLandmarker(vision, d), false),
    withDelegateFallback((d) => createFaceLandmarker(vision, d), false),
  ])
  return { handLandmarker, faceLandmarker }
}

export function formatVisionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/fetch|network|failed to load|wasm/i.test(msg)) {
    return 'Could not load hand-tracking models. Check your connection, disable strict tracking blockers, and refresh.'
  }
  return msg || 'Hand tracking failed to start.'
}
