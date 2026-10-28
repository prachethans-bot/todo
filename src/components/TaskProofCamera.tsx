import { useState } from "react";
import { FileText, X, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

type Props = {
  taskTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TaskProofCamera({ taskTitle, onCancel, onConfirm }: Props) {
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [essay, setEssay] = useState("");
  const essayWords = essay.trim() ? essay.trim().split(/\\s+/).length : 0;

  async function confirm() {
    if (verifying) return;
    if (!essay.trim() || essayWords > 150) {
      setError(essayWords > 150
        ? "Keep your explanation within 150 words."
        : "Write a short explanation of how you will begin this task.");
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

      const { data, error: verifyError } = await supabase.functions.invoke("verify-task-start", {
        body: { taskTitle, essayText: essay.trim() },
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (verifyError) throw verifyError;
      if (data?.approved !== true) {
        setError(typeof data?.reason === "string"
          ? data.reason
          : "That explanation does not clearly match this task. Please try again.");
        return;
      }
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
    <div className="proof-overlay" role="dialog" aria-modal="true" aria-label="Start task check">
      <div className="proof-card">
        <div className="proof-head">
          <span className="proof-icon"><FileText size={18} /></span>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close task check"><X size={18} /></button>
        </div>
        <p className="eyebrow">START TASK CHECK</p>
        <h3>Explain how you'll begin</h3>
        <p className="proof-task">{taskTitle}</p>
        <p className="proof-description">
          Describe the first steps you'll take to start this task. Gemini checks whether your explanation is genuinely related to the task.
        </p>

        <div className="proof-essay">
          <label htmlFor="task-start-essay">YOUR PLAN (MAX 150 WORDS)</label>
          <textarea
            id="task-start-essay"
            value={essay}
            onChange={(event) => setEssay(event.target.value)}
            placeholder={`Explain the first steps you will take for “${taskTitle}”…`}
            rows={5}
            maxLength={3000}
            aria-describedby="essay-word-count"
          />
          <div className={`proof-word-count ${essayWords > 150 ? "over-limit" : ""}`} id="essay-word-count">
            {essayWords}/150 words
          </div>
        </div>

        {error && <p className="proof-error" role="alert">{error}</p>}

        <div className="plan-controls proof-controls">
          <button type="button" className="outline" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary"
            onClick={() => void confirm()}
            disabled={verifying || !essay.trim() || essayWords > 150}
          >
            <ShieldCheck size={15} /> {verifying ? "Checking explanation…" : "Verify & start"}
          </button>
        </div>
        <p className="proof-privacy">
          AI checks your explanation · proof is not saved to your app database · task stays incomplete until approved
        </p>
      </div>
    </div>
  );
}
