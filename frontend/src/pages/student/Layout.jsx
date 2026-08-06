import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { useQuery } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Zap, Flame, Menu, X, BarChart3, Trophy, Medal, TrendingUp, CalendarCheck, Video, BookOpen, FileText, MoreHorizontal, LayoutDashboard } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
 * Student Layout — Top nav bar + content
 * ──────────────────────────────────────────────────────────
 * One source of truth for navigation: PRIMARY_LINKS render inline
 * on desktop (Tests–XP) with the rest behind "More", and ALL links
 * render in the mobile menu. Same array drives both, so desktop
 * and mobile can never drift.
 * ═══════════════════════════════════════════════════════════ */

const PRIMARY_LINKS = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/results', label: 'Results', icon: BarChart3 },
  { to: '/student/achievements', label: 'Achievements', icon: Medal },
  { to: '/student/progress', label: 'Progress', icon: TrendingUp },
  { to: '/student/gamification', label: 'XP', icon: Zap },
  { to: '/student/leaderboard', label: 'Leaderboard', icon: Trophy },
];

const MORE_LINKS = [
  { to: '/student/daily-challenge', label: 'Daily Challenge', icon: CalendarCheck },
  { to: '/student/mock-interview', label: 'Mock Interview', icon: Video },
  { to: '/student/resources', label: 'Resources', icon: BookOpen },
];

const ALL_LINKS = [...PRIMARY_LINKS, ...MORE_LINKS];

const desktopLinkClass = ({ isActive }) =>
  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
    isActive
      ? 'bg-accent/10 text-accent'
      : 'text-annotation hover:bg-sunken hover:text-ink'
  }`;

function DesktopLink({ link }) {
  const Icon = link.icon;
  return (
    <NavLink to={link.to} end={link.end} className={desktopLinkClass}>
      <Icon size={14} />
      {link.label}
    </NavLink>
  );
}

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-annotation hover:bg-panel hover:text-ink transition-all"
      >
        <MoreHorizontal size={14} />
        More
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-panel border border-rim rounded-xl shadow-lg shadow-black/5 overflow-hidden z-30 animate-fade-in">
          {MORE_LINKS.map(link => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-annotation hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                <Icon size={15} className="opacity-80" />
                {link.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
            <nav className="hidden lg:flex gap-1 items-center" aria-label="Primary">
              {PRIMARY_LINKS.map(link => <DesktopLink key={link.to} link={link} />)}
              <MoreMenu />
            </nav>
          </div>

          {/* Streak + User + Sign out */}
          <div className="flex items-center gap-2">
            {streak && streak.current_streak > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/5 text-accent text-xs font-medium">
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
              aria-label="Sign out"
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
        <div className="sm:hidden">
          <div className="max-w-5xl mx-auto px-4 pb-4 pt-1">
            <nav className="bg-panel border border-rim rounded-xl shadow-lg shadow-black/5 overflow-hidden page-enter">
              <div className="px-4 py-3 border-b border-rim flex items-center justify-between bg-sunken/30">
                <span className="text-xs font-semibold uppercase tracking-wider text-annotation">
                  Menu
                </span>
                <span className="text-2xs text-annotation/50">{user?.name || 'Student'}</span>
              </div>
              <div className="p-2 flex flex-col gap-0.5">
                {PRIMARY_LINKS.map(link => (
                  <DropdownLink key={link.to} link={link} onClose={() => setMobileMenuOpen(false)} />
                ))}

                <div className="my-1.5 h-px bg-sunken" />

                {MORE_LINKS.map(link => (
                  <DropdownLink key={link.to} link={link} onClose={() => setMobileMenuOpen(false)} />
                ))}
              </div>
            </nav>
          </div>
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

function DropdownLink({ link, onClose }) {
  const Icon = link.icon;
  return (
    <NavLink
      to={link.to}
      end={link.end}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-accent/10 text-accent'
            : 'text-annotation hover:bg-sunken hover:text-ink'
        }`
      }
    >
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${
          link.end ? 'bg-accent/10 text-accent' : 'bg-sunken text-annotation'
        }`}
      >
        <Icon size={15} />
      </span>
      {link.label}
    </NavLink>
  );
}
