import { useEffect, useRef, useState } from "react";
import { Camera, FileText, RefreshCw, X, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

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
  const [method, setMethod] = useState<"photo" | "essay">("photo");
  const [essay, setEssay] = useState("");
  const essayWords = essay.trim() ? essay.trim().split(/\s+/).length : 0;

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

  async function confirm() {
    if (verifying) return;
    if (method === "photo" && !snapshot) return;
    if (method === "essay" && (!essay.trim() || essayWords > 150)) {
      setError(essayWords > 150 ? "Keep your explanation within 150 words." : "Write a short explanation of how you will begin this task.");
      return;
    }
    if (!supabase) {
      setError("Sign in and connect Supabase before using AI verification.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Your sign-in session is missing. Sign out and sign in again, then retry verification.");
        return;
      }

      const body = method === "photo"
        ? { taskTitle, imageData: snapshot }
        : { taskTitle, essayText: essay.trim() };
      const { data, error: verifyError } = await supabase.functions.invoke("verify-task-start", {
        body,
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (verifyError) throw verifyError;
      if (data?.approved !== true) {
        setError(typeof data?.reason === "string" ? data.reason : "That proof does not clearly match this task. Please try again.");
        return;
      }
      stopCamera();
      setSnapshot(null);
      onConfirm();
    } catch (e) {
      const status = (e as { context?: { status?: number } })?.context?.status;
      setError(status === 401
        ? "Your sign-in session was rejected. Sign out and sign in again, then retry."
        : "AI verification is unavailable. Your alarm is still on. Please try again.");
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
        {method === "photo" ? (
          <>
            <div className="proof-preview">
              {snapshot ? <img src={snapshot} alt="Temporary task-start photo preview" /> : <video ref={videoRef} autoPlay muted playsInline />}
              {opening && !snapshot && <span className="proof-camera-status">Opening camera…</span>}
            </div>
            <div className="plan-controls proof-controls">
              {snapshot ? (
                <>
                  <button type="button" className="outline" onClick={() => void openCamera()}><RefreshCw size={15} /> Retake</button>
                  <button type="button" className="primary" onClick={() => void confirm()} disabled={verifying}><ShieldCheck size={15} /> {verifying ? "Checking…" : "Verify & start"}</button>
                </>
              ) : error ? (
                <button type="button" className="primary" disabled={opening} onClick={() => void openCamera()}><RefreshCw size={15} /> {opening ? "Opening camera…" : "Try camera again"}</button>
              ) : (
                <button type="button" className="primary" disabled={opening} onClick={capture}><Camera size={15} /> Capture photo</button>
              )}
            </div>
          </>
        ) : (
          <div className="proof-essay">
            <label htmlFor="task-start-essay">DESCRIBE HOW YOU WILL START THIS TASK</label>
            <textarea
              id="task-start-essay"
              value={essay}
              onChange={(event) => setEssay(event.target.value)}
              placeholder={`Explain the first steps you will take for “${taskTitle}”…`}
              rows={5}
              maxLength={3000}
              aria-describedby="essay-word-count"
            />
            <div className={`proof-word-count ${essayWords > 150 ? "over-limit" : ""}`} id="essay-word-count">{essayWords}/150 words</div>
            <p className="proof-description">Gemini checks whether your explanation genuinely relates to this scheduled task. Unrelated or vague answers will be rejected.</p>
            <div className="plan-controls proof-controls">
              <button type="button" className="primary" onClick={() => void confirm()} disabled={verifying || !essay.trim() || essayWords > 150}>
                <ShieldCheck size={15} /> {verifying ? "Checking explanation…" : "Verify & start"}
              </button>
            </div>
          </div>
        )}
        <div className="proof-method-switch">
          <span>{method === "photo" ? "Can't take a photo right now?" : "Prefer to use your camera?"}</span>
          <button type="button" className="outline" onClick={() => { setMethod(method === "photo" ? "essay" : "photo"); setError(""); }}>
            {method === "photo" ? <><FileText size={15} /> Write an explanation</> : <><Camera size={15} /> Use camera</>}
          </button>
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
            <button type="button" className="primary" disabled={opening} onClick={capture}><Camera size={15} /> Capture photo</button>
          )}
        </div>
        <p className="proof-privacy">Temporary Gemini check · your proof is not saved to your app database · task stays incomplete until approved</p>
      </div>
    </div>
  );
}
