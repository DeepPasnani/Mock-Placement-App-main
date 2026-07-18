import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import { testsAPI, submissionsAPI } from '../../services/api';
import { useStore } from '../../store';
import Timer from '../../components/shared/Timer';
import { Btn, Modal, Alert, Spinner } from '../../components/shared/UI';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';

import AptitudeQuestion from './AptitudeQuestion';
import CodingQuestion from './CodingQuestion';
import QuestionPalette from './QuestionPalette';
import ConfirmSubmitModal from './ConfirmSubmitModal';
import CodingProblemSelection from './CodingProblemSelection';

/* ═══════════════════════════════════════════════════════════
 * Student Test Interface — Assessment Surface
 *
 * This is the most high-stakes screen in the product.
 * Design principles:
 *  • Timer is always visible (top bar centerpiece)
 *  • Question palette on the right for quick navigation
 *  • Clear answered/flagged/current states
 *  • Flat, clean panels — no visual noise
 *  • Monospace for all numeric/scores/timers
 * ═══════════════════════════════════════════════════════════ */

const LANG_MAP = {
  python: 'python',
  javascript: 'javascript',
  java: 'java',
  cpp: 'cpp',
};

const AUTO_SAVE_INTERVAL = 30000; // 30s
const MAX_TAB_SWITCHES = 5;

export default function TestInterface() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useStore();

  const [answers, setAnswers] = useState({});
  const [codeSolutions, setCodeSolutions] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQ, setCurrentQ] = useState(0);
  const [activeLang, setActiveLang] = useState('python');
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const [selectedProblems, setSelectedProblems] = useState([]);
  const [showProblemSelection, setShowProblemSelection] = useState(false);
  const [liveRemainingSeconds, setLiveRemainingSeconds] = useState(null);
  const autoSaveRef = useRef(null);

  // ── Data ──────────────────────────────────────────────
  const { data: testData, isLoading: loadingTest } = useQuery(
    ['test-full', testId],
    () => testsAPI.get(testId),
  );

  // ── Start test ────────────────────────────────────────
  const startMut = useMutation(submissionsAPI.start, {
    onSuccess: (data) => {
      setRemainingSeconds(data.remainingSeconds);
      setTestStarted(true);
      if (data.submission?.answers) {
        try { setAnswers(JSON.parse(data.submission.answers) || {}); } catch {/*noop*/}
      }
      if (data.submission?.code_solutions) {
        try { setCodeSolutions(JSON.parse(data.submission.code_solutions) || {}); } catch {/*noop*/}
      }
      if (data.submission?.selected_problems) {
        try {
          const sp = JSON.parse(data.submission.selected_problems);
          if (Array.isArray(sp) && sp.length > 0) setSelectedProblems(sp);
        } catch {/*noop*/}
      }
    },
    onError: (e) => {
      toast.error(e.response?.data?.error || 'Failed to start test');
      navigate('/student');
    },
  });

  const saveMut = useMutation(submissionsAPI.save);
  const submitMut = useMutation(submissionsAPI.submit, {
    onSuccess: () => {
      clearInterval(autoSaveRef.current);
      setSubmitting(false);
      toast.success('Test submitted!');
      setTimeout(() => navigate('/student/results', { replace: true }), 500);
    },
    onError: (e) => {
      setSubmitting(false);
      toast.error(e.response?.data?.error || 'Submission failed. Please try again.');
    },
  });

  // Auto-start when test loads
  useEffect(() => {
    if (testData && !testStarted) {
      startMut.mutate(testId);
    }
  }, [testData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 30s
  useEffect(() => {
    if (!testStarted) return;
    autoSaveRef.current = setInterval(() => {
      saveMut.mutate({
        testId,
        answers,
        codeSolutions,
        flaggedQuestions: Array.from(flagged),
      });
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(autoSaveRef.current);
  }, [testStarted, answers, codeSolutions, flagged]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent accidental page leave
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = 'Your progress is auto-saved. Are you sure?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Track tab switches
  useEffect(() => {
    if (!testStarted) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const newCount = tabSwitchCount + 1;
        setTabSwitchCount(newCount);
        if (newCount > MAX_TAB_SWITCHES) {
          toast.error('Tab switch limit exceeded — submitting test.');
          handleSubmit();
        } else {
          setShowTabWarning(true);
          setTimeout(() => setShowTabWarning(false), 3000);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [testStarted, tabSwitchCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // ── Independent MCQ / Coding round timers ──────────────
  // Once the MCQ sub-clock runs out, move the student off any aptitude
  // section and into the coding round. Placed before the loading-state
  // early return so the hook always runs (Rules of Hooks).
  useEffect(() => {
    if (!testData || liveRemainingSeconds === null) return;
    const splitTimers = !!testData.settings?.splitTimers;
    const mcqDurationSeconds = (testData.settings?.mcqDurationMinutes || 0) * 60;
    const totalDurationSeconds = (testData.duration_minutes || 0) * 60;
    const elapsedSeconds = totalDurationSeconds - liveRemainingSeconds;
    const locked = splitTimers && mcqDurationSeconds > 0 && elapsedSeconds >= mcqDurationSeconds;
    const currentSec = testData.sections?.[currentSection];
    if (locked && currentSec?.type === 'aptitude') {
      const firstCoding = testData.sections.findIndex(s => s.type === 'coding');
      if (firstCoding >= 0) {
        toast('MCQ time is up — moving you to the coding round.', { icon: '⏱️' });
        setCurrentSection(firstCoding);
        setCurrentQ(0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRemainingSeconds, testData, currentSection]);

  // ── Submit handler ────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setConfirmSubmit(false);
    submitMut.mutate({
      testId,
      answers,
      codeSolutions,
      flaggedQuestions: Array.from(flagged),
    });
  }, [testId, answers, codeSolutions, flagged]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Time expired ──────────────────────────────────────
  const handleTimeExpired = useCallback(() => {
    setTimeExpired(true);
    handleSubmit();
  }, [handleSubmit]);

  // ── Run code ──────────────────────────────────────────
  const handleRunAllTests = async () => {
    const q = section?.questions[currentQ];
    if (!q || q.type !== 'coding') return;
    const code = codeSolutions[q.id]?.[activeLang] || q.starter_code?.[activeLang] || '';
    if (!code.trim()) { toast.error('Write some code first.'); return; }
    setTestLoading(true);
    setTestResults(null);
    try {
      const visibleTests = (q.test_cases || []).filter(tc => !tc.isHidden);
      if (!visibleTests.length) {
        toast.error('No visible test cases for this problem.');
        setTestLoading(false);
        return;
      }
      const result = await submissionsAPI.runCode({ code, language: activeLang, testCases: visibleTests });
      setTestResults(result.results || []);
    } catch {
      toast.error('Test execution failed.');
    }
    setTestLoading(false);
  };

  const handleRunCode = async () => {
    const q = section?.questions[currentQ];
    if (!q) return;
    const code = codeSolutions[q.id]?.[activeLang] || q.starter_code?.[activeLang] || '';
    if (!code.trim()) { toast.error('Write some code first.'); return; }
    setRunLoading(true);
    setRunResult(null);
    try {
      const result = await submissionsAPI.runCode({
        code,
        language: activeLang,
        stdin: q.sample_input || '',
      });
      setRunResult(result);
    } catch {
      toast.error('Code execution failed.');
    }
    setRunLoading(false);
  };

  // ── Loading state ─────────────────────────────────────
  if (loadingTest || !testStarted || remainingSeconds === null) {
    return (
      <div className="min-h-screen bg-deck flex flex-col items-center justify-center gap-4">
        <Spinner size={28} className="text-accent" />
        <p className="text-sm text-annotation">
          {loadingTest ? 'Loading test…' : 'Starting your session…'}
        </p>
      </div>
    );
  }

  const test = testData;
  const section = test?.sections?.[currentSection];
  const isAptitude = section?.type === 'aptitude';
  const totalQ = test?.sections?.reduce((n, s) => n + s.questions.length, 0) || 0;
  const answeredCount =
    Object.keys(answers).length +
    Object.keys(codeSolutions).filter(k =>
      Object.values(codeSolutions[k] || {}).some(c => c?.trim()),
    ).length;
  const allowedLangs = test?.settings?.allowedLanguages || ['python', 'javascript', 'java', 'cpp'];

  const splitTimers = !!test?.settings?.splitTimers;
  const mcqDurationSeconds = (test?.settings?.mcqDurationMinutes || 0) * 60;
  const totalDurationSeconds = (test?.duration_minutes || 0) * 60;
  const elapsedSeconds = liveRemainingSeconds !== null ? totalDurationSeconds - liveRemainingSeconds : 0;
  const mcqLocked = splitTimers && mcqDurationSeconds > 0 && elapsedSeconds >= mcqDurationSeconds;

  // ── Check if coding section needs problem selection ──
  const codingSection = section?.type === 'coding' && section?.questions?.length > 3
    ? section
    : null;
  const hasSelectedCodingProblems = codingSection
    ? selectedProblems.some(id => codingSection.questions.some(q => q.id === id))
    : true;

  // Filter questions: only show selected ones for coding sections with selection
  const displayQuestions = codingSection && hasSelectedCodingProblems
    ? section.questions.filter(q => selectedProblems.includes(q.id))
    : section?.questions || [];

  const displayQ = displayQuestions[currentQ] || displayQuestions[0];

  // ── Navigation helpers ────────────────────────────────
  const navigateQ = (si, qi) => {
    if (mcqLocked && test.sections[si]?.type === 'aptitude') {
      toast.error('MCQ round has ended for this test.');
      return;
    }
    setCurrentSection(si);
    setCurrentQ(qi);
    setRunResult(null);
  };

  const goNext = () => {
    if (currentQ < section.questions.length - 1) {
      navigateQ(currentSection, currentQ + 1);
    } else if (currentSection < test.sections.length - 1) {
      navigateQ(currentSection + 1, 0);
    }
  };

  const goPrev = () => {
    if (currentQ > 0) {
      navigateQ(currentSection, currentQ - 1);
    } else if (currentSection > 0) {
      const prevSec = test.sections[currentSection - 1];
      navigateQ(currentSection - 1, prevSec.questions.length - 1);
    }
  };

  const isLastQuestion =
    currentQ === section.questions.length - 1 &&
    currentSection === test.sections.length - 1;

  const setAnswer = (qId, val) => setAnswers(a => ({ ...a, [qId]: val }));
  const setCode = (qId, lang, code) =>
    setCodeSolutions(cs => ({
      ...cs,
      [qId]: { ...(cs[qId] || {}), [lang]: code },
    }));
  const toggleFlag = (qId) =>
    setFlagged(f => {
      const nf = new Set(f);
      nf.has(qId) ? nf.delete(qId) : nf.add(qId);
      return nf;
    });

  const isAnswered = (sec, qq) =>
    sec.type === 'coding'
      ? Object.values(codeSolutions[qq.id] || {}).some(c => c?.trim())
      : answers[qq.id] !== undefined && answers[qq.id] !== null && answers[qq.id] !== '';

  if (!displayQ && !codingSection) return null;

  // If coding section needs problem selection, show the picker
  if (codingSection && !hasSelectedCodingProblems) {
    return <CodingProblemSelection
      section={codingSection}
      selectedProblems={selectedProblems}
      setSelectedProblems={setSelectedProblems}
      codeSolutions={codeSolutions}
      onConfirm={() => {
        // Save selection
        saveMut.mutate({ testId, answers, codeSolutions, flaggedQuestions: Array.from(flagged), selectedProblems });
        setCurrentQ(0);
      }}
    />;
  }

  // ── Time expired overlay ──────────────────────────────
  if (timeExpired) {
    return (
      <div className="min-h-screen bg-deck flex flex-col items-center justify-center gap-4">
        <div className="panel p-8 max-w-sm text-center animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold text-ink mb-1">Time's Up</h2>
          <p className="text-sm text-annotation mb-4">Your test has been submitted automatically.</p>
          <Btn variant="primary" onClick={() => navigate('/student/results')}>
            View Results
          </Btn>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="h-screen flex flex-col bg-deck text-ink overflow-hidden exam-mode">
      {/* ── Top Bar ──────────────────────────────────────── */}
      <header className="h-14 bg-panel border-b border-rim flex items-center justify-between px-3 sm:px-4 shrink-0 z-50">
        {/* Left: test title */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-sm text-ink truncate max-w-40 sm:max-w-56">
            {test.title}
          </span>
          <span className="text-xs text-annotation/60 hidden sm:block font-mono">
            {answeredCount}/{totalQ}
          </span>
        </div>

        {/* Center: Timer (signature element) */}
        <div className="flex items-center gap-2">
          {splitTimers && (
            <span className={`hidden md:inline-flex items-center px-2 py-1 rounded-md text-2xs font-mono font-bold ${mcqLocked ? 'bg-accent/15 text-accent' : 'bg-panel text-annotation border border-rim'}`}>
              {mcqLocked ? 'Coding Round' : 'MCQ Round'}
              {' · '}
              {(() => {
                const remainInPhase = mcqLocked
                  ? Math.max(0, totalDurationSeconds - elapsedSeconds)
                  : Math.max(0, mcqDurationSeconds - elapsedSeconds);
                const m = Math.floor(remainInPhase / 60);
                const s = remainInPhase % 60;
                return `${m}:${String(s).padStart(2, '0')}`;
              })()}
            </span>
          )}
          <Timer
            totalSeconds={remainingSeconds}
            onExpire={handleTimeExpired}
            onTick={setLiveRemainingSeconds}
            testId={testId}
            token={token}
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          {/* Tab switch count */}
          {tabSwitchCount > 0 && (
            <div
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-mono font-bold ${
                tabSwitchCount > MAX_TAB_SWITCHES - 2
                  ? 'bg-alert/15 text-alert'
                  : 'bg-accent/15 text-accent'
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {MAX_TAB_SWITCHES - tabSwitchCount}
            </div>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="btn-ghost-icon hidden sm:flex"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isFullscreen ? (
                <path strokeLinecap="round" d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
              ) : (
                <path strokeLinecap="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
          </button>

          {/* Toggle palette */}
          <button
            onClick={() => setShowPalette(v => !v)}
            className="btn-ghost-icon hidden md:flex"
            title={showPalette ? 'Hide question list' : 'Show question list'}
            aria-label={showPalette ? 'Hide question list' : 'Show question list'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {showPalette ? (
                <path strokeLinecap="round" d="M9 9h6v6H9zM3 3h18v18H3z" />
              ) : (
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Submit button */}
          <Btn variant="success" size="sm" onClick={() => setConfirmSubmit(true)}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M5 13l4 4L19 7" />
            </svg>
            Submit
          </Btn>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Sections + Question ────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Section tabs */}
          <div className="flex gap-1 px-3 pt-2.5 pb-1.5 bg-panel border-b border-rim shrink-0 overflow-x-auto">
            {test.sections.map((sec, si) => {
              const tabLocked = mcqLocked && sec.type === 'aptitude';
              return (
              <button
                key={sec.id}
                onClick={() => navigateQ(si, 0)}
                disabled={tabLocked}
                title={tabLocked ? 'MCQ round has ended' : undefined}
                className={`tab-btn ${currentSection === si ? 'tab-btn--active' : ''} ${tabLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {tabLocked && (
                  <svg className="w-3 h-3 inline mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {sec.name}
                <span className="ml-1.5 font-mono text-2xs opacity-60">
                  {sec.type === 'coding' && selectedProblems.length > 0
                    ? sec.questions.filter(qq => selectedProblems.includes(qq.id)).filter(qq => isAnswered(sec, qq)).length
                    : sec.questions.filter(qq => isAnswered(sec, qq)).length
                  }
                  /
                  {sec.type === 'coding' && selectedProblems.length > 0
                    ? sec.questions.filter(qq => selectedProblems.includes(qq.id)).length
                    : sec.questions.length
                  }
                </span>
              </button>
              );
            })}
          </div>

          {/* Question Area */}
          <div className="flex-1 overflow-y-auto">
            {isAptitude ? (
              <AptitudeQuestion
                q={displayQ}
                qi={currentQ}
                answers={answers}
                setAnswer={setAnswer}
                flagged={flagged}
                toggleFlag={toggleFlag}
                isAnswered={isAnswered(section, displayQ)}
                onPrev={goPrev}
                onNext={goNext}
                isLast={isLastQuestion}
                onConfirmSubmit={() => setConfirmSubmit(true)}
              />
            ) : displayQ ? (
              <CodingQuestion
                q={displayQ}
                qi={currentQ}
                section={section}
                codeSolutions={codeSolutions}
                setCode={setCode}
                activeLang={activeLang}
                setActiveLang={setActiveLang}
                allowedLangs={allowedLangs}
                flagged={flagged}
                toggleFlag={toggleFlag}
                runResult={runResult}
                runLoading={runLoading}
                onRunCode={handleRunCode}
                testResults={testResults}
                testLoading={testLoading}
                onRunAllTests={handleRunAllTests}
                onPrev={goPrev}
                onNext={goNext}
                isLast={isLastQuestion}
                onConfirmSubmit={() => setConfirmSubmit(true)}
              />
            ) : null}
          </div>
        </div>

        {/* ── Right Panel: Question Palette ──────────────── */}
        {showPalette && (
          <QuestionPalette
            sections={test.sections}
            currentSection={currentSection}
            currentQ={currentQ}
            flagged={flagged}
            isAnswered={isAnswered}
            onNavigate={navigateQ}
            selectedProblems={selectedProblems}
          />
        )}
      </div>

      {/* ── Confirm Submit Modal ─────────────────────────── */}
      {/* Screen-reader accessible live region for tab-switch warnings */}
      <div
        role="alert"
        aria-live="assertive"
        className="sr-only"
      >
        {tabSwitchCount > 0 && `Tab switch ${tabSwitchCount} of ${MAX_TAB_SWITCHES}`}
      </div>

      <ConfirmSubmitModal
        isOpen={confirmSubmit}
        onClose={() => !submitting && setConfirmSubmit(false)}
        answeredCount={answeredCount}
        totalQ={totalQ}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
