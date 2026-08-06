import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gamificationAPI, batchesAPI } from '../../services/api';
import { Btn, Badge, Spinner, Tabs } from '../../components/shared/UI';
import { useStore } from '../../store';
import { Trophy, Medal, Award, User, ChevronRight } from 'lucide-react';

const rankIcons = {
  1: { icon: Trophy, color: 'text-trophy-gold', tint: 'bg-trophy-gold/10', label: 'Gold' },
  2: { icon: Medal, color: 'text-trophy-silver', tint: 'bg-trophy-silver/10', label: 'Silver' },
  3: { icon: Award, color: 'text-trophy-bronze', tint: 'bg-trophy-bronze/10', label: 'Bronze' },
};

export default function Leaderboard() {
  const { user } = useStore();
  const [tab, setTab] = useState('alltime');
  const [batchFilter, setBatchFilter] = useState('');

  const { data: lbData, isLoading } = useQuery({
    queryKey: ['leaderboard', tab, batchFilter],
    queryFn: () => gamificationAPI.getLeaderboard({ type: tab, batch: batchFilter || undefined }),
  });

  const { data: batchesData } = useQuery({
    queryKey: ['batches'],
    queryFn: batchesAPI.list,
  });

  const leaderboard = lbData?.leaderboard || [];
  const myRank = lbData?.myRank;
  const batches = batchesData?.batches || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Leaderboard</h1>
          <p className="section-subtitle">Top performers across all students</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          tabs={[
            { id: 'alltime', label: 'All Time' },
            { id: 'weekly', label: 'This Week' },
            { id: 'test', label: 'Last Test' },
          ]}
          active={tab}
          onChange={setTab}
        />
        <select
          value={batchFilter}
          onChange={e => setBatchFilter(e.target.value)}
          className="select-field text-xs ml-auto"
        >
          <option value="">All Batches</option>
          {batches.map(b => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
      </div>

      {myRank && (
        <div className="panel bg-accent/5 border-accent/20 p-3 flex items-center gap-3">
          <User size={16} className="text-accent" />
          <span className="text-xs text-ink font-medium">Your Rank: #{myRank}</span>
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="empty-state py-16">
          <Trophy size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">No rankings yet</h3>
          <p className="empty-state-desc">Start taking tests to appear on the leaderboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.slice(0, 3).map((entry, idx) => {
            const rank = idx + 1;
            const RankIcon = rankIcons[rank]?.icon;
            const rankInfo = rankIcons[rank];
            return (
              <div
                key={entry.id}
                className={`panel p-4 flex items-center gap-4 ${user?.id === entry.id ? 'ring-2 ring-accent/40' : ''}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${rankInfo?.tint || 'bg-sunken'}`}>
                  {RankIcon ? <RankIcon size={20} className={rankInfo?.color ?? 'text-annotation'} /> : <span className="text-lg font-bold text-ink">{rank}</span>}
                </div>
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent uppercase shrink-0">
                  {entry.name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-display font-semibold text-ink truncate">
                      {entry.name} {user?.id === entry.id && <Badge color="clarify">You</Badge>}
                    </span>
                  </div>
                  <div className="text-xs text-annotation/60">
                    {entry.branch || ''} {entry.batch ? `• ${entry.batch}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-ink">{entry.xp_points?.toLocaleString()}</div>
                  <div className="text-2xs text-annotation/60">Level {entry.level}</div>
                </div>
              </div>
            );
          })}

          {leaderboard.length > 3 && (
            <div className="border-t border-rim/50 pt-2 mt-4">
              {leaderboard.slice(3).map((entry, idx) => {
                const rank = idx + 4;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-sunken/50 transition-colors ${user?.id === entry.id ? 'bg-accent/5 ring-1 ring-accent/20' : ''}`}
                  >
                    <span className="w-6 text-center text-xs font-mono text-annotation/60">#{rank}</span>
                    <div className="w-8 h-8 rounded-full bg-sunken flex items-center justify-center text-xs font-bold text-annotation uppercase shrink-0">
                      {entry.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-ink">
                        {entry.name} {user?.id === entry.id && <Badge color="clarify">You</Badge>}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-ink">{entry.xp_points?.toLocaleString()}</span>
                      <span className="text-2xs text-annotation/60 ml-1">Lv.{entry.level}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
