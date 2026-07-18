import { Link } from 'react-router-dom';

/* ═══════════════════════════════════════════════════════════
 * Landing Page — public marketing page shown at "/" for signed
 * -out visitors. Previously CampusTrack went straight from "/"
 * to the login form; this gives it a proper front door, ported
 * over (and restyled to the CampusTrack token system) from the
 * Next.js UI-redesign prototype's Landing component.
 * ═══════════════════════════════════════════════════════════ */

const FEATURES = [
  {
    title: 'Test Builder',
    desc: '3-step wizard — configure, add MCQ / coding sections, publish. Multi-section support with per-section timing.',
    icon: 'M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    title: 'Question Bank',
    desc: 'Build a reusable library of MCQ and coding questions once, then pull them into any future test in one click.',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s4.332.477 5.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    title: 'Live Code Execution',
    desc: 'Full Monaco editor with a Run button — Python, Java, C, C++ — graded instantly against hidden test cases via Judge0.',
    icon: 'M14.7 6.3a1 1 0 00-1.4 0L10 9.6 7.7 7.3a1 1 0 00-1.4 1.4l3 3a1 1 0 001.4 0l4-4a1 1 0 000-1.4z',
  },
  {
    title: 'Real-Time Proctoring',
    desc: 'WebSocket heartbeat, tab-switch tracking, and auto-submit on expiry keep exams honest without extra hardware.',
    icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  },
  {
    title: 'Resume & Recover',
    desc: 'Admins can safely resume a student\'s test after a crash or network drop, preserving remaining time.',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    title: 'Results & Analytics',
    desc: 'Score distribution, leaderboards, and one-click CSV export — no more copy-pasting into spreadsheets.',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
];

const STATS = [
  { value: '1000+', label: 'Concurrent students' },
  { value: '4', label: 'Languages graded' },
  { value: '20+', label: 'Question types' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-deck relative overflow-hidden">
      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 lg:px-16 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-panel" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <span className="font-display text-lg font-bold text-ink tracking-tight">CampusTrack</span>
        </div>
        <Link to="/login" className="btn-primary btn-sm">Sign In</Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 lg:px-16 pt-10 pb-16 lg:pt-16 lg:pb-24 max-w-5xl mx-auto text-center">
        <h1 className="font-display text-4xl lg:text-6xl font-bold text-ink leading-tight mb-5">
          One platform for your entire<br className="hidden sm:block" />
          <span className="text-accent">placement drive</span>
        </h1>
        <p className="text-annotation text-base lg:text-lg max-w-2xl mx-auto mb-8">
          Aptitude tests, live coding challenges, Google OAuth, and real-time proctoring —
          replacing HackerRank, Google Forms, and spreadsheets with one self-hosted system
          built to handle 1000+ students at once.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/login" className="btn-primary btn-lg">Get Started</Link>
          <button onClick={() => { const el = document.getElementById('features'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }} className="btn-ghost btn-lg">See Features</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mt-14">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="font-display text-2xl lg:text-3xl font-bold text-accent score-digit">{s.value}</div>
              <div className="text-2xs text-annotation/70 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 lg:px-16 pb-20 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ title, desc, icon }) => (
            <div key={title} className="panel p-5">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
                <svg className="w-4.5 h-4.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
              </div>
              <h3 className="font-display font-bold text-sm text-ink mb-1.5">{title}</h3>
              <p className="text-xs text-annotation/80 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 lg:px-16 pb-20 max-w-3xl mx-auto text-center">
        <div className="panel p-8 lg:p-10">
          <h2 className="font-display text-2xl font-bold text-ink mb-2">Ready to run your next drive?</h2>
          <p className="text-annotation text-sm mb-6">Sign in with your college account to get started as a student, or contact your T&amp;P cell for admin access.</p>
          <Link to="/login" className="btn-primary btn-lg">Sign In to CampusTrack</Link>
        </div>
      </section>

      <footer className="relative z-10 px-6 lg:px-16 py-6 text-center text-2xs text-annotation/50">
        &copy; 2026 CampusTrack. All rights reserved.
      </footer>
    </div>
  );
}
