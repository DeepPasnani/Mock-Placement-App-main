import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../store';
import { testsAPI, submissionsAPI, gamificationAPI } from '../../services/api';
import { Btn, Modal, Spinner, StatCard } from '../../components/shared/UI';
import { Link } from 'react-router-dom';
import OnboardingTutorial from '../../components/shared/OnboardingTutorial';

const WIDGET_REGISTRY = {
  UpcomingTests: { label: 'Upcoming Tests', defaultSize: 'small' },
  RecentScores: { label: 'Recent Scores', defaultSize: 'small' },
  WeakTopics: { label: 'Weak Topics', defaultSize: 'small' },
  LeaderboardRank: { label: 'Leaderboard Rank', defaultSize: 'small' },
  XPProgress: { label: 'XP Progress', defaultSize: 'small' },
  StreakCounter: { label: 'Streak Counter', defaultSize: 'small' },
};

export default function StudentDashboard() {
  const { user, preferences, setDashboardWidgets, setWidgetOrder, completeOnboarding } = useStore();
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const { data: testsData } = useQuery({ queryKey: ['student-tests'], queryFn: testsAPI.list });
  const { data: subsData } = useQuery({ queryKey: ['my-subs'], queryFn: submissionsAPI.getMy });
  const { data: xpData } = useQuery({ queryKey: ['my-xp'], queryFn: gamificationAPI.getMyStats });
  const { data: streakData } = useQuery({ queryKey: ['my-streak'], queryFn: gamificationAPI.getStreak });
  const { data: lbData } = useQuery({ queryKey: ['leaderboard'], queryFn: () => gamificationAPI.getLeaderboard({ limit: 100 }) });

  const toggleWidget = (key) => {
    const current = preferences.dashboardWidgets || [];
    const updated = current.includes(key) ? current.filter(w => w !== key) : [...current, key];
    setDashboardWidgets(updated);
  };

  const moveWidget = (index, direction) => {
    const order = [...(preferences.widgetOrder || Object.keys(WIDGET_REGISTRY))];
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setWidgetOrder(order);
  };

  const activeWidgets = (preferences.widgetOrder || Object.keys(WIDGET_REGISTRY))
    .filter(w => (preferences.dashboardWidgets || Object.keys(WIDGET_REGISTRY)).includes(w));

  const tests = testsData?.tests || [];
  const submissions = subsData?.submissions || [];
  const upcoming = tests.filter(t => t.status === 'published' && new Date(t.start_time) > new Date()).slice(0, 5);
  const recent = submissions.filter(s => s.status === 'submitted').slice(0, 5);

  const renderWidget = (key) => {
    switch (key) {
      case 'UpcomingTests':
        return (
          <div className="panel p-4">
            <h3 className="text-title mb-2">Upcoming Tests</h3>
            {upcoming.length === 0 ? <p className="text-xs text-annotation">No upcoming tests</p> : (
              <div className="space-y-2">{upcoming.map(t => (
                <div key={t.id} className="text-xs flex justify-between py-1 border-b border-rim/30 last:border-0">
                  <span className="font-medium">{t.title}</span>
                  <span className="text-annotation">{new Date(t.start_time).toLocaleDateString()}</span>
                </div>
              ))}</div>
            )}
          </div>
        );
      case 'RecentScores':
        return (
          <div className="panel p-4">
            <h3 className="text-title mb-2">Recent Scores</h3>
            {recent.length === 0 ? <p className="text-xs text-annotation">No scores yet</p> : (
              <div className="space-y-2">{recent.map(s => {
                const pct = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0;
                return <div key={s.id} className="text-xs flex justify-between py-1 border-b border-rim/30 last:border-0">
                  <span className="font-medium truncate mr-2">{s.test_title || 'Test'}</span>
                  <span className={`font-bold font-mono ${pct >= 40 ? 'text-verify' : 'text-alert'}`}>{pct}%</span>
                </div>;
              })}</div>
            )}
          </div>
        );
      case 'XPProgress':
        return (
          <div className="panel p-4">
            <h3 className="text-title mb-2">XP Progress</h3>
            <p className="text-2xl font-bold font-mono text-accent">{xpData?.xp?.current ?? 0} XP</p>
            <p className="text-xs text-annotation">Level {xpData?.xp?.level ?? 1}</p>
          </div>
        );
      case 'StreakCounter':
        return (
          <div className="panel p-4">
            <h3 className="text-title mb-2">Streak</h3>
            <p className="text-2xl font-bold font-mono text-accent">{streakData?.current_streak || 0} days</p>
            <p className="text-xs text-annotation">Best: {streakData?.longest_streak || 0}</p>
          </div>
        );
      case 'LeaderboardRank':
        const rank = (lbData?.leaderboard || []).findIndex(e => e.user_id === user?.id) + 1;
        return (
          <div className="panel p-4">
            <h3 className="text-title mb-2">Your Rank</h3>
            <p className="text-2xl font-bold font-mono text-clarify">#{rank || '-'}</p>
            <p className="text-xs text-annotation">of {(lbData?.leaderboard || []).length} students</p>
          </div>
        );
      case 'WeakTopics':
        return (
          <div className="panel p-4">
            <h3 className="text-title mb-2">Weak Topics</h3>
            <p className="text-xs text-annotation">Complete more tests to see topic analysis</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <OnboardingTutorial />

      <div className="section-header">
        <div>
          <h1 className="text-display">Welcome, {user?.name?.split(' ')[0] || 'Student'}</h1>
          <p className="section-subtitle">Your placement dashboard</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={() => setShowWidgetSettings(true)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Customize
          </Btn>
          <Link to="/student/tests" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            View Tests
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeWidgets.map((key, idx) => (
          <div key={key} className="relative group" draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = parseInt(e.dataTransfer.getData('text/plain'));
              if (from !== idx) moveWidget(from, idx > from ? 1 : -1);
            }}
          >
            {renderWidget(key)}
            <button
              onClick={() => moveWidget(idx, -1)}
              className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 text-annotation hover:text-ink transition-opacity p-1"
              disabled={idx === 0}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => moveWidget(idx, 1)}
              className="absolute top-1 left-5 opacity-0 group-hover:opacity-100 text-annotation hover:text-ink transition-opacity p-1"
              disabled={idx === activeWidgets.length - 1}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <Modal isOpen={showWidgetSettings} onClose={() => setShowWidgetSettings(false)} title="Customize Dashboard" width="max-w-sm">
        <div className="space-y-2">
          {Object.entries(WIDGET_REGISTRY).map(([key, w]) => (
            <label key={key} className="flex items-center justify-between py-2 border-b border-rim/30 last:border-0">
              <span className="text-sm">{w.label}</span>
              <button
                onClick={() => toggleWidget(key)}
                className={`w-10 h-5 rounded-full transition-colors ${(preferences.dashboardWidgets || []).includes(key) ? 'bg-verify' : 'bg-rim'} relative`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${(preferences.dashboardWidgets || []).includes(key) ? 'translate-x-5 left-0' : 'left-0.5'}`} />
              </button>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
