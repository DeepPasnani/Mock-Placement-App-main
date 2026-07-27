import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Spinner } from '../components/shared/UI';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';

/* ═══════════════════════════════════════════════════════════
 * Login Page — Auth gateway
 * Design: Calm, institutional. Left panel shows product
 * positioning, right panel has the form.
 * ═══════════════════════════════════════════════════════════ */

const DEPARTMENTS = [
  'Computer Engineering',
  'Computer Science and Design',
  'Aeronautical Engineering',
  'Electrical Engineering',
  'Electronics and Communication Engineering',
  'Civil Engineering',
];

const CLASSES = ['CE 1', 'CE 2', 'CE 3', 'CE 4'];

export default function LoginPage() {
  const { googleLogin, login, register, isLoading } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const googleBtnRef = useRef(null);

  const [mode, setMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    rollNumber: '',
    batch: '',
    yearOfStudy: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });

  const from = location.state?.from?.pathname || null;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const hasGoogle = clientId && !clientId.includes('YOUR_GOOGLE_CLIENT_ID');

  useEffect(() => {
    if (
      !hasGoogle ||
      !googleBtnRef.current ||
      !window.google ||
      mode !== 'login'
    )
      return;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleResponse,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: '100%',
        text: 'continue_with',
        shape: 'rectangular',
      });
    } catch (err) {
      console.error('Google init error:', err);
    }
  }, [hasGoogle, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleResponse = async ({ credential }) => {
    setError('');
    try {
      const { user } = await googleLogin(credential);
      toast.success(`Welcome, ${user.name || user.email}!`);
      navigate(from || (user.role === 'admin' ? '/admin' : '/student'), {
        replace: true,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed.');
    }
  };

  const handleChange = (e) => {
    setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let result;
      if (mode === 'login') {
        result = await login(formData.email, formData.password);
        toast.success(`Welcome back${result.user.name ? `, ${result.user.name}` : ''}!`);
      } else {
        result = await register(
          formData.name,
          formData.email,
          formData.password,
          formData.department,
          {
            rollNumber: formData.rollNumber,
            branch: formData.department,
            batch: formData.batch,
            yearOfStudy: formData.yearOfStudy ? Number(formData.yearOfStudy) : undefined,
          },
        );
        toast.success(`Account created! Welcome${result.user.name ? `, ${result.user.name}` : ''}!`);
      }
      navigate(
        result.user.role === 'admin' ? '/admin' : '/student',
        { replace: true },
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
          (mode === 'login' ? 'Invalid credentials' : 'Registration failed'),
      );
    }
  };

  // ── Forgot password — send OTP ────────────────────────────
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.email) {
      setError('Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      await authAPI.forgotPassword({ email: formData.email });
      setOtpSent(true);
      toast.success('OTP sent! Check your inbox.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset password ────────────────────────────────────────
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (formData.newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await authAPI.resetPassword({
        email: formData.email,
        otp: formData.otp,
        newPassword: formData.newPassword,
      });
      toast.success('Password reset! Please sign in.');
      setMode('login');
      setOtpSent(false);
      setFormData(p => ({ ...p, otp: '', newPassword: '', confirmPassword: '' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setMode('login');
    setError('');
    setOtpSent(false);
    setFormData(p => ({ ...p, otp: '', newPassword: '', confirmPassword: '' }));
  };

  return (
    <div className="min-h-screen flex bg-deck relative overflow-hidden">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-clarify/5" />
        <div className="relative z-10 flex flex-col justify-center px-16 py-20 w-full">
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                <svg className="w-6 h-6 text-panel" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <span className="font-display text-xl font-bold text-ink tracking-tight">
                CampusTrack
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold text-ink mb-4 leading-tight">
              Placement<br />
              <span className="text-accent">Assessment Platform</span>
            </h1>
            <p className="text-annotation text-base max-w-sm">
              Secure, scalable testing infrastructure for campus placement drives.
            </p>
          </div>

          {/* Feature grid (neutral, one accent highlight max) */}
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            {[
              { label: 'Code Execution', desc: 'Python, Java, C, C++', icon: 'M14.7 6.3a1 1 0 00-1.4 0L10 9.6 7.7 7.3a1 1 0 00-1.4 1.4l3 3a1 1 0 001.4 0l4-4a1 1 0 000-1.4z', highlight: true },
              { label: 'Auto Proctoring', desc: 'AI-powered monitoring', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', highlight: false },
              { label: 'Instant Results', desc: 'Real-time scoring', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', highlight: false },
              { label: 'Scale Ready', desc: '1000+ concurrent users', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', highlight: false },
            ].map(({ label, desc, icon, highlight }) => (
              <div key={label} className="panel p-3.5">
                <svg className={`w-4 h-4 mb-2 ${highlight ? 'text-accent' : 'text-annotation'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
                <h3 className="text-xs font-semibold text-ink mb-0.5">{label}</h3>
                <p className="text-2xs text-annotation/70">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ─────────────────────────────── */}
      <div className="w-full lg:w-[480px] flex items-center justify-center p-6 lg:p-10 relative z-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-panel" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
            </div>
            <h1 className="font-display text-xl font-bold text-ink">CampusTrack</h1>
            <p className="text-xs text-annotation/60 mt-0.5">Placement Assessment Portal</p>
          </div>

          <div className="panel p-6 lg:p-8">
            {/* ── FORGOT PASSWORD ─────────────────────────── */}
            {mode === 'forgot' && (
              <>
                <button
                  onClick={goBack}
                  className="flex items-center gap-1.5 text-xs text-annotation hover:text-ink mb-5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Sign In
                </button>

                <div className="mb-5">
                  <h2 className="font-display font-bold text-base text-ink">
                    {otpSent ? 'Enter OTP' : 'Reset Password'}
                  </h2>
                  <p className="text-xs text-annotation/70 mt-0.5">
                    {otpSent
                      ? `OTP sent to ${formData.email}`
                      : 'Enter your email to receive a reset code'}
                  </p>
                </div>

                {error && (
                  <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 mb-4">
                    <p className="text-xs text-alert text-center">{error}</p>
                  </div>
                )}

                {!otpSent ? (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label className="input-label">Email Address</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@institution.edu"
                        className="input-field"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary w-full"
                    >
                      {submitting && <Spinner size={14} className="text-deck" />}
                      Send OTP
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetSubmit} className="space-y-4">
                    <div>
                      <label className="input-label">6-Digit OTP</label>
                      <input
                        type="text"
                        name="otp"
                        value={formData.otp}
                        onChange={handleChange}
                        placeholder="Enter OTP"
                        maxLength={6}
                        className="input-field text-center font-mono tracking-[0.3em]"
                        required
                      />
                    </div>
                    <div>
                      <label className="input-label">New Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="newPassword"
                          value={formData.newPassword}
                          onChange={handleChange}
                          placeholder="Min 8 characters"
                          className="input-field pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(p => !p)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-annotation hover:text-ink"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            {showPassword ? (
                              <path strokeLinecap="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            ) : (
                              <path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="input-label">Confirm New Password</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Repeat new password"
                        className="input-field"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary w-full"
                    >
                      {submitting && <Spinner size={14} className="text-deck" />}
                      Reset Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="w-full text-xs text-annotation hover:text-ink transition-colors"
                    >
                      Resend OTP
                    </button>
                  </form>
                )}
              </>
            )}

            {/* ── LOGIN / REGISTER ─────────────────────────── */}
            {(mode === 'login' || mode === 'register') && (
              <>
                {/* Tabs */}
                <div className="flex border-b border-rim mb-5">
                  <button
                    onClick={() => { setMode('login'); setError(''); }}
                    className={`flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                      mode === 'login'
                        ? 'border-accent text-ink'
                        : 'border-transparent text-annotation hover:text-ink'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => { setMode('register'); setError(''); }}
                    className={`flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                      mode === 'register'
                        ? 'border-accent text-ink'
                        : 'border-transparent text-annotation hover:text-ink'
                    }`}
                  >
                    Register
                  </button>
                </div>

                {error && (
                  <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 mb-4">
                    <p className="text-xs text-alert text-center">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {mode === 'register' && (
                    <div>
                      <label className="input-label">Full Name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        className="input-field"
                        required={mode === 'register'}
                      />
                    </div>
                  )}
                  <div>
                    <label className="input-label">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@institution.edu"
                      className="input-field"
                      required
                    />
                  </div>
                  {mode === 'register' && (
                    <div>
                      <label className="input-label">Department</label>
                      <select
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        className="select-field"
                        required={mode === 'register'}
                      >
                        <option value="">Select department</option>
                        {DEPARTMENTS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {mode === 'register' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="input-label">Enrollment No.</label>
                        <input
                          type="text"
                          name="rollNumber"
                          value={formData.rollNumber}
                          onChange={handleChange}
                          placeholder="e.g. 220410107114"
                          className="input-field"
                          required={mode === 'register'}
                        />
                      </div>
                      <div>
                        <label className="input-label">Class</label>
                        <select
                          name="batch"
                          value={formData.batch}
                          onChange={handleChange}
                          className="select-field"
                          required={mode === 'register'}
                        >
                          <option value="">Select class</option>
                          {CLASSES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {mode === 'register' && (
                    <div>
                      <label className="input-label">Year of Study</label>
                      <select
                        name="yearOfStudy"
                        value={formData.yearOfStudy}
                        onChange={handleChange}
                        className="select-field"
                        required={mode === 'register'}
                      >
                        <option value="">Select year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="input-label mb-0">Password</label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => { setMode('forgot'); setError(''); }}
                          className="text-2xs text-clarify hover:underline"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder={
                          mode === 'login'
                            ? 'Enter your password'
                            : 'Create a password (min 8 chars)'
                        }
                        className="input-field pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-annotation hover:text-ink"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {showPassword ? (
                            <path strokeLinecap="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          ) : (
                            <path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary w-full"
                  >
                    {isLoading && <Spinner size={14} className="text-deck" />}
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                </form>

                {hasGoogle && mode === 'login' && (
                  <>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-rim" />
                      <span className="text-2xs text-annotation/50">or</span>
                      <div className="flex-1 h-px bg-rim" />
                    </div>
                    <div ref={googleBtnRef} className="w-full" />
                  </>
                )}

                <div className="mt-5 pt-4 border-t border-rim">
                  <p className="text-center text-2xs text-annotation/50">
                    Protected by enterprise-grade security.
                    <br />
                    Only authorized institutional accounts.
                  </p>
                </div>
              </>
            )}
          </div>

          <p className="text-center text-2xs text-annotation/40 mt-5">
            &copy; 2026 CampusTrack. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
