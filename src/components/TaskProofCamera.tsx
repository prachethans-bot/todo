import { useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, X, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera";

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
  const [verifying, setVerifying] = useState(false);

  async function openCamera() {
    setError("");
    setOpening(true);
    setSnapshot(null);
    try {
      // Native Android uses Capacitor's camera plugin so Android permission prompts work.
      if (Capacitor.isNativePlatform()) {
        stopCamera();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is unavailable. Open the app over HTTPS or use the Android app.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      const cameraError = e as { name?: string; message?: string };
      if (cameraError?.name === "NotAllowedError" || cameraError?.name === "PermissionDeniedError") {
        setError("Camera permission is blocked. In Chrome, tap the site icon beside the address bar → Permissions → Camera → Allow, then tap Try camera again. If this is opened inside another app, open the website directly in Chrome.");
      } else if (cameraError?.name === "NotFoundError" || cameraError?.name === "DevicesNotFoundError") {
        setError("No camera was found on this device. Check your camera app and try again.");
      } else if (cameraError?.name === "NotReadableError" || cameraError?.name === "TrackStartError") {
        setError("Your camera may be in use by another app. Close other camera apps and tap Try camera again.");
      } else if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera needs a secure HTTPS page. Open the published website in Chrome, not a preview embedded inside another app.");
      } else {
        setError(cameraError?.message || "Could not open the camera. Check browser camera permissions and try again.");
      }
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

  async function capture() {
    if (Capacitor.isNativePlatform()) {
      setError("");
      setOpening(true);
      try {
        const photo = await Camera.getPhoto({
          quality: 78,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          direction: CameraDirection.Rear,
          saveToGallery: false
        });
        if (!photo.dataUrl) throw new Error("The camera did not return a photo. Please try again.");
        setSnapshot(photo.dataUrl);
      } catch (e) {
        const cameraError = e as { message?: string };
        setError(cameraError?.message || "Could not capture the photo. Please allow camera access and try again.");
      } finally {
        setOpening(false);
      }
      return;
    }
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

  async function confirm() {
    if (!snapshot || verifying) return;
    if (!supabase) {
      setError("Sign in and connect Supabase before using AI verification.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const { data, error: verifyError } = await supabase.functions.invoke("verify-task-start", {
        body: { taskTitle, imageData: snapshot }
      });
      if (verifyError) throw verifyError;
      if (data?.approved !== true) {
        setError(typeof data?.reason === "string" ? data.reason : "The photo did not show a clear starting setup. Retake it and try again.");
        return;
      }
      stopCamera();
      setSnapshot(null);
      onConfirm();
    } catch {
      setError("AI verification is unavailable. Your alarm is still on. Please try again.");
    } finally {
      setVerifying(false);
    }
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
        <p className="proof-description">Take a quick photo of your workspace as you get ready to begin. The photo is sent to Gemini for a temporary AI check, but is not saved to your gallery or your app database.</p>
        <div className="proof-preview">
          {snapshot ? <img src={snapshot} alt="Temporary task-start photo preview" /> : Capacitor.isNativePlatform() ? <span className="proof-camera-status">Tap Capture photo to open your camera</span> : <video ref={videoRef} autoPlay muted playsInline />}
          {opening && !snapshot && <span className="proof-camera-status">Opening camera…</span>}
        </div>
        {error && <p className="proof-error" role="alert">{error}</p>}
        <div className="plan-controls proof-controls">
          {snapshot ? (
            <>
              <button type="button" className="outline" onClick={() => void openCamera()}><RefreshCw size={15} /> Retake</button>
              <button type="button" className="primary" onClick={() => void confirm()} disabled={verifying}><ShieldCheck size={15} /> {verifying ? "Checking photo…" : "Verify & start"}</button>
            </>
          ) : error ? (
            <button type="button" className="primary" disabled={opening} onClick={() => void openCamera()}><RefreshCw size={15} /> {opening ? "Opening camera…" : "Try camera again"}</button>
          ) : (
            <button type="button" className="primary" disabled={opening} onClick={() => void capture()}><Camera size={15} /> {opening ? "Opening camera…" : "Capture photo"}</button>
          )}
        </div>
        <p className="proof-privacy">Temporary Gemini check · not saved to your gallery or app database · task stays incomplete</p>
      </div>
    </div>
  );
}
