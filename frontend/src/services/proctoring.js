import api from './api';

let mediaStream = null;
let snapshotInterval = null;
let heartbeatInterval = null;
let faceDetectionActive = false;

const FACE_LANDMARK_KEYPOINTS = 468;
const GAZE_THRESHOLD = 0.3;

function detectFaces(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  let faceCount = 0;
  let gazeOk = true;

  const sampleStep = 8;
  const samplePixels = [];
  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < w; x += sampleStep) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      samplePixels.push(luminance);
    }
  }

  const avgLum = samplePixels.reduce((a, b) => a + b, 0) / samplePixels.length;
  const variance = samplePixels.reduce((a, b) => a + (b - avgLum) ** 2, 0) / samplePixels.length;
  const stdDev = Math.sqrt(variance);

  const hasContent = stdDev > 25;
  if (!hasContent) {
    return { faceDetected: false, facesCount: 0, gazeOk: true };
  }

  const midX = w / 2;
  const midY = h / 2;
  const centerRegionSize = { w: w * 0.3, h: h * 0.4 };
  const cx = Math.floor(midX);
  const cy = Math.floor(midY);
  const hw = Math.floor(centerRegionSize.w / 2);
  const hh = Math.floor(centerRegionSize.h / 2);

  let centerBrightness = 0;
  let centerCount = 0;
  for (let y = cy - hh; y < cy + hh; y += 2) {
    for (let x = cx - hw; x < cx + hw; x += 2) {
      if (x >= 0 && x < w && y >= 0 && y < h) {
        const idx = (y * w + x) * 4;
        centerBrightness += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        centerCount++;
      }
    }
  }
  centerBrightness /= centerCount;

  const skinToneCount = (() => {
    let count = 0;
    const skinRanges = [
      { r: [0, 255], g: [0, 255], b: [0, 255] },
    ];
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
          count++;
        } else if (r > 220 && g > 210 && b > 170) {
          count++;
        }
      }
    }
    return count;
  })();

  const totalSamples = Math.floor((w / 4) * (h / 4));
  const skinRatio = skinToneCount / totalSamples;

  if (skinRatio > 0.05) {
    faceCount = Math.min(3, Math.ceil(skinRatio / 0.12));
    faceCount = Math.max(1, faceCount);
  } else if (centerBrightness > 30 && variance > 100) {
    faceCount = 1;
  } else {
    faceCount = 0;
  }

  const centerRatio = centerBrightness / 255;
  if (faceCount > 0 && centerRatio < 0.2) {
    gazeOk = false;
  }

  return { faceDetected: faceCount > 0, facesCount: faceCount, gazeOk };
}

async function takeSnapshot(video) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, 320, 240);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function getDetectedState(video) {
  return detectFaces(video);
}

export const proctoringService = {
  async start(submissionId, testId) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = mediaStream;
      video.width = 320;
      video.height = 240;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      faceDetectionActive = true;

      snapshotInterval = setInterval(async () => {
        if (!faceDetectionActive) return;
        try {
          const detection = getDetectedState(video);
          const snapshot = await takeSnapshot(video);

          await api.post('/proctoring/snapshot', {
            submissionId,
            snapshot,
            faceDetected: detection.faceDetected,
            facesCount: detection.facesCount,
            gazeOk: detection.gazeOk,
          });
        } catch {
          // silently fail snapshots
        }
      }, 30000);

      heartbeatInterval = setInterval(async () => {
        if (!faceDetectionActive) return;
        try {
          const detection = getDetectedState(video);
          await api.post('/proctoring/heartbeat', {
            submissionId,
            testId,
            faceDetected: detection.faceDetected,
            facesCount: detection.facesCount,
            gazeOk: detection.gazeOk,
          });
        } catch {
          // silently fail heartbeats
        }
      }, 10000);

      return video;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return { error: 'permission_denied' };
      }
      if (err.name === 'NotFoundError') {
        return { error: 'no_camera' };
      }
      return { error: 'unknown' };
    }
  },

  getDetectedState(video) {
    return getDetectedState(video);
  },

  stop() {
    faceDetectionActive = false;
    if (snapshotInterval) {
      clearInterval(snapshotInterval);
      snapshotInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
  },

  isActive() {
    return faceDetectionActive;
  },
};
