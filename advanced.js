/* ==========================================================================
   advanced.js — on-camera presence: face detection, eye contact, smiling,
   a rough emotion read and posture/movement.

   Two modes:
   1. "mediapipe" — real face landmark detection via MediaPipe Tasks Vision,
      loaded lazily from a CDN. Gives eye-contact (head yaw/pitch near zero),
      smile (mouth-smile blendshape), and a coarse emotion label.
   2. "basic" — used automatically if MediaPipe can't load (offline, blocked
      CDN, unsupported browser, no network). Uses simple frame-difference
      motion analysis to report presence/engagement honestly, without
      pretending to detect things it can't.
   ========================================================================== */

const AdvancedVision = (() => {
  let mode = null;          // "mediapipe" | "basic" | null (not started)
  let faceLandmarker = null;
  let videoEl = null;
  let rafId = null;
  let lastReading = { faceDetected: false, eyeContact: false, smiling: false, emotion: "neutral", posture: "centered", mode: null };
  let onReading = null;

  // ---- basic-mode internals ----
  let basicCanvas, basicCtx, prevFrame = null;
  let motionHistory = [];

  async function tryLoadMediaPipe() {
    try {
      const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
      const { FaceLandmarker, FilesetResolver } = visionModule;
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      return true;
    } catch (err) {
      console.warn("MediaPipe face landmarker unavailable, falling back to basic presence mode.", err);
      return false;
    }
  }

  function yawPitchFromMatrix(matrix) {
    // matrix is a 4x4 column-major transform; extract a rough yaw/pitch in degrees.
    const m = matrix.data || matrix;
    const yaw = Math.atan2(-m[2], m[10]) * (180 / Math.PI);
    const pitch = Math.atan2(-m[6], m[10]) * (180 / Math.PI);
    return { yaw, pitch };
  }

  function blendshapeScore(blendshapes, name) {
    const cat = blendshapes?.categories?.find(c => c.categoryName === name);
    return cat ? cat.score : 0;
  }

  function runMediaPipeLoop() {
    if (!faceLandmarker || !videoEl) return;
    const detect = () => {
      if (videoEl.readyState >= 2) {
        try {
          const result = faceLandmarker.detectForVideo(videoEl, performance.now());
          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            const blendshapes = result.faceBlendshapes && result.faceBlendshapes[0];
            const smileScore = Math.max(
              blendshapeScore(blendshapes, "mouthSmileLeft"),
              blendshapeScore(blendshapes, "mouthSmileRight")
            );
            const browDown = Math.max(blendshapeScore(blendshapes, "browDownLeft"), blendshapeScore(blendshapes, "browDownRight"));
            let eyeContact = true, posture = "centered";
            if (result.facialTransformationMatrixes && result.facialTransformationMatrixes[0]) {
              const { yaw, pitch } = yawPitchFromMatrix(result.facialTransformationMatrixes[0]);
              eyeContact = Math.abs(yaw) < 18 && Math.abs(pitch) < 16;
              posture = Math.abs(yaw) >= 18 ? (yaw > 0 ? "leaning right" : "leaning left") : (pitch > 14 ? "looking down" : pitch < -14 ? "looking up" : "centered");
            }
            const smiling = smileScore > 0.35;
            const emotion = smiling ? "smiling" : browDown > 0.4 ? "tense" : "neutral";
            lastReading = { faceDetected: true, eyeContact, smiling, emotion, posture, mode: "mediapipe" };
          } else {
            lastReading = { faceDetected: false, eyeContact: false, smiling: false, emotion: "no face detected", posture: "unknown", mode: "mediapipe" };
          }
        } catch (e) {
          // keep last good reading on transient errors
        }
        if (onReading) onReading(lastReading);
      }
      rafId = requestAnimationFrame(detect);
    };
    detect();
  }

  function runBasicLoop() {
    basicCanvas = document.createElement("canvas");
    basicCanvas.width = 64; basicCanvas.height = 48;
    basicCtx = basicCanvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (videoEl && videoEl.readyState >= 2) {
        basicCtx.drawImage(videoEl, 0, 0, 64, 48);
        const frame = basicCtx.getImageData(0, 0, 64, 48).data;
        let motion = 0, brightnessSum = 0;
        if (prevFrame) {
          for (let i = 0; i < frame.length; i += 4) {
            motion += Math.abs(frame[i] - prevFrame[i]);
            brightnessSum += frame[i];
          }
        }
        prevFrame = frame;
        const avgMotion = motion / (64 * 48);
        const avgBrightness = brightnessSum / (64 * 48);
        motionHistory.push(avgMotion);
        if (motionHistory.length > 20) motionHistory.shift();
        const recentAvgMotion = motionHistory.reduce((s, v) => s + v, 0) / motionHistory.length;

        const faceDetected = avgBrightness > 18; // near-black frame usually means camera blocked/off
        const engagement = recentAvgMotion > 1.2 && recentAvgMotion < 22 ? "engaged" : recentAvgMotion >= 22 ? "very active" : "very still";

        lastReading = {
          faceDetected,
          eyeContact: null,      // not estimable in basic mode — UI should hide this claim
          smiling: null,
          emotion: null,
          posture: engagement,
          mode: "basic"
        };
        if (onReading) onReading(lastReading);
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  async function start(videoElement, callback) {
    videoEl = videoElement;
    onReading = callback;
    motionHistory = [];
    prevFrame = null;

    if (!faceLandmarker && mode !== "basic") {
      const ok = await tryLoadMediaPipe();
      mode = ok ? "mediapipe" : "basic";
    }
    if (mode === "mediapipe") runMediaPipeLoop();
    else runBasicLoop();
    return mode;
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function getMode() { return mode; }
  function getLastReading() { return lastReading; }

  return { start, stop, getMode, getLastReading };
})();
