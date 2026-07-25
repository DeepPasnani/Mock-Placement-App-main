import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { useQuery } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Zap, Flame, Menu, X } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
 * Student Layout — Top nav bar + content
 * ═══════════════════════════════════════════════════════════ */

export default function StudentLayout() {
  const { user, logout, streak, setStreak } = useStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useQuery({
    queryKey: ['streak-data'],
    queryFn: async () => {
      const data = await gamificationAPI.getStreak();
      setStreak(data.streak);
      return data;
    },
    refetchInterval: 60000,
  });

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/login');
  };

  return (
    <>
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#student-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-panel focus:text-sm focus:font-bold focus:outline-none"
      >
        Skip to main content
      </a>

    <div className="min-h-screen bg-deck">
      {/* Top bar */}
      <header className="bg-panel border-b border-rim sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-12">
          <div className="flex items-center gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
                <svg className="w-4 h-4 text-panel" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <span className="font-display font-bold text-sm text-ink hidden sm:block">
                CampusTrack
              </span>
            </div>

            {/* Nav */}
            <nav className="hidden sm:flex gap-1">
              <NavLink
                to="/student"
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-annotation hover:bg-panel hover:text-ink'
                  }`
                }
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Tests
              </NavLink>
              <NavLink
                to="/student/results"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-annotation hover:bg-panel hover:text-ink'
                  }`
                }
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Results
              </NavLink>
              <NavLink
                to="/student/gamification"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-annotation hover:bg-panel hover:text-ink'
                  }`
                }
              >
                <Zap size={14} />
                XP
              </NavLink>
              <NavLink
                to="/student/leaderboard"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-annotation hover:bg-panel hover:text-ink'
                  }`
                }
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Leaderboard
              </NavLink>
            </nav>
          </div>

          {/* Streak + User + Sign out */}
          <div className="flex items-center gap-2">
            {streak && streak.current_streak > 0 && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-accent/5 text-accent text-xs font-medium">
                <Flame size={12} />
                {streak.current_streak}
              </div>
            )}
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-ink">{user?.name || 'Student'}</div>
              <div className="text-2xs text-annotation/60">{user?.email}</div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-md text-annotation hover:bg-panel hover:text-ink"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-annotation hover:bg-panel hover:text-ink transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-panel border-b border-rim shadow-sm">
          <nav className="max-w-5xl mx-auto px-4 py-2 flex flex-col gap-1">
            {[
              { to: '/student', label: 'Tests', end: true },
              { to: '/student/results', label: 'Results' },
              { to: '/student/gamification', label: 'XP & Level' },
              { to: '/student/leaderboard', label: 'Leaderboard' },
              { to: '/student/achievements', label: 'Achievements' },
              { to: '/student/progress', label: 'Progress' },
              { to: '/student/daily-challenge', label: 'Daily Challenge' },
              { to: '/student/mock-interview', label: 'Mock Interview' },
              { to: '/student/resources', label: 'Resources' },
            ].map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-annotation hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <main id="student-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 page-enter">
        <Outlet />
      </main>
    </div>
    </>
  );
}
