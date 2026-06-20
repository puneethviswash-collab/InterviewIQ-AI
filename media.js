/* ==========================================================================
   media.js — camera + microphone access, toggling, and live audio level.
   ========================================================================== */

const Media = (() => {
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let levelRafId = null;

  let cameraEnabled = true;
  let micEnabled = true;

  let onLevel = null; // callback(amplitude 0..1)

  function isSecure() {
    return Utils.isSecureEnoughForMedia();
  }

  /** Request camera + mic. Returns { camera: bool, mic: bool, error } */
  async function requestAccess() {
    if (!isSecure()) {
      return { camera: false, mic: false, error: "insecure-context" };
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { camera: false, mic: false, error: "unsupported" };
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setupAudioAnalyser(stream);
      return { camera: true, mic: true, error: null };
    } catch (err) {
      // Try audio only, in case only camera was denied
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupAudioAnalyser(stream);
        return { camera: false, mic: true, error: "camera-denied" };
      } catch (err2) {
        return { camera: false, mic: false, error: err.name || "denied" };
      }
    }
  }

  function setupAudioAnalyser(mediaStream) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      sourceNode.connect(analyser);
      startLevelLoop();
    } catch (e) {
      // Web Audio not available — degrade gracefully, no live level meter.
      console.warn("Audio analyser unavailable:", e);
    }
  }

  function startLevelLoop() {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      if (onLevel) onLevel(Utils.clamp(rms * 3.2, 0, 1));
      levelRafId = requestAnimationFrame(tick);
    };
    tick();
  }

  function setLevelCallback(fn) { onLevel = fn; }

  function attachToVideo(videoEl) {
    if (!videoEl) return;
    videoEl.srcObject = stream;
  }

  function toggleCamera() {
    if (!stream) return cameraEnabled;
    const tracks = stream.getVideoTracks();
    cameraEnabled = !cameraEnabled;
    tracks.forEach(t => (t.enabled = cameraEnabled));
    return cameraEnabled;
  }

  function toggleMic() {
    if (!stream) return micEnabled;
    const tracks = stream.getAudioTracks();
    micEnabled = !micEnabled;
    tracks.forEach(t => (t.enabled = micEnabled));
    return micEnabled;
  }

  function getCameraEnabled() { return cameraEnabled; }
  function getMicEnabled() { return micEnabled; }
  function hasStream() { return !!stream; }
  function getStream() { return stream; }

  function stopAll() {
    if (levelRafId) cancelAnimationFrame(levelRafId);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }
    stream = null;
    audioCtx = null;
    analyser = null;
  }

  return {
    isSecure, requestAccess, attachToVideo, toggleCamera, toggleMic,
    getCameraEnabled, getMicEnabled, hasStream, getStream, stopAll, setLevelCallback
  };
})();
