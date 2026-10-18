import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, ScanFace, ShieldAlert } from 'lucide-react';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const MATCH_THRESHOLD = 0.48;
const LABELS = { blink: 'Blink once', left: 'Turn your head to your left', right: 'Turn your head to your right' };

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
  const challenges = useRef(Math.random() > .5 ? ['blink', 'left', 'right'] : ['blink', 'right', 'left']);
  const [model, setModel] = useState('NOT LOADED');
  const [camera, setCamera] = useState(false);
  const [face, setFace] = useState('NO FACE DETECTED');
  const [progress, setProgress] = useState(0);
  const [match, setMatch] = useState(null);
  const [status, setStatus] = useState('Start the camera only when you are ready to verify.');
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
      await Promise.all([
        api.current.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        api.current.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        api.current.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      setModel('READY');
      return true;
    } catch (cause) {
      api.current = null;
      setModel('UNAVAILABLE');
      setError(`Face models could not load: ${cause.message}`);
      return false;
    }
  };

  const capture = async () => {
    if (!video.current || video.current.readyState < 2 || !api.current) return null;
    return api.current
      .detectSingleFace(video.current, new api.current.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
  };

  const loadReference = async () => {
    if (enrolled.current) return true;
    if (!referencePhotoUrl) { setError('The registered reference photograph is not available yet.'); return false; }
    const image = new Image();
    image.src = referencePhotoUrl;
    try {
      await image.decode();
      const result = await api.current
        .detectSingleFace(image, new api.current.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!result) { setError('No clear single face was found in the registered photograph. Update the reference image.'); return false; }
      enrolled.current = Float32Array.from(result.descriptor);
      return true;
    } catch (cause) {
      setError(`Reference photograph could not be processed: ${cause.message}`);
      return false;
    }
  };

  const loop = async time => {
    if (!running.current) return;
    requestAnimationFrame(loop);
    if (busy.current || time - lastTick.current < 180) return;
    busy.current = true;
    lastTick.current = time;
    try {
      const result = await capture();
      if (!running.current) return;
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
        setStatus('The visible face differs from the in-memory reference. Verification is paused.');
        return;
      }
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
          submitted.current = true;
          setStatus('Face match and all three movement checks passed. Sending the result for backend reassessment.');
          await onComplete(rider.id, 'PASSED', {
            source: 'FACE_MATCH',
            metadata: { matchDistance: Number(descriptorDistance.toFixed(4)), movementChecks: challenges.current, model: '@vladmandic/face-api 1.7.15' },
          });
          stop();
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
    if (!await loadModels()) return;
    if (!await loadReference()) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access requires localhost or HTTPS.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      stream.current = media;
      video.current.srcObject = media;
      await video.current.play();
      running.current = true;
      setCamera(true);
      setStatus(`Reference loaded. ${LABELS[challenges.current[0]]}.`);
      requestAnimationFrame(loop);
    } catch (cause) {
      setError(`Camera access failed: ${cause.message}`);
      stop();
    }
  };

  return <section className="face-verification" aria-label="Optional face verification">
    <header><ScanFace /><div><span>TEAMMATE MODULE / LOCAL BROWSER PROCESSING</span><h2>FACE MATCH + ACTIVE MOVEMENT CHECK</h2></div></header>
    <div className="face-grid">
      <div className="face-camera">
        <video ref={video} autoPlay playsInline muted style={{ display: camera ? 'block' : 'none' }} />
        {!camera && <div><CameraOff /><b>CAMERA OFF</b><span>No capture occurs until you choose Start Camera.</span></div>}
        <small>{model} · {face}</small>
      </div>
      <div className="face-controls">
        <p>{status}</p>
        <strong>{progress === challenges.current.length ? 'MOVEMENT SEQUENCE COMPLETE' : `NEXT: ${LABELS[challenges.current[progress]]}`}</strong>
        <div className="movement-progress">{challenges.current.map((item, index) => <i className={index < progress ? 'done' : ''} key={item}>{index + 1}</i>)}</div>
        {match && <p className={match.ok ? 'match-ok' : 'match-fail'}>Descriptor distance {match.distance.toFixed(3)} · {match.ok ? 'PROTOTYPE MATCH' : 'NO MATCH'} · threshold {MATCH_THRESHOLD}</p>}
        <div className="face-buttons">
          <button onClick={start} disabled={camera || model === 'LOADING'}><Camera /> {model === 'LOADING' ? 'LOADING MODELS…' : 'START CAMERA'}</button>
          <button className="secondary" onClick={stop} disabled={!camera}>STOP CAMERA</button>
        </div>
        {match && !match.ok && <button className="face-failed" onClick={() => onComplete(rider.id, 'FAILED', { source: 'FACE_MATCH', metadata: { matchDistance: Number(lastDistance.current?.toFixed(4)), movementChecks: progress, model: '@vladmandic/face-api 1.7.15' } })}><ShieldAlert /> SUBMIT FAILED MATCH</button>}
        {error && <p className="face-error" role="alert">{error}</p>}
      </div>
    </div>
    <div className="verification-disclosure"><CheckCircle2 /><p><b>PRIVACY & LIMITATION</b>The live descriptor and registered-photo descriptor stay in tab memory; raw camera frames are not uploaded. Blink and randomised head turns are basic movement checks—not spoof-proof liveness detection.</p></div>
  </section>;
}
