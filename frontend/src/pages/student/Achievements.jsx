import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import { Spinner, Badge } from '../../components/shared/UI';
import { Award, Lock, CheckCircle, Star } from 'lucide-react';
import { format } from 'date-fns';
import gsap from 'gsap';

const achievementIcons = {
  first_test: '🎯',
  score_90: '🏆',
  streak_7: '🔥',
  streak_30: '💎',
  three_hard: '🧩',
  daily_champion: '⭐',
  xp_1000: '💯',
  xp_5000: '👑',
  level_5: '🌟',
  level_10: '🚀',
};

const iconColors = {
  first_test: 'from-blue-400 to-blue-600',
  score_90: 'from-yellow-400 to-yellow-600',
  streak_7: 'from-orange-400 to-red-500',
  streak_30: 'from-purple-400 to-purple-600',
  three_hard: 'from-green-400 to-green-600',
  daily_champion: 'from-amber-400 to-amber-600',
  xp_1000: 'from-emerald-400 to-emerald-600',
  xp_5000: 'from-pink-400 to-pink-600',
  level_5: 'from-indigo-400 to-indigo-600',
  level_10: 'from-red-400 to-red-600',
};

export default function Achievements() {
  const { data, isLoading } = useQuery({
    queryKey: 'achievements',
    queryFn: gamificationAPI.getAchievements,
  });
  const cardsRef = useRef([]);

  useEffect(() => {
    if (data?.achievements) {
      const earnedCards = cardsRef.current.filter((_, i) => data.achievements[i]?.earned);
      if (earnedCards.length) {
        gsap.from(earnedCards, {
          scale: 0.8,
          opacity: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: 'back.out(1.7)',
        });
      }
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  const achievements = data?.achievements || [];
  const earned = achievements.filter(a => a.earned).length;

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Achievements</h1>
          <p className="section-subtitle">{earned} of {achievements.length} badges earned</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {achievements.map((ach, i) => {
          const isEarned = ach.earned;
          const gradient = iconColors[ach.key] || 'from-gray-400 to-gray-600';
          return (
            <div
              key={ach.id}
              ref={el => cardsRef.current[i] = el}
              className={`panel p-4 relative overflow-hidden transition-all ${isEarned ? '' : 'opacity-60 grayscale'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-xl shrink-0 shadow-sm`}>
                  {achievementIcons[ach.key] || <Award size={20} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-display font-bold text-ink truncate">{ach.name}</h3>
                    {isEarned && <CheckCircle size={14} className="text-verify shrink-0" />}
                  </div>
                  <p className="text-xs text-annotation/70 mt-0.5">{ach.description}</p>
                  {isEarned && ach.earnedAt && (
                    <p className="text-2xs text-annotation/50 mt-1">
                      Earned {format(new Date(ach.earnedAt), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                {!isEarned && <Lock size={14} className="text-annotation/30 shrink-0 mt-1" />}
              </div>
              {isEarned && (
                <div className="absolute -top-6 -right-6 w-12 h-12 bg-verify/10 rounded-full" />
              )}
            </div>
          );
        })}
      </div>

      {achievements.length === 0 && (
        <div className="empty-state py-16">
          <Star size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">No achievements defined</h3>
          <p className="empty-state-desc">Complete activities to earn badges</p>
        </div>
      )}
    </div>
  );
}
