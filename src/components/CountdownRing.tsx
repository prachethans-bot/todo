import React, { useState, useEffect } from "react";

interface CountdownRingProps {
  reminderAt: string | null;
  createdAt?: string;
  size?: "small" | "big";
}

function formatRemainingTime(ms: number): { text: string; sub?: string } {
  if (ms <= 0) {
    return { text: "Still here when you're ready", sub: "" };
  }
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    return { text: `${hrs}h ${mins}m`, sub: "left" };
  }
  if (mins > 0) {
    return { text: `${mins}m ${secs}s`, sub: "left" };
  }
  return { text: `${secs}s`, sub: "left" };
}

export function CountdownRing({ reminderAt, createdAt, size = "small" }: CountdownRingProps) {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!reminderAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [reminderAt]);

  if (!reminderAt) return null;

  const target = new Date(reminderAt).getTime();
  const remainingMs = target - now;
  const isPassed = remainingMs <= 0;

  // Calculate shrinking fraction
  const created = createdAt ? new Date(createdAt).getTime() : target - 3600 * 1000;
  const totalDuration = Math.max(target - created, 60 * 1000);
  const fraction = isPassed ? 0 : Math.max(0, Math.min(1, remainingMs / totalDuration));

  const isBig = size === "big";
  const diameter = isBig ? 112 : 30;
  const strokeWidth = isBig ? 6 : 2.5;
  const radius = (diameter - strokeWidth) / 2;
  const center = diameter / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isPassed ? circumference : circumference * (1 - fraction);

  const { text, sub } = formatRemainingTime(remainingMs);

  if (isBig) {
    return (
      <div className="countdown-ring-big-container">
        <div className="countdown-svg-wrap" style={{ width: diameter, height: diameter }}>
          <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
            {/* Background track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#272e28"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Foreground shrinking ring */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke={isPassed ? "#a7ef7966" : "var(--green)"}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          <div className="countdown-big-content">
            {isPassed ? (
              <span className="missed-gentle-msg">Still here when you're ready</span>
            ) : (
              <>
                <span className="countdown-big-number">{text}</span>
                {sub && <small className="countdown-big-sub">{sub}</small>}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Small list row countdown ring
  return (
    <div className={`countdown-ring-small-row ${isPassed ? "is-passed" : ""}`}>
      <div className="countdown-svg-wrap" style={{ width: diameter, height: diameter }}>
        <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#272e28"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={isPassed ? "#a7ef7966" : "var(--green)"}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
      </div>
      <span className="countdown-small-label">
        {isPassed ? "Still here when you're ready" : `${text} ${sub}`.trim()}
      </span>
    </div>
  );
}
