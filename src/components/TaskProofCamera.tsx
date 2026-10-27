import { useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, X } from "lucide-react";

type Props = {
  taskTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TaskProofCamera({ taskTitle, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(true);

  async function openCamera() {
    setError("");
    setOpening(true);
    setSnapshot(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is unavailable. Open the app over HTTPS or use the Android app.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the camera. Please allow camera permission.");
    } finally {
      setOpening(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    void openCamera();
    return () => stopCamera();
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is not ready yet. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Could not capture the photo. Please try again.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.78));
    stopCamera();
    setError("");
  }

  function confirm() {
    stopCamera();
    setSnapshot(null);
    onConfirm();
  }

  return (
    <div className="proof-overlay" role="dialog" aria-modal="true" aria-label="Start task camera check">
      <div className="proof-card">
        <div className="proof-head">
          <span className="proof-icon"><Camera size={18} /></span>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close camera"><X size={18} /></button>
        </div>
        <p className="eyebrow">START TASK CHECK</p>
        <h3>Show yourself starting</h3>
        <p className="proof-task">{taskTitle}</p>
        <p className="proof-description">Take a quick photo of your workspace as you get ready to begin. It stays in temporary memory only — it is not saved to your gallery or uploaded.</p>
        <div className="proof-preview">
          {snapshot ? <img src={snapshot} alt="Temporary task-start photo preview" /> : <video ref={videoRef} autoPlay muted playsInline />}
          {opening && !snapshot && <span className="proof-camera-status">Opening camera…</span>}
        </div>
        {error && <p className="proof-error" role="alert">{error}</p>}
        <div className="plan-controls proof-controls">
          {snapshot ? (
            <>
              <button type="button" className="outline" onClick={() => void openCamera()}><RefreshCw size={15} /> Retake</button>
              <button type="button" className="primary" onClick={confirm}><Check size={15} /> I’m starting</button>
            </>
          ) : (
            <button type="button" className="primary" disabled={opening || !!error} onClick={capture}><Camera size={15} /> Capture photo</button>
          )}
        </div>
        <p className="proof-privacy">No gallery file · no upload · task is not marked done</p>
      </div>
    </div>
  );
}
