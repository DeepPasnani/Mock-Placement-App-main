import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { submissionsAPI } from '../../services/api';
import { Badge, ProgressBar, Spinner, Alert, Btn } from '../../components/shared/UI';
import CodePlayback from '../../components/shared/CodePlayback';
import CodeQualityCard from '../../components/shared/CodeQualityCard';
import { format } from 'date-fns';

/* ═══════════════════════════════════════════════════════════
 * Student Result Detail — Full score breakdown
 * ═══════════════════════════════════════════════════════════ */

export default function ResultDetail() {
  const { submissionId } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => submissionsAPI.get(submissionId),
  });

  // Hooks must run unconditionally on every render (Rules of Hooks) —
  // these were previously declared after the early returns below, which
  // meant React saw a different number of hooks between the loading
  // render and the loaded render and crashed with:
  // "Minified React error #310: Rendered more hooks than during the
  // previous render." Keeping all hooks above any conditional return
  // fixes that crash.
  const [showPlayback, setShowPlayback] = useState(false);
  const [showQuality, setShowQuality] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-annotation text-sm">
        Submission not found.
      </div>
    );
  }

  const sub = data.submission;
  const pct =
    sub.max_score > 0
      ? Math.round((sub.score / sub.max_score) * 100)
      : 0;
  const passed = pct >= (sub.test_settings?.passingScore || 40);
  const showDetails = sub.test_settings?.showResults === 'after_submit';
  const codeResults = sub.code_results || {};
  const m = sub.time_taken_seconds
    ? Math.floor(sub.time_taken_seconds / 60)
    : null;
  const s = sub.time_taken_seconds
    ? sub.time_taken_seconds % 60
    : null;
  const passingScore = sub.test_settings?.passingScore || 40;

  return (
    <div className="animate-fade-up">
      {/* Back link */}
      <Link
        to="/student/results"
        className="inline-flex items-center gap-1.5 text-sm text-annotation hover:text-clarify mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Results
      </Link>

      {/* ── Hero Score Card ──────────────────────────────── */}
      <div
        className={`panel overflow-hidden mb-5 ${
          passed ? 'border-verify/30' : 'border-alert/30'
        }`}
      >
        {/* Top section: score + title */}
        <div className="p-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold text-ink">
                {sub.test_title}
              </h1>
              <p className="text-xs text-annotation/60 mt-0.5">
                {sub.submitted_at
                  ? format(new Date(sub.submitted_at), 'dd MMM yyyy, HH:mm')
                  : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div
                className={`text-3xl font-display font-bold score-digit ${
                  passed ? 'text-verify' : 'text-alert'
                }`}
              >
                {pct}%
              </div>
              <div className="text-xs text-annotation/60 font-mono">
                {sub.score}/{sub.max_score} marks
              </div>
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4">
            <div>
              <div className="text-2xs text-annotation/50 font-mono uppercase tracking-wider">Result</div>
              <div className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                <Badge color={passed ? 'green' : 'red'}>
                  {passed ? 'Passed' : 'Failed'}
                </Badge>
                {sub.status === 'auto_submitted' && (
                  <span className="badge-accent text-2xs">Auto-submitted</span>
                )}
              </div>
            </div>
            {m !== null && (
              <div>
                <div className="text-2xs text-annotation/50 font-mono uppercase tracking-wider">Time Taken</div>
                <div className="text-sm font-semibold mt-0.5 font-mono score-digit">
                  {m}m {s}s
                </div>
              </div>
            )}
            <div>
              <div className="text-2xs text-annotation/50 font-mono uppercase tracking-wider">Passing Score</div>
              <div className="text-sm font-semibold mt-0.5 font-mono score-digit">
                {passingScore}%
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <ProgressBar
              value={sub.score}
              max={sub.max_score}
              color={passed ? 'bg-verify' : 'bg-alert'}
            />
          </div>
        </div>
      </div>

      {/* ── Coding Results ───────────────────────────────── */}
      {Object.keys(codeResults).length > 0 && showDetails && (
        <div className="panel p-5 mb-5">
          <h2 className="text-sm font-display font-bold text-ink mb-4">
            Coding Results
          </h2>
          <div className="space-y-3">
            {Object.entries(codeResults).map(([pid, r]) => (
              <div key={pid} className="panel-muted overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-panel">
                  <span className="text-sm font-medium text-ink truncate">
                    Problem {pid.slice(0, 8)}…
                  </span>
                  <span className="text-sm font-bold text-verify font-mono score-digit">
                    {r.earned || 0} marks
                  </span>
                </div>
                {r.results && (
                  <div className="divide-y divide-rim/30">
                    {r.results
                      .filter(tc => !tc.hidden)
                      .map((tc, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                          {tc.passed ? (
                            <svg className="w-4 h-4 text-verify mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-alert mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-ink mb-1">
                              Test Case {i + 1} — {tc.status}
                            </div>
                            {!tc.passed && tc.actual !== undefined && (
                              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                <div>
                                  <span className="text-annotation/50">Expected: </span>
                                  <span className="text-verify">{tc.expected}</span>
                                </div>
                                <div>
                                  <span className="text-annotation/50">Got: </span>
                                  <span className="text-alert">{tc.actual || '(empty)'}</span>
                                </div>
                              </div>
                            )}
                            {tc.time && (
                              <div className="text-xs text-annotation/40 mt-0.5 font-mono">
                                {tc.time}s
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {r.error && (
                  <div className="px-4 py-2 text-xs text-alert font-mono">{r.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results not available yet ─────────────────────── */}
      {!showDetails && (
        <Alert type="info">
          Your detailed answer breakdown will be available once your placement coordinator publishes the results.
        </Alert>
      )}
    </div>
  );
}
