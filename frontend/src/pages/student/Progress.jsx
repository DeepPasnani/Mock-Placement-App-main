import { useQuery } from '@tanstack/react-query';
import { gamificationAPI, submissionsAPI } from '../../services/api';
import { StatCard, ProgressBar, Badge, Spinner } from '../../components/shared/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { Clock, TrendingUp, BookOpen, CheckCircle, Target } from 'lucide-react';

export default function Progress() {
  const { data: stats } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: gamificationAPI.getMyStats,
  });
  const { data: subsData, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: submissionsAPI.getMy,
  });
  const { data: achievements } = useQuery({
    queryKey: ['achievements'],
    queryFn: gamificationAPI.getAchievements,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  const subs = (subsData?.submissions || []).filter(s => s.status === 'submitted' || s.status === 'auto_submitted');
  const xp = stats?.xp;
  const allAchievements = achievements?.achievements || [];
  const earned = allAchievements.filter(a => a.earned);
  const remaining = allAchievements.filter(a => !a.earned);

  const genreScores = {};
  subs.forEach(s => {
    const pct = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0;
    const genre = s.test_department || 'General';
    if (!genreScores[genre]) genreScores[genre] = { total: 0, count: 0 };
    genreScores[genre].total += pct;
    genreScores[genre].count += 1;
  });

  const radarData = Object.entries(genreScores).map(([genre, data]) => ({
    genre,
    score: Math.round(data.total / data.count),
  }));

  const xpHistory = [];
  const days = 30;
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    xpHistory.push({ date: d.toISOString().split('T')[0], xp: 0 });
  }

  const totalPracticeHours = subs.reduce((acc, s) => {
    return acc + (s.time_taken_seconds || 0) / 3600;
  }, 0);

  const avgScore = subs.length > 0
    ? Math.round(subs.reduce((acc, s) => acc + (s.max_score > 0 ? (s.score / s.max_score) * 100 : 0), 0) / subs.length)
    : 0;

  const passedTests = subs.filter(s => {
    const pct = s.max_score > 0 ? (s.score / s.max_score) * 100 : 0;
    return pct >= (s.test_settings?.passingScore || 40);
  }).length;

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">My Progress</h1>
          <p className="section-subtitle">Track your learning journey</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tests Completed" value={subs.length} icon={BookOpen} color="blue" />
        <StatCard label="Average Score" value={`${avgScore}%`} icon={Target} color="green" sub={`${passedTests} passed`} />
        <StatCard label="Practice Hours" value={totalPracticeHours.toFixed(1)} icon={Clock} color="yellow" />
        <StatCard label="Current Level" value={xp?.level || 1} icon={TrendingUp} color="purple" sub={`${xp?.current || 0} XP`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {radarData.length > 0 && (
          <div className="panel p-5">
            <h3 className="text-sm font-display font-bold text-ink mb-3">Performance by Genre</h3>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--ct-rim)" />
                <PolarAngleAxis dataKey="genre" tick={{ fontSize: 11, fill: 'var(--ct-annotation)' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <Radar name="Score" dataKey="score" stroke="var(--ct-accent)" fill="var(--ct-accent)" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {subs.length > 0 && (
          <div className="panel p-5">
            <h3 className="text-sm font-display font-bold text-ink mb-3">Recent Scores</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={subs.slice(-10).map(s => ({
                name: s.test_title?.slice(0, 15) || 'Test',
                score: s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0,
              }))}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <Tooltip contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', fontSize: 12 }} />
                <Bar dataKey="score" fill="var(--ct-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-5">
          <h3 className="text-sm font-display font-bold text-ink mb-3">
            Achievement Progress ({earned.length}/{allAchievements.length})
          </h3>
          <ProgressBar value={earned.length} max={allAchievements.length || 1} color="bg-accent" />
          <div className="space-y-2 mt-3">
            {remaining.slice(0, 5).map(ach => (
              <div key={ach.id} className="flex items-center gap-2 text-xs text-annotation/70">
                <div className="w-1.5 h-1.5 rounded-full bg-rim" />
                <span>{ach.name}</span>
                <span className="text-annotation/50">— {ach.description}</span>
              </div>
            ))}
            {remaining.length > 5 && (
              <p className="text-xs text-annotation/50">+{remaining.length - 5} more achievements</p>
            )}
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-display font-bold text-ink mb-3">Practice Breakdown</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-annotation mb-1">
                <span>MCQ Questions</span>
                <span>{subs.reduce((acc, s) => acc + (s.answers ? Object.keys(s.answers).length : 0), 0)}</span>
              </div>
              <ProgressBar value={subs.reduce((acc, s) => acc + (s.answers ? Object.keys(s.answers).length : 0), 0)} max={100} color="bg-clarify" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-annotation mb-1">
                <span>Coding Problems</span>
                <span>{subs.reduce((acc, s) => acc + (s.code_solutions ? Object.keys(s.code_solutions).length : 0), 0)}</span>
              </div>
              <ProgressBar value={subs.reduce((acc, s) => acc + (s.code_solutions ? Object.keys(s.code_solutions).length : 0), 0)} max={30} color="bg-accent" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-annotation mb-1">
                <span>Tests Passed</span>
                <span>{passedTests}/{subs.length}</span>
              </div>
              <ProgressBar value={passedTests} max={subs.length || 1} color="bg-verify" />
            </div>
          </div>
        </div>
      </div>

      {subs.length === 0 && (
        <div className="empty-state py-16">
          <Target size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">No data yet</h3>
          <p className="empty-state-desc">Complete tests and activities to see your progress</p>
        </div>
      )}
    </div>
  );
}
