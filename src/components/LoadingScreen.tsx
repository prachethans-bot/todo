import { useEffect, useState } from "react";

interface LoadingScreenProps {
  onFinish: () => void;
  durationMs?: number;
}

export function LoadingScreen({ onFinish, durationMs = 2200 }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // If test URL has skipLoading, finish immediately
    if (typeof window !== "undefined" && window.location.search.includes("skipLoading=true")) {
      onFinish();
      return;
    }

    const start = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setProgress(pct);

      if (elapsed >= durationMs) {
        window.clearInterval(interval);
        setFading(true);
        window.setTimeout(() => {
          onFinish();
        }, 300);
      }
    }, 25);

    return () => window.clearInterval(interval);
  }, [durationMs, onFinish]);

  return (
    <div className={`vinai-loading-screen ${fading ? "fading-out" : ""}`} role="status" aria-live="polite">
      <div className="vinai-loading-ambient-glow" />

      {/* Top Header */}
      <header className="vinai-loading-header">
        <div className="vinai-loading-brand">
          <span className="vinai-loading-logo-pill">வினை</span>
          <span className="vinai-loading-title">VINAI</span>
        </div>
        <div className="vinai-loading-status-badge">
          <span className="vinai-loading-dot" />
          <span>INITIALIZING</span>
        </div>
      </header>

      {/* Centerpiece */}
      <main className="vinai-loading-center">
        <div className="vinai-loading-art-wrap">
          <div className="vinai-loading-halo" />
          <img
            src="/vinai_launcher.png"
            alt="Vinai Logo"
            className="vinai-loading-symbol"
          />
        </div>

        <h1 className="vinai-loading-wordmark">VINAI</h1>
        <p className="vinai-loading-subtext">A calmer way to get moving. One tiny step at a time.</p>

        {/* Progress block matching Figma node 3:570 */}
        <div className="vinai-loading-progress-box">
          <span className="vinai-loading-stage-label">PREPARING YOUR RUNWAY</span>
          <div className="vinai-loading-bar-track">
            <div
              className="vinai-loading-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="vinai-loading-info-row">
            <span className="vinai-loading-hint">Loading your focus runway...</span>
            <span className="vinai-loading-pct">{progress}%</span>
          </div>
        </div>
      </main>

      {/* Footer matching Figma node 3:578 */}
      <footer className="vinai-loading-footer">
        <span className="vinai-loading-footer-brand">VINAI TASK INTELLIGENCE</span>
        <div className="vinai-loading-system-ready">
          <span className="vinai-loading-dot pulse" />
          <span>SYSTEM ONLINE</span>
        </div>
      </footer>
    </div>
  );
}
