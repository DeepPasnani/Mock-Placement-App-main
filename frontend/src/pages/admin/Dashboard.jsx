/* ═══════════════════════════════════════════════════════════
 * Admin Dashboard — Operational overview with performance analytics
 *
 * Genre-wise MCQ accuracy, difficulty breakdown, coding performance.
 * Designed as a decision-making tool for T&P faculty.
 * ═══════════════════════════════════════════════════════════ */

import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { usersAPI, testsAPI } from '../../services/api';
import { Badge, Spinner } from '../../components/shared/UI';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

const GENRE_ORDER = [
  'quantitative',
  'aptitude',
  'technical',
  'verbal',
  'logical',
  'data_interpretation',
  'general',
];

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery(
    'admin-stats',
    usersAPI.stats,
    { refetchInterval: 60000 },
  );
  const { data: testsData } = useQuery('tests', testsAPI.list);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  const s = stats || {};
  const recentTests = testsData?.tests?.slice(0, 5) || [];

  const genreData = (s.genreStats || []).map(g => ({
    name: g.genre.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    accuracy: Math.round((g.accuracy || 0) * 100),
    total: parseInt(g.total_questions) || 0,
    genre: g.genre,
  }));

  const diffData = (s.diffStats || []).map(d => ({
    name: d.difficulty.charAt(0).toUpperCase() + d.difficulty.slice(1),
    accuracy: Math.round((d.accuracy || 0) * 100),
    total: parseInt(d.total_questions) || 0,
    difficulty: d.difficulty,
  }));

  const codingData = (s.codingStats || []).map(c => ({
    name: c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1),
    score: Math.round((c.avg_score_rate || 0) * 100),
    difficulty: c.difficulty,
  }));

  const testsBreakdown = {
    total: s.tests ? Object.values(s.tests).reduce((a, b) => a + b, 0) : 0,
    published: s.tests?.published || 0,
  };

  return (
    <div className="animate-fade-up space-y-5">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="text-display">Dashboard</h1>
          <p className="section-subtitle">Placement platform overview</p>
        </div>
        <Link to="/admin/tests/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Test
        </Link>
      </div>

      {/* Stat cards (neutral, one accent max) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="Tests" value={testsBreakdown.total} sub={`${testsBreakdown.published} published`} highlight />
        <StatBox label="Students" value={s.students || 0} sub="registered" />
        <StatBox label="Active (7d)" value={s.active_this_week || 0} sub="recent logins" />
        <StatBox label="Avg Score" value={`${s.recentSubmissions?.length ? Math.round(s.recentSubmissions.reduce((a, s) => a + (s.max_score > 0 ? (s.score/s.max_score)*100 : 0), 0) / s.recentSubmissions.length) : 0}%`} sub="recent tests" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Genre-wise MCQ Accuracy */}
        <div className="panel p-4">
          <h3 className="text-label text-annotation mb-3">Genre-wise MCQ Accuracy</h3>
          {genreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={genreData} margin={{ top: 0, right: 0, bottom: 0, left: -16 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Accuracy']}
                  contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', color: 'var(--ct-ink)', fontSize: '12px' }}
                />
                <Bar dataKey="accuracy" radius={[3, 3, 0, 0]} fill="var(--ct-accent)" >
                  {genreData.map((g, i) => (
                    <Cell key={i} fill="var(--ct-accent)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-annotation text-xs">
              No MCQ submissions yet. Genre insights appear once students complete tests.
            </div>
          )}
        </div>

        {/* Difficulty-wise Performance */}
        <div className="panel p-4">
          <h3 className="text-label text-annotation mb-3">Difficulty-wise Performance</h3>
          {diffData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={diffData} margin={{ top: 0, right: 0, bottom: 0, left: -16 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Accuracy']}
                  contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', color: 'var(--ct-ink)', fontSize: '12px' }}
                />
                <Bar dataKey="accuracy" radius={[3, 3, 0, 0]} fill="var(--ct-verify)" >
                  {diffData.map((d, i) => (
                    <Cell key={i} fill="var(--ct-verify)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-annotation text-xs">
              No data yet. Performance breakdown appears after submissions.
            </div>
          )}
        </div>
      </div>

      {/* Coding Performance */}
      {codingData.length > 0 && (
        <div className="panel p-4">
          <h3 className="text-label text-annotation mb-3">Coding Problem Performance (avg score rate)</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={codingData} margin={{ top: 0, right: 0, bottom: 0, left: -16 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} tickFormatter={v => `${v}%`} />
              <Tooltip
                formatter={(v) => [`${v}%`, 'Avg Score Rate']}
                contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', color: 'var(--ct-ink)', fontSize: '12px' }}
              />
              <Bar dataKey="score" radius={[3, 3, 0, 0]} fill="var(--ct-clarify)" >
                {codingData.map((c, i) => (
                  <Cell key={i} fill="var(--ct-clarify)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column layout: recent tests + submissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Tests */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-title text-ink">Recent Tests</h3>
            <Link to="/admin/tests" className="text-xs text-clarify hover:underline font-medium">View all</Link>
          </div>
          {recentTests.length === 0 ? (
            <div className="text-center py-8 text-annotation text-xs">
              <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="mb-2">No tests yet.</p>
              <Link to="/admin/tests/new" className="text-clarify hover:underline">Create one →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTests.map(t => (
                <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-rim/30 last:border-0">
                  <div className="min-w-0 mr-2">
                    <Link to={`/admin/tests/${t.id}/edit`} className="text-sm font-medium text-ink hover:text-accent truncate block transition-colors">
                      {t.title}
                    </Link>
                    <span className="text-2xs text-annotation/60 font-mono">{t.duration_minutes} min · {t.section_count || 0} sections</span>
                  </div>
                  <Badge color={t.status === 'published' ? 'green' : t.status === 'archived' ? 'gray' : 'yellow'}>
                    {t.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Submissions */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-title text-ink">Recent Submissions</h3>
            <Link to="/admin/results" className="text-xs text-clarify hover:underline font-medium">View all</Link>
          </div>
          {!s.recentSubmissions?.length ? (
            <div className="text-center py-8 text-annotation text-xs">
              <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p>No submissions yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {s.recentSubmissions.slice(0, 6).map(sub => {
                const pct = sub.max_score > 0 ? Math.round((sub.score / sub.max_score) * 100) : 0;
                return (
                  <div key={sub.id} className="flex items-center justify-between py-1.5 border-b border-rim/30 last:border-0">
                    <div className="min-w-0 mr-2">
                      <div className="text-sm font-medium text-ink truncate">{sub.user_name}</div>
                      <div className="text-2xs text-annotation/60 truncate">{sub.test_title}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold font-mono score-digit ${pct >= 40 ? 'text-verify' : 'text-alert'}`}>{pct}%</div>
                      <div className="text-2xs text-annotation/50 font-mono">
                        {formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Compact stat box ─────────────────────────────────────── */
function StatBox({ label, value, sub, highlight }) {
  return (
    <div className="panel p-4">
      <p className="text-label text-annotation font-medium">{label}</p>
      <p className={`text-headline font-display font-bold text-ink mt-1 score-digit ${highlight ? 'text-accent' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-caption text-annotation/60 mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}