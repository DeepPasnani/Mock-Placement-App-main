import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api, { submissionsAPI, testsAPI, usersAPI } from '../../services/api';
import { Badge, Spinner, Btn, Modal } from '../../components/shared/UI';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 * Admin Results — Live monitoring & leaderboard
 *
 * Designed for the T&P admin watching submissions come in
 * during a live test window. Shows real-time state.
 * ═══════════════════════════════════════════════════════════ */

export default function AdminResults() {
  const { testId } = useParams();
  const qc = useQueryClient();
  const [selectedTest, setSelectedTest] = useState(testId || '');
  const [deleteId, setDeleteId] = useState(null);
  const [emailModal, setEmailModal] = useState(false);
  const [notifyModal, setNotifyModal] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: testsData } = useQuery('tests', testsAPI.list);
  const { data: subData, isLoading } = useQuery(
    ['submissions', selectedTest],
    () => submissionsAPI.getForTest(selectedTest),
    { enabled: !!selectedTest },
  );

  const tests = testsData?.tests || [];
  const allSubs = subData?.submissions || [];
  const test = tests.find(t => t.id === selectedTest);

  // ── Class-wise filter ───────────────────────────────────
  // Uses batch_snapshot (falls back to the student's live batch for
  // pre-existing rows) so filtering stays accurate even after a
  // semester reshuffle moves students between batches.
  const [batchFilter, setBatchFilter] = useState('all');
  const batchOptions = [...new Set(allSubs.map(s => s.batch_display).filter(Boolean))].sort();
  const subs = batchFilter === 'all' ? allSubs : allSubs.filter(s => s.batch_display === batchFilter);

  // Class-wise breakdown (always computed off the full, unfiltered set)
  const classBreakdown = batchOptions.map(b => {
    const rows = allSubs.filter(s => s.batch_display === b && s.status === 'submitted' && s.max_score > 0);
    const avg = rows.length ? Math.round(rows.reduce((a, s) => a + (s.score / s.max_score) * 100, 0) / rows.length) : 0;
    const passed = rows.filter(s => (s.score / s.max_score) * 100 >= 40).length;
    return { batch: b, count: rows.length, avg, passRate: rows.length ? Math.round((passed / rows.length) * 100) : 0 };
  });

  const scored = subs.filter(
    s => s.status === 'submitted' && s.max_score > 0,
  );
  const inProgress = subs.filter(s => s.status === 'in_progress');
  const pendingCount = inProgress.length;

  const avgPct = scored.length
    ? Math.round(
        scored.reduce(
          (a, s) => a + (s.score / s.max_score) * 100,
          0,
        ) / scored.length,
      )
    : 0;
  const passCount = scored.filter(
    s => (s.score / s.max_score) * 100 >= 40,
  ).length;

  // Score distribution buckets
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const dist = buckets.slice(0, -1).map((b, i) => ({
    range: `${b}-${buckets[i + 1]}`,
    count: scored.filter(s => {
      const p = (s.score / s.max_score) * 100;
      return p >= b && p < buckets[i + 1];
    }).length,
    passing: b >= 40,
  }));

  // ── Export CSV ─────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const exportCSV = () => {
    setExporting(true);
    const rows = [
      [
        'Rank',
        'Name',
        'Email',
        'Roll No',
        'Branch',
        'Batch',
        'Score',
        'Max',
        'Percentage',
        'Result',
        'Time Taken',
        'Submitted At',
        'Status',
      ],
    ];
    const ranked = [...subs].sort(
      (a, b) =>
        (b.status === 'submitted' ? 1 : 0) -
        (a.status === 'submitted' ? 1 : 0) ||
        (b.max_score > 0 ? b.score / b.max_score : 0) -
          (a.max_score > 0 ? a.score / a.max_score : 0),
    );
    ranked.forEach((s, i) => {
      const pct = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0;
      rows.push([
        String(i + 1),
        s.user_name,
        s.user_email,
        s.roll_number || '',
        s.branch || '',
        s.batch_display || '',
        String(s.score ?? '—'),
        String(s.max_score ?? '—'),
        `${pct}%`,
        pct >= 40 ? 'Pass' : s.status === 'submitted' ? 'Fail' : '—',
        s.time_taken_seconds
          ? `${Math.floor(s.time_taken_seconds / 60)}m ${s.time_taken_seconds % 60}s`
          : '—',
        s.submitted_at ? format(new Date(s.submitted_at), 'dd/MM/yyyy HH:mm') : '—',
        s.status,
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campus-track_results_${selectedTest}.csv`;
    a.click();
    setExporting(false);
  };

  // ── Export PDF ─────────────────────────────────────────
  const [exportingPdf, setExportingPdf] = useState(false);

  const exportPDF = async () => {
    setExportingPdf(true);
    try {
      const blob = await submissionsAPI.exportPdf(selectedTest);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campus-track_results_${selectedTest}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to generate PDF report.');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Send results email ─────────────────────────────────
  const handleSendResults = async () => {
    if (!selectedTest) return;
    setSending(true);
    try {
      const data = await usersAPI.sendResults({ test_id: selectedTest });
      toast.success(`Results emailed to ${data.sent} student${data.sent !== 1 ? 's' : ''}!`);
      setEmailModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send results.');
    } finally {
      setSending(false);
    }
  };

  // ── Notify test scheduled ──────────────────────────────
  const handleNotifyTest = async () => {
    if (!selectedTest) return;
    setSending(true);
    try {
      const data = await usersAPI.notifyTest({ test_id: selectedTest });
      toast.success(`Notifications sent to ${data.sent} student${data.sent !== 1 ? 's' : ''}!`);
      setNotifyModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send notifications.');
    } finally {
      setSending(false);
    }
  };

  const deleteMut = useMutation(submissionsAPI.delete, {
    onSuccess: () => {
      toast.success('Submission deleted');
      setDeleteId(null);
      qc.invalidateQueries(['submissions', selectedTest]);
    },
    onError: () => toast.error('Failed to delete'),
  });

  // ── Resume test (admin) ───────────────────────────────
  const [resumingId, setResumingId] = useState(null);
  const resumeMut = useMutation(
    (id) => api.post(`/submissions/resume/${id}`).then(r => r.data),
    {
      onSuccess: (data) => {
        toast.success(data.message || 'Test resumed successfully');
        setResumingId(null);
        qc.invalidateQueries(['submissions', selectedTest]);
      },
      onError: (e) => toast.error(e.response?.data?.error || 'Failed to resume test'),
    }
  );

  // ── Ranked + sorted submissions ────────────────────────
  // Sort: submitted first (by score descending), then in-progress
  const rankedSubs = [...subs].sort(
    (a, b) =>
      (b.status === 'submitted' ? 1 : 0) - (a.status === 'submitted' ? 1 : 0) ||
      (b.max_score > 0 ? b.score / b.max_score : 0) -
        (a.max_score > 0 ? a.score / a.max_score : 0),
  );

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="section-title">Results</h1>
          <p className="section-subtitle">
            {selectedTest
              ? `${subs.length} submissions · ${pendingCount} still submitting`
              : 'Select a test to view results'}
          </p>
        </div>
        {selectedTest && subs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Btn variant="ghost" size="sm" onClick={() => setNotifyModal(true)}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Notify
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setEmailModal(true)}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Results
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={exportCSV}
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Spinner size={13} className="text-deck" />
                  <span className="ml-1.5">Exporting…</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  <span className="ml-1.5">Export CSV</span>
                </>
              )}
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={exportPDF}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <>
                  <Spinner size={13} className="text-deck" />
                  <span className="ml-1.5">Generating…</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="ml-1.5">Export PDF</span>
                </>
              )}
            </Btn>
          </div>
        )}
      </div>

      {/* Test selector */}
      <div className="panel p-3 mb-5 flex flex-wrap gap-4">
        <div>
          <label className="text-2xs text-annotation/60 mb-1.5">
            Select Test
          </label>
          <select
            value={selectedTest}
            onChange={e => { setSelectedTest(e.target.value); setBatchFilter('all'); }}
            className="select-field max-w-sm"
          >
            <option value="">— Select a test —</option>
            {tests.map(t => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.submission_count || 0} submissions)
              </option>
            ))}
          </select>
        </div>
        {selectedTest && batchOptions.length > 0 && (
          <div>
            <label className="text-2xs text-annotation/60 mb-1.5">
              Class / Batch
            </label>
            <select
              value={batchFilter}
              onChange={e => setBatchFilter(e.target.value)}
              className="select-field max-w-xs"
            >
              <option value="all">All batches (consolidated)</option>
              {batchOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Empty / unselected */}
      {!selectedTest && (
        <div className="empty-state">
          <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="empty-state-title">Select a test</p>
          <p className="empty-state-desc">Choose a test from the dropdown above to view results, score distribution, and student leaderboard.</p>
        </div>
      )}

      {selectedTest && isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-accent" />
        </div>
      )}

      {selectedTest && !isLoading && (
        <>
          {/* ── Summary cards ──────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <SummaryCard label="Total" value={subs.length} accent="clarify" />
            <SummaryCard label="Average" value={`${avgPct}%`} accent="accent" />
            <SummaryCard label="Passed" value={passCount} accent="verify" />
            <SummaryCard
              label="Pass Rate"
              value={
                scored.length
                  ? `${Math.round((passCount / scored.length) * 100)}%`
                  : '—'
              }
              accent="alert"
            />
          </div>

          {/* ── Live indicator + pending count ─────────────── */}
          {pendingCount > 0 && (
            <div className="panel-muted p-3 mb-5 flex items-center gap-3 border-accent/30">
              <span className="live-dot" />
              <span className="text-sm font-semibold text-accent">
                {pendingCount} candidate{pendingCount !== 1 ? 's' : ''} still submitting
              </span>
              <span className="text-xs text-annotation/60">
                — results update automatically
              </span>
            </div>
          )}

          {/* ── Score Distribution ─────────────────────────── */}
          {scored.length > 0 && (
            <div className="panel p-4 mb-5">
              <h3 className="text-xs font-display font-bold text-ink mb-3">
                Score Distribution
              </h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={dist} margin={{ top: 0, right: 0, bottom: 0, left: -16 }}>
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#8A8066' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#8A8066' }} allowDecimals={false} />
                  <Tooltip
                    formatter={v => [`${v} students`]}
                    contentStyle={{
                      background: '#FBF9F2',
                      border: '1px solid #DFD4B8',
                      borderRadius: '8px',
                      color: '#2A2419',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {dist.map((d, i) => (
                      <Cell key={i} fill={d.passing ? '#4B7B3F' : '#AE4331'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-2 text-2xs text-annotation/60">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-verify rounded-sm inline-block" />
                  Pass (≥40%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-alert rounded-sm inline-block" />
                  Fail ({ "<" }40%)
                </span>
              </div>
            </div>
          )}

          {/* ── Class-wise Breakdown ───────────────────────── */}
          {batchFilter === 'all' && classBreakdown.length > 1 && (
            <div className="panel p-4 mb-5">
              <h3 className="text-xs font-display font-bold text-ink mb-3">
                Class-wise Breakdown
              </h3>
              <div className="table-wrap">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Batch</th>
                        <th>Submitted</th>
                        <th>Average</th>
                        <th>Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classBreakdown.map(c => (
                        <tr key={c.batch} className="cursor-pointer hover:bg-panel/60" onClick={() => setBatchFilter(c.batch)}>
                          <td className="font-medium text-sm text-ink">{c.batch}</td>
                          <td>{c.count}</td>
                          <td className="font-mono">{c.avg}%</td>
                          <td className="font-mono">{c.passRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-2xs text-annotation/50 mt-2">Click a row to filter the leaderboard below to that batch.</p>
            </div>
          )}

          {/* ── Leaderboard Table ──────────────────────────── */}
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Student</th>
                    <th className="hidden sm:table-cell">Roll / Branch</th>
                    <th>Score</th>
                    <th>%</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Time</th>
                    <th className="hidden lg:table-cell">Submitted</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rankedSubs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-8 h-8 text-annotation/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <p className="text-sm text-annotation font-medium">No submissions yet</p>
                          <p className="text-xs text-annotation/60 max-w-xs">
                            Make sure the test is published and students are enrolled. You can notify students from this page once submissions start coming in.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rankedSubs.map((s, i) => {
                      const pct =
                        s.max_score > 0
                          ? Math.round((s.score / s.max_score) * 100)
                          : 0;
                      const isPending = s.status === 'in_progress';
                      const isPassed = pct >= 40;

                      return (
                        <tr key={s.id} className={isPending ? 'opacity-60' : ''}>
                          <td>
                            <span className="rank-num text-annotation/60">
                              {isPending ? '—' : i + 1}
                            </span>
                          </td>
                          <td>
                            <div className="font-medium text-sm text-ink">
                              {s.user_name}
                            </div>
                            <div className="text-xs text-annotation/60">
                              {s.user_email}
                            </div>
                          </td>
                          <td className="hidden sm:table-cell">
                            <span className="text-xs text-annotation/70">
                              {s.roll_number || '—'}
                              {s.branch ? ` · ${s.branch}` : ''}
                            </span>
                          </td>
                          <td>
                            <span className="font-mono font-bold text-sm text-ink score-digit">
                              {isPending ? '—' : `${s.score}/${s.max_score}`}
                            </span>
                          </td>
                          <td>
                            {isPending ? (
                              <span className="text-xs text-annotation/50 font-mono">—</span>
                            ) : (
                              <span
                                className={`font-mono font-bold text-sm score-digit ${
                                  isPassed ? 'text-verify' : 'text-alert'
                                }`}
                              >
                                {pct}%
                              </span>
                            )}
                          </td>
                          <td>
                            {isPending ? (
                              <span className="badge-accent text-2xs">In Progress</span>
                            ) : (
                              <Badge color={isPassed ? 'green' : 'red'}>
                                {isPassed ? 'Passed' : 'Failed'}
                              </Badge>
                            )}
                          </td>
                          <td className="hidden md:table-cell">
                            <span className="text-xs text-annotation/60 font-mono">
                              {s.time_taken_seconds
                                ? `${Math.floor(s.time_taken_seconds / 60)}m ${
                                    s.time_taken_seconds % 60
                                  }s`
                                : '—'}
                            </span>
                          </td>
                          <td className="hidden lg:table-cell">
                            <span className="text-xs text-annotation/60 font-mono">
                              {s.submitted_at
                                ? format(
                                    new Date(s.submitted_at),
                                    'dd MMM, HH:mm',
                                  )
                                : '—'}
                            </span>
                          </td>
                          <td>
                            <div className="flex gap-0.5 justify-end">
                              {s.status === 'auto_submitted' && (
                                <button
                                  onClick={() => setResumingId(s.id)}
                                  disabled={resumeMut.isLoading && resumingId === s.id}
                                  className="btn-ghost-icon text-accent hover:text-clarify"
                                  title="Resume test for student"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </button>
                              )}
                              {!isPending && (
                                <button
                                  onClick={() => setDeleteId(s.id)}
                                  className="btn-ghost-icon text-annotation hover:text-alert"
                                  title="Delete submission"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Email Results Modal ───────────────────────────── */}
      <Modal
        isOpen={emailModal}
        onClose={() => setEmailModal(false)}
        title="Email Results"
        width="max-w-sm"
      >
        <p className="text-sm text-annotation mb-3">
          Send each student who submitted <strong className="text-ink">{test?.title}</strong> an email with
          their score and result.
        </p>
        <p className="text-xs text-annotation/60 mb-5">
          {scored.length} student{scored.length !== 1 ? 's' : ''} will receive this email.
        </p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setEmailModal(false)} disabled={sending}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleSendResults} disabled={sending}>
            {sending ? (
              <><Spinner size={14} className="text-deck" /> Sending…</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send Results
              </>
            )}
          </Btn>
        </div>
      </Modal>

      {/* ── Notify Modal ──────────────────────────────────── */}
      <Modal
        isOpen={notifyModal}
        onClose={() => setNotifyModal(false)}
        title="Notify Students"
        width="max-w-sm"
      >
        <p className="text-sm text-annotation mb-2">
          Email all eligible students about <strong className="text-ink">{test?.title}</strong>.
        </p>
        <AlertBox type="warning" className="mb-5">
          Students will receive the email immediately. Use once.
        </AlertBox>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setNotifyModal(false)} disabled={sending}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleNotifyTest} disabled={sending}>
            {sending ? (
              <><Spinner size={14} className="text-deck" /> Sending…</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Notify Now
              </>
            )}
          </Btn>
        </div>
      </Modal>

      {/* ── Resume Test Modal ────────────────────────────── */}
      <Modal
        isOpen={!!resumingId}
        onClose={() => setResumingId(null)}
        title="Resume Test"
        width="max-w-sm"
      >
        <p className="text-sm text-annotation mb-2">
          Resume this student's <strong className="text-ink">auto-submitted</strong> test.
        </p>
        <p className="text-xs text-annotation/60 mb-5">
          The student will regain access with their remaining time preserved. All saved answers will be retained.
        </p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setResumingId(null)}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              resumeMut.mutate(resumingId);
              setResumingId(null);
            }}
            disabled={resumeMut.isLoading}
          >
            {resumeMut.isLoading ? 'Resuming…' : 'Resume Test'}
          </Btn>
        </div>
      </Modal>

      {/* ── Delete Modal ──────────────────────────────────── */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Submission?"
        width="max-w-sm"
      >
        <p className="text-sm text-annotation mb-4">
          This will permanently remove this test attempt. Cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setDeleteId(null)}>
            Cancel
          </Btn>
          <Btn
            variant="danger"
            onClick={() => deleteMut.mutate(deleteId)}
            disabled={deleteMut.isLoading}
          >
            {deleteMut.isLoading ? 'Deleting…' : 'Delete'}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

/* ── Summary Card ─────────────────────────────────────────── */
function SummaryCard({ label, value, accent = 'clarify' }) {
  const accentColors = {
    clarify: 'text-clarify',
    accent: 'text-accent',
    verify: 'text-verify',
    alert: 'text-alert',
  };
  return (
    <div className="panel p-3 text-center">
      <div className="text-2xs text-annotation/60 mb-0.5">
        {label}
      </div>
      <div
        className={`text-lg font-display font-bold score-digit ${
          accentColors[accent] || 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Local Alert (not importing Alert to avoid circular UI issue with the new design) ── */
function AlertBox({ type = 'info', children, className = '' }) {
  const map = {
    info:    'bg-clarify/10 border-clarify/20 text-clarify',
    accent:  'bg-accent/10 border-accent/20 text-accent',
    success: 'bg-verify/10 border-verify/20 text-verify',
    error:   'bg-alert/10 border-alert/20 text-alert',
  };
  return (
    <div
      className={`flex items-start gap-2 text-sm px-3.5 py-2.5 rounded-lg border ${map[type] || map.info} ${className}`}
    >
      <span>{children}</span>
    </div>
  );
}