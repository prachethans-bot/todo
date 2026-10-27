import React, { useState, useEffect, useRef } from "react";

interface ClockPickerProps {
  isOpen: boolean;
  initialTime?: string | null; // "HH:mm" in 24h
  onSet: (time24: string) => void;
  onCancel: () => void;
}

export function ClockPicker({ isOpen, initialTime, onSet, onCancel }: ClockPickerProps) {
  const [step, setStep] = useState<"hour" | "minute">("hour");
  const [hour12, setHour12] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dialRef = useRef<HTMLDivElement>(null);

  // Initialize from initialTime or default to upcoming hour
  useEffect(() => {
    if (!isOpen) return;
    setStep("hour");
    if (initialTime && initialTime.includes(":")) {
      const [hStr, mStr] = initialTime.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const p: "AM" | "PM" = h >= 12 ? "PM" : "AM";
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      setHour12(h12);
      setMinute(Number.isFinite(m) ? m : 0);
      setPeriod(p);
    } else {
      const nextHour = new Date(Date.now() + 60 * 60 * 1000);
      const h = nextHour.getHours();
      const p: "AM" | "PM" = h >= 12 ? "PM" : "AM";
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      setHour12(h12);
      setMinute(0);
      setPeriod(p);
    }
  }, [isOpen, initialTime]);

  if (!isOpen) return null;

  const handlePointerMath = (clientX: number, clientY: number, commitStep = false) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    // Angle from 12 o'clock in degrees
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    if (step === "hour") {
      let h = Math.round(deg / 30);
      if (h === 0 || h === 12) h = 12;
      setHour12(h);
      if (commitStep) {
        setStep("minute");
      }
    } else {
      const m = Math.round(deg / 6) % 60;
      setMinute(m);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    handlePointerMath(e.clientX, e.clientY, false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    handlePointerMath(e.clientX, e.clientY, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    handlePointerMath(e.clientX, e.clientY, true);
  };

  const handleSet = () => {
    let h24 = hour12 % 12;
    if (period === "PM") h24 += 12;
    const hh = String(h24).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    onSet(`${hh}:${mm}`);
  };

  // Dimensions for 260px dial
  const dialRadius = 96;
  const cx = 130;
  const cy = 130;

  // Selected angle for hand
  const currentAngleDeg =
    step === "hour"
      ? (hour12 % 12) * 30
      : minute * 6;
  const angleRad = ((currentAngleDeg - 90) * Math.PI) / 180;
  const handEndX = cx + dialRadius * Math.cos(angleRad);
  const handEndY = cy + dialRadius * Math.sin(angleRad);

  return (
    <div className="sheet-backdrop" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Clock picker">
      <div className="sheet-content" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-drag-handle" />

        {/* Big digital time shown in the center */}
        <div className="clock-digital-center">
          <div className="digital-time-display">
            <button
              type="button"
              className={`time-digit-btn ${step === "hour" ? "selected" : ""}`}
              onClick={() => setStep("hour")}
              aria-label={`Select hour: currently ${hour12}`}
            >
              {String(hour12).padStart(2, "0")}
            </button>
            <span className="time-colon">:</span>
            <button
              type="button"
              className={`time-digit-btn ${step === "minute" ? "selected" : ""}`}
              onClick={() => setStep("minute")}
              aria-label={`Select minute: currently ${minute}`}
            >
              {String(minute).padStart(2, "0")}
            </button>
            <span className="digital-period-label">{period}</span>
          </div>
          <span className="step-prompt-text">
            {step === "hour" ? "Step 1: Pick the hour" : "Step 2: Pick the minutes"}
          </span>
        </div>

        {/* Circular Dial */}
        <div
          ref={dialRef}
          className="clock-dial-container"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* SVG Hand and pivot */}
          <svg className="clock-dial-svg" viewBox="0 0 260 260">
            {/* Center pivot */}
            <circle cx={cx} cy={cy} r="4" fill="#a7ef79" />
            {/* Hand line */}
            <line
              x1={cx}
              y1={cy}
              x2={handEndX}
              y2={handEndY}
              stroke="#a7ef79"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Hand head selection circle */}
            <circle cx={handEndX} cy={handEndY} r="18" fill="#a7ef79" />
          </svg>

          {/* Numbers positioned in a circle with at least 56px tap targets */}
          {step === "hour"
            ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                const deg = (h % 12) * 30 - 90;
                const rad = (deg * Math.PI) / 180;
                const x = cx + dialRadius * Math.cos(rad);
                const y = cy + dialRadius * Math.sin(rad);
                const isSelected = hour12 === h;

                return (
                  <button
                    type="button"
                    key={`hour-${h}`}
                    className={`clock-dial-node ${isSelected ? "selected" : ""}`}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHour12(h);
                      setStep("minute");
                    }}
                    aria-label={`Hour ${h}`}
                  >
                    <span className="node-text">{h}</span>
                  </button>
                );
              })
            : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                const deg = m * 6 - 90;
                const rad = (deg * Math.PI) / 180;
                const x = cx + dialRadius * Math.cos(rad);
                const y = cy + dialRadius * Math.sin(rad);
                const isSelected = minute === m;

                return (
                  <button
                    type="button"
                    key={`minute-${m}`}
                    className={`clock-dial-node ${isSelected ? "selected" : ""}`}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMinute(m);
                    }}
                    aria-label={`${m} minutes`}
                  >
                    <span className="node-text">{String(m).padStart(2, "0")}</span>
                  </button>
                );
              })}
        </div>

        {/* AM/PM toggle below the dial */}
        <div className="ampm-toggle">
          <button
            type="button"
            className={`ampm-btn ${period === "AM" ? "selected" : ""}`}
            onClick={() => setPeriod("AM")}
          >
            AM
          </button>
          <button
            type="button"
            className={`ampm-btn ${period === "PM" ? "selected" : ""}`}
            onClick={() => setPeriod("PM")}
          >
            PM
          </button>
        </div>

        {/* Buttons: Set (lime) and Cancel */}
        <div className="sheet-buttons">
          <button type="button" className="outline sheet-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary sheet-set" onClick={handleSet}>
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
