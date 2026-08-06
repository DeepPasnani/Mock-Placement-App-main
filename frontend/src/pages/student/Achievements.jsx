import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import { Spinner, Badge } from '../../components/shared/UI';
import { Award, Lock, CheckCircle, Star, Trophy, Flame, Gem, Puzzle, CalendarDays, Percent, Crown, Sparkles, Rocket } from 'lucide-react';
import { format } from 'date-fns';
import gsap from 'gsap';

const achievementIcons = {
  first_test: Star,
  score_90: Trophy,
  streak_7: Flame,
  streak_30: Gem,
  three_hard: Puzzle,
  daily_champion: CalendarDays,
  xp_1000: Percent,
  xp_5000: Crown,
  level_5: Sparkles,
  level_10: Rocket,
};

export default function Achievements() {
  const { data, isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: gamificationAPI.getAchievements,
  });
  const cardsRef = useRef([]);

  useEffect(() => {
    if (data?.achievements) {
      const earnedCards = cardsRef.current.filter((_, i) => data.achievements[i]?.earned);
      if (earnedCards.length) {
        gsap.from(earnedCards, {
          scale: 0.96,
          opacity: 0,
          duration: 0.45,
          stagger: 0.07,
          ease: 'power2.out',
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
          const badgeTone = isEarned ? 'bg-accent shadow-sm' : 'bg-sunken';
          return (
            <div
              key={ach.id}
              ref={el => cardsRef.current[i] = el}
              className={`panel p-4 relative overflow-hidden transition-all ${isEarned ? '' : 'opacity-60 grayscale'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl ${badgeTone} flex items-center justify-center shrink-0 ${isEarned ? 'shadow-sm' : ''}`}>
                  {(() => {
                    const Icon = achievementIcons[ach.key] || Award;
                    return <Icon size={20} className={isEarned ? 'text-panel' : 'text-annotation'} />;
                  })()}
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
