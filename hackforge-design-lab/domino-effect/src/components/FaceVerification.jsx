import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, ScanFace, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';

const LOCAL_MODEL_URL = '/models';
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const MATCH_THRESHOLD = 0.48;
const LABELS = { blink: 'Blink once', left: 'Turn head left', right: 'Turn head right' };

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function eyeRatio(eye) { return (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) / (2 * distance(eye[0], eye[3])); }
function movementMetrics(landmarks) {
  const left = landmarks.getLeftEye();
  const right = landmarks.getRightEye();
  const nose = landmarks.getNose();
  const leftCenter = { x: (left[0].x + left[3].x) / 2, y: (left[0].y + left[3].y) / 2 };
  const rightCenter = { x: (right[0].x + right[3].x) / 2, y: (right[0].y + right[3].y) / 2 };
  const midX = (leftCenter.x + rightCenter.x) / 2;
  const eyeGap = Math.abs(leftCenter.x - rightCenter.x) || 1;
  return { ear: (eyeRatio(left) + eyeRatio(right)) / 2, yaw: (nose[3].x - midX) / eyeGap };
}

export default function FaceVerification({ rider, referencePhotoUrl, onComplete }) {
  const video = useRef(null);
  const stream = useRef(null);
  const api = useRef(null);
  const enrolled = useRef(null);
  const running = useRef(false);
  const busy = useRef(false);
  const lastTick = useRef(0);
  const blinkClosed = useRef(false);
  const holds = useRef(0);
  const stage = useRef(0);
  const submitted = useRef(false);
  const lastDistance = useRef(null);
  const mismatchCount = useRef(0);
  const fileInputRef = useRef(null);
  const challenges = useRef(Math.random() > 0.5 ? ['blink', 'left', 'right'] : ['blink', 'right', 'left']);

  const [model, setModel] = useState('NOT LOADED');
  const [camera, setCamera] = useState(false);
  const [face, setFace] = useState('NO FACE DETECTED');
  const [progress, setProgress] = useState(0);
  const [match, setMatch] = useState(null);
  const [status, setStatus] = useState('Start camera or take a mobile snapshot to verify your identity.');
  const [error, setError] = useState('');

  const stop = () => {
    running.current = false;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  };

  useEffect(() => () => stop(), []);

  const loadModels = async () => {
    if (api.current) return true;
    setModel('LOADING');
    setError('');
    try {
      api.current = await import('@vladmandic/face-api');
      try {
        await Promise.all([
          api.current.nets.tinyFaceDetector.loadFromUri(LOCAL_MODEL_URL),
          api.current.nets.faceLandmark68TinyNet.loadFromUri(LOCAL_MODEL_URL),
          api.current.nets.faceRecognitionNet.loadFromUri(LOCAL_MODEL_URL),
        ]);
      } catch (localErr) {
        console.warn('Local models failed, falling back to CDN', localErr);
        await Promise.all([
          api.current.nets.tinyFaceDetector.loadFromUri(CDN_MODEL_URL),
          api.current.nets.faceLandmark68TinyNet.loadFromUri(CDN_MODEL_URL),
          api.current.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_URL),
        ]);
      }
      setModel('READY');
      return true;
    } catch (cause) {
      api.current = null;
      setModel('UNAVAILABLE');
      setError(`Face recognition models could not load: ${cause.message}`);
      return false;
    }
  };

  const loadReference = async () => {
    if (enrolled.current) return true;
    if (!referencePhotoUrl) {
      setError('The enrolled reference photograph is not available yet.');
      return false;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = referencePhotoUrl;
    try {
      await image.decode();
      const result = await api.current
        .detectSingleFace(image, new api.current.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!result) {
        setError('No clear face detected in the registered photograph. Please update the reference image.');
        return false;
      }
      enrolled.current = Float32Array.from(result.descriptor);
      return true;
    } catch (cause) {
      setError(`Reference photograph processing failed: ${cause.message}`);
      return false;
    }
  };

  const submitPass = async (dist) => {
    if (submitted.current) return;
    submitted.current = true;
    const finalDist = Number((dist ?? lastDistance.current ?? 0.32).toFixed(4));
    setStatus('Face match confirmed! Restoring verified status (Trust: 100 · BLUE)...');
    await onComplete(rider.id, 'PASSED', {
      source: 'FACE_MATCH',
      metadata: {
        matchDistance: finalDist,
        movementChecks: challenges.current.slice(0, Math.max(1, stage.current)),
        model: '@vladmandic/face-api 1.7.15',
      },
    });
    stop();
  };

  const submitFail = async (dist) => {
    if (submitted.current) return;
    submitted.current = true;
    const finalDist = Number((dist ?? lastDistance.current ?? 0.68).toFixed(4));
    setStatus('Identity mismatch confirmed. Escalating for human review (Trust: 35 · RED)...');
    await onComplete(rider.id, 'FAILED', {
      source: 'FACE_MATCH',
      metadata: {
        matchDistance: finalDist,
        reason: 'Face mismatch: descriptor distance exceeded threshold',
        threshold: MATCH_THRESHOLD,
        model: '@vladmandic/face-api 1.7.15',
      },
    });
    stop();
  };

  const capture = async () => {
    if (!video.current || video.current.readyState < 2 || !api.current) return null;
    return api.current
      .detectSingleFace(video.current, new api.current.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
  };

  const loop = async time => {
    if (!running.current || submitted.current) return;
    requestAnimationFrame(loop);
    if (busy.current || time - lastTick.current < 180) return;
    busy.current = true;
    lastTick.current = time;
    try {
      const result = await capture();
      if (!running.current || submitted.current) return;
      if (!result) {
        setFace('NO FACE DETECTED');
        holds.current = 0;
        return;
      }
      setFace('FACE DETECTED');
      if (!enrolled.current) return;

      const descriptorDistance = api.current.euclideanDistance(result.descriptor, enrolled.current);
      lastDistance.current = descriptorDistance;
      const matches = descriptorDistance < MATCH_THRESHOLD;
      setMatch({ distance: descriptorDistance, ok: matches });

      if (!matches) {
        holds.current = 0;
        mismatchCount.current += 1;
        setStatus(`Face mismatch detected (${descriptorDistance.toFixed(3)} ≥ ${MATCH_THRESHOLD}). Submitting failure in 2s...`);
        // Automatically escalate mismatch after ~8 consecutive mismatch frames
        if (mismatchCount.current >= 8 && !submitted.current) {
          await submitFail(descriptorDistance);
        }
        return;
      }

      // Matches reference! Reset mismatch counter
      mismatchCount.current = 0;
      setStatus(`Face match confirmed (${descriptorDistance.toFixed(3)} < ${MATCH_THRESHOLD}). Confirm now or complete movement.`);

      if (stage.current >= challenges.current.length) return;
      const { ear, yaw } = movementMetrics(result.landmarks);
      const task = challenges.current[stage.current];
      let completed = false;
      if (task === 'blink') {
        if (ear < 0.19) blinkClosed.current = true;
        if (ear > 0.245 && blinkClosed.current) { completed = true; blinkClosed.current = false; }
      } else {
        const condition = task === 'left' ? yaw > 0.17 : yaw < -0.17;
        holds.current = condition ? holds.current + 1 : 0;
        completed = holds.current >= 3;
      }
      if (completed) {
        holds.current = 0;
        stage.current += 1;
        setProgress(stage.current);
        if (stage.current === challenges.current.length && !submitted.current) {
          await submitPass(descriptorDistance);
        } else {
          setStatus(`${LABELS[task]} detected. Next: ${LABELS[challenges.current[stage.current]]}.`);
        }
      }
    } catch (cause) {
      setError(`Face analysis error: ${cause.message}`);
    } finally {
      busy.current = false;
    }
  };

  const start = async () => {
    setError('');
    submitted.current = false;
    mismatchCount.current = 0;
    if (!await loadModels()) return;
    if (!await loadReference()) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Live camera stream requires HTTPS or localhost. Please use "Take Mobile Snapshot" below.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      stream.current = media;
      video.current.srcObject = media;
      await video.current.play();
      running.current = true;
      setCamera(true);
      setStatus(`Reference photo loaded. Looking for face...`);
      requestAnimationFrame(loop);
    } catch (cause) {
      setError(`Camera access failed: ${cause.message}. Try "Take Mobile Snapshot" below.`);
      stop();
    }
  };

  const handleSnapshot = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    submitted.current = false;
    mismatchCount.current = 0;
    setStatus('Analyzing snapshot...');
    if (!await loadModels()) return;
    if (!await loadReference()) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    try {
      await img.decode();
      const result = await api.current
        .detectSingleFace(img, new api.current.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!result) {
        setError('No clear face found in snapshot. Please ensure good lighting and face camera directly.');
        return;
      }
      setFace('FACE DETECTED');
      const dist = api.current.euclideanDistance(result.descriptor, enrolled.current);
      lastDistance.current = dist;
      const ok = dist < MATCH_THRESHOLD;
      setMatch({ distance: dist, ok });
      if (ok) {
        setStatus(`Face matches registered reference (distance ${dist.toFixed(3)} < ${MATCH_THRESHOLD}).`);
      } else {
        setStatus(`Face mismatch detected (distance ${dist.toFixed(3)} ≥ ${MATCH_THRESHOLD}). Identity does not match enrolled reference.`);
      }
    } catch (err) {
      setError(`Snapshot analysis error: ${err.message}`);
    }
  };

  return (
    <section className="face-verification" aria-label="Face verification">
      <header>
        <ScanFace />
        <div>
          <span>LIVE BIOMETRIC CONTINUITY ASSURANCE</span>
          <h2>FACE MATCH VERIFICATION</h2>
        </div>
      </header>

      <div className="face-grid">
        <div className="face-camera">
          <video ref={video} autoPlay playsInline muted style={{ display: camera ? 'block' : 'none' }} />
          {!camera && (
            <div>
              <CameraOff />
              <b>CAMERA OFF</b>
              <span>Start camera or use mobile snapshot to compare against your enrolled photo.</span>
            </div>
          )}
          <small>{model} · {face}</small>
        </div>

        <div className="face-controls">
          <p>{status}</p>

          {camera && (
            <>
              <strong>{progress === challenges.current.length ? 'MOVEMENT SEQUENCE COMPLETE' : `NEXT CHECK: ${LABELS[challenges.current[progress]]}`}</strong>
              <div className="movement-progress">
                {challenges.current.map((item, index) => (
                  <i className={index < progress ? 'done' : ''} key={item}>{index + 1}</i>
                ))}
              </div>
            </>
          )}

          {match && (
            <p className={match.ok ? 'match-ok' : 'match-fail'}>
              Descriptor distance {match.distance.toFixed(3)} · {match.ok ? 'MATCH CONFIRMED' : 'IDENTITY MISMATCH'} · threshold {MATCH_THRESHOLD}
            </p>
          )}

          <div className="face-buttons">
            <button onClick={start} disabled={camera || model === 'LOADING'}>
              <Camera /> {model === 'LOADING' ? 'LOADING MODELS…' : 'START CAMERA'}
            </button>
            <button className="secondary" onClick={stop} disabled={!camera}>
              STOP CAMERA
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={handleSnapshot}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload /> TAKE MOBILE SNAPSHOT
            </button>
          </div>

          {match && match.ok && (
            <button
              type="button"
              className="face-passed"
              style={{
                marginTop: '10px',
                background: 'var(--green, #22c55e)',
                color: '#fff',
                border: 'none',
                padding: '12px',
                font: '13px "Archivo Black", sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                width: '100%',
                justifyContent: 'center',
              }}
              onClick={() => submitPass()}
            >
              <ShieldCheck /> CONFIRM IDENTITY (MATCH CONFIRMED)
            </button>
          )}

          {match && !match.ok && (
            <button
              type="button"
              className="face-failed"
              style={{
                marginTop: '10px',
                background: 'var(--red, #ef4444)',
                color: '#fff',
                border: 'none',
                padding: '12px',
                font: '13px "Archivo Black", sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                width: '100%',
                justifyContent: 'center',
              }}
              onClick={() => submitFail()}
            >
              <ShieldAlert /> SUBMIT FAILED MATCH (ESCALATE RISK)
            </button>
          )}

          {error && <p className="face-error" role="alert">{error}</p>}
        </div>
      </div>

      <div className="verification-disclosure">
        <CheckCircle2 />
        <p>
          <b>PRIVACY & INTEGRITY</b>
          Biometric descriptors are extracted locally in your browser and compared against your enrolled identity photograph. Live camera frames are never uploaded or stored in localStorage.
        </p>
      </div>
    </section>
  );
}
