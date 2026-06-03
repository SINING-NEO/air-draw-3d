import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerOptions,
  type HandLandmarkerOptions,
} from '@mediapipe/tasks-vision'

/** Pin WASM to the installed package — @latest on CDN can break production builds. */
const MEDIAPIPE_VERSION = '0.10.35'
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const HAND_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const FACE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

type Delegate = 'GPU' | 'CPU'

async function createHandLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
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
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
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
): Promise<T> {
  try {
    return await create('GPU')
  } catch {
    return await create('CPU')
  }
}

export async function createVisionLandmarkers(): Promise<{
  handLandmarker: HandLandmarker
  faceLandmarker: FaceLandmarker
}> {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
  const [handLandmarker, faceLandmarker] = await Promise.all([
    withDelegateFallback((d) => createHandLandmarker(vision, d)),
    withDelegateFallback((d) => createFaceLandmarker(vision, d)),
  ])
  return { handLandmarker, faceLandmarker }
}
