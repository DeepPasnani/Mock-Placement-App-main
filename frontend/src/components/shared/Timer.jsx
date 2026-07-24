import { useState, useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════
 * Timer — CampusTrack Signature Element
 *
 * Three visual phases:
 *   Calm   (>40% remaining) — neutral white digits on dark
 *   Warning (20–40%)        — amber digits, subtle border
 *   Urgent (<20%)           — red digits, pulsing border
 *
 * A thin progress rail beneath the digits shows remaining
 * time at a glance. At 0, the parent's onExpire fires.
 * ═══════════════════════════════════════════════════════════ */

export default function Timer({ totalSeconds, onExpire, onTick, testId, token }) {
  const [secs, setSecs] = useState(totalSeconds);
  const wsRef = useRef(null);
  const pct = totalSeconds > 0 ? (secs / totalSeconds) * 100 : 0;

  // Report the current remaining seconds up to the parent (used to drive
  // phase-based logic like independent MCQ/coding round time limits).
  useEffect(() => { onTick?.(secs); }, [secs, onTick]);

  // WebSocket heartbeat to server (keeps session alive)
  useEffect(() => {
    if (!testId || !token) return;
    const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws'}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'HEARTBEAT', testId }));
        }
      }, 30000);
      ws._interval = interval;
    };

    ws.onclose = () => clearInterval(ws._interval);
    return () => { clearInterval(ws._interval); ws.close(); };
  }, [testId, token]);

  // Countdown
  useEffect(() => {
    if (secs <= 0) {
      onExpire?.();
      return;
    }
    const t = setInterval(() => setSecs(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [secs, onExpire]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  const display = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const phaseClass =
    pct < 20 ? 'timer-box--urgent' :
    pct < 40 ? 'timer-box--warning' :
    'timer-box--calm';

  return (
    <div className={`timer-box ${phaseClass} relative overflow-hidden`} role="timer" aria-live="polite" aria-label={`Time remaining: ${display}`}>
      {/* Clock icon — hidden on very small screens */}
      <svg className="w-4 h-4 hidden sm:block shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>

      {/* The digits — monospace, tabular-nums, zero-tracking */}
      <span className="tracking-tight">
        {display}
      </span>

      {/* Thin progress rail at the bottom */}
      <span
        className="timer-rail"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
