import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import { Btn, StatCard, ProgressBar, Spinner } from '../../components/shared/UI';
import { useStore } from '../../store';
import toast from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap, Flame, Trophy, Star, Calendar, ChevronRight, Award } from 'lucide-react';
import { format } from 'date-fns';

export default function Gamification() {
  const { user } = useStore();
  const { data: stats, isLoading } = useQuery({
    queryKey: 'gamification-stats',
    queryFn: gamificationAPI.getMyStats,
    refetchInterval: 30000,
  });
  const { data: levelsData } = useQuery({
    queryKey: 'gamification-levels',
    queryFn: gamificationAPI.getLevels,
  });

  const checkinMut = useMutation({
    mutationFn: gamificationAPI.checkin,
    onSuccess: (data) => {
      toast.success(data.bonusReason ? `+${data.xpAwarded} XP! ${data.bonusReason}` : `+${data.xpAwarded} XP`);
      if (data.newAchievements?.length) {
        data.newAchievements.forEach(a => toast.success(`Achievement unlocked: ${a.name}`));
      }
    },
    onError: () => toast.error('Failed to check in'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  const xp = stats?.xp;
  const streak = stats?.streak;
  const recentTxns = stats?.recentTransactions || [];
  const levels = levelsData?.levels || [];

  const nextLevel = levels.find(l => l.level === (xp?.level || 1) + 1);
  const levelProgress = xp?.progress || 0;

  return (
    <div className="animate-fade-up space-y-6">
      <div className="section-header">
        <div>
          <h1 className="text-display">Gamification</h1>
          <p className="section-subtitle">Track your XP, levels, and achievements</p>
        </div>
        <Btn onClick={() => checkinMut.mutate()} disabled={checkinMut.isPending}>
          <Calendar size={14} />
          Daily Check-in
        </Btn>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Current Level" value={xp?.level || 1} icon={Star} color="yellow" sub={`${xp?.current?.toLocaleString()} total XP`} />
        <StatCard label="XP This Level" value={`${xp?.xpInCurrentLevel || 0}/${xp?.xpNeededForNext || 100}`} icon={Zap} color="blue" sub={`${levelProgress}% to next level`} />
        <StatCard label="Streak" value={`${streak?.current_streak || 0} days`} icon={Flame} color="red" sub={`Longest: ${streak?.longest_streak || 0}`} />
        <StatCard label="Achievements" value={`${stats?.achievements?.earned || 0}/${stats?.achievements?.total || 0}`} icon={Trophy} color="green" sub="Badges earned" />
      </div>

      <div className="panel p-5">
        <h3 className="text-sm font-display font-bold text-ink mb-3">Level Progress — Level {xp?.level}</h3>
        <ProgressBar value={xp?.xpInCurrentLevel || 0} max={xp?.xpNeededForNext || 100} color="bg-accent" />
        <div className="flex justify-between text-xs text-annotation mt-1">
          <span>{xp?.currentLevelXp?.toLocaleString()} XP</span>
          <span>{xp?.nextLevelXp?.toLocaleString()} XP</span>
        </div>
        {nextLevel && (
          <p className="text-xs text-annotation/60 mt-2">
            Next level: Level {nextLevel.level} at {nextLevel.xpRequired.toLocaleString()} XP
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-5">
          <h3 className="text-sm font-display font-bold text-ink mb-3">Recent XP Activity</h3>
          {recentTxns.length === 0 ? (
            <div className="empty-state py-8">
              <p className="empty-state-title">No activity yet</p>
              <p className="empty-state-desc">Complete tests and challenges to earn XP</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recentTxns.map(txn => (
                <div key={txn.id} className="flex items-center justify-between py-1.5 border-b border-rim/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-accent" />
                    <div>
                      <p className="text-xs text-ink font-medium">{txn.reason || 'XP earned'}</p>
                      <p className="text-2xs text-annotation/60">{format(new Date(txn.created_at), 'MMM d, HH:mm')}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-verify">+{txn.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-display font-bold text-ink mb-3">All Levels</h3>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {levels.slice(0, 30).map(l => {
              const isCurrent = l.level === xp?.level;
              const isUnlocked = l.xpRequired <= (xp?.current || 0);
              return (
                <div key={l.level} className={`flex items-center justify-between px-2 py-1 rounded text-xs ${isCurrent ? 'bg-accent/10 ring-1 ring-accent/30' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono ${isUnlocked ? 'text-accent' : 'text-annotation/40'}`}>Lv.{l.level}</span>
                    {isCurrent && <span className="text-2xs text-accent font-medium">Current</span>}
                  </div>
                  <span className={`font-mono ${isUnlocked ? 'text-ink' : 'text-annotation/40'}`}>
                    {l.xpRequired.toLocaleString()} XP
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
