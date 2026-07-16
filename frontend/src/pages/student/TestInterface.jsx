import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import { testsAPI, submissionsAPI } from '../../services/api';
import { useStore } from '../../store';
import Timer from '../../components/shared/Timer';
import { Btn, Modal, Alert, Spinner } from '../../components/shared/UI';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';

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

/* ═══════════════════════════════════════════════════════════
 * AptitudeQuestion
 * ═══════════════════════════════════════════════════════════ */
function AptitudeQuestion({
  q, qi, answers, setAnswer, flagged, toggleFlag,
  isAnswered, onPrev, onNext, isLast, onConfirmSubmit,
}) {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-5 animate-fade-up">
      {/* Question header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-annotation">Q{qi + 1}</span>
          <DifficultyBadge level={q.difficulty} />
          <span className="badge-clarify">{q.marks} marks</span>
          {q.type === 'msq' && <span className="badge-accent">multi-select</span>}
        </div>
        <button
          onClick={() => toggleFlag(q.id)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors font-medium ${
            flagged.has(q.id)
              ? 'bg-accent/15 text-accent'
              : 'text-annotation hover:bg-panel hover:text-ink'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={flagged.has(q.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M3 21V4a1 1 0 011-1h12a1 1 0 01.8.4l2 2.6a1 1 0 010 1.2l-2 2.6A1 1 0 0116 10H4m7 11l-3-3m0 0l3-3m-3 3h10" />
          </svg>
          {flagged.has(q.id) ? 'Flagged' : 'Flag'}
        </button>
      </div>

      {/* Question text */}
      <div className="panel p-4 mb-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{q.text}</p>
        {q.image_url && (
          <img
            src={q.image_url}
            alt="Question reference"
            loading="lazy"
            className="mt-3 max-w-full max-h-56 rounded-lg object-contain border border-rim"
          />
        )}
      </div>

      {/* Options */}
      {(q.type === 'mcq' || q.type === 'msq') && (
        <div className="space-y-2 mb-4">
          {(q.options || []).map((opt, i) => {
            const sel =
              q.type === 'msq'
                ? Array.isArray(answers[q.id]) && answers[q.id].includes(i)
                : answers[q.id] === i;
            return (
              <label
                key={i}
                className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                  sel
                    ? 'border-accent bg-accent/8'
                    : 'border-rim bg-panel hover:border-annotation/30'
                }`}
              >
                <input
                  type={q.type === 'msq' ? 'checkbox' : 'radio'}
                  name={`q_${q.id}`}
                  checked={sel}
                  onChange={() => {
                    if (q.type === 'msq') {
                      const cur = Array.isArray(answers[q.id]) ? [...answers[q.id]] : [];
                      const idx = cur.indexOf(i);
                      idx > -1 ? cur.splice(idx, 1) : cur.push(i);
                      setAnswer(q.id, cur);
                    } else {
                      setAnswer(q.id, i);
                    }
                  }}
                  className="mt-0.5 accent-accent shrink-0 w-4 h-4"
                />
                <div className="min-w-0">
                  <span className="text-sm text-ink">
                    <span className="font-mono text-annotation mr-1.5">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </span>
                  {q.option_images?.[i] && (
                    <img src={q.option_images[i]} alt="" loading="lazy" className="mt-2 max-h-20 rounded-lg object-contain" />
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'truefalse' && (
        <div className="flex gap-2 mb-4">
          {['True', 'False'].map(v => (
            <label
              key={v}
              className={`flex-1 flex items-center justify-center gap-2 p-3.5 rounded-lg border cursor-pointer transition-all text-sm font-medium ${
                answers[q.id] === v
                  ? 'border-accent bg-accent/8 text-accent'
                  : 'border-rim text-annotation hover:border-annotation/30'
              }`}
            >
              <input
                type="radio"
                name={`q_${q.id}`}
                checked={answers[q.id] === v}
                onChange={() => setAnswer(q.id, v)}
                className="accent-accent"
              />
              {v}
            </label>
          ))}
        </div>
      )}

      {(q.type === 'fillblank' || q.type === 'numerical') && (
        <div className="mb-4">
          <input
            value={answers[q.id] || ''}
            onChange={e => setAnswer(q.id, e.target.value)}
            placeholder={q.type === 'numerical' ? 'Enter numeric answer…' : 'Type your answer…'}
            className="input-field max-w-xs"
            autoComplete="off"
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-rim">
        <button
          onClick={() => setAnswer(q.id, undefined)}
          className="text-xs text-annotation/60 hover:text-alert transition-colors"
        >
          Clear response
        </button>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={onPrev}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </Btn>
          {isLast ? (
            <Btn variant="success" size="sm" onClick={onConfirmSubmit}>
              Submit
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7" />
              </svg>
            </Btn>
          ) : (
            <Btn variant="primary" size="sm" onClick={onNext}>
              Next
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7" />
              </svg>
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * CodingQuestion
 * ═══════════════════════════════════════════════════════════ */
function CodingQuestion({
  q, qi, section, codeSolutions, setCode, activeLang, setActiveLang,
  allowedLangs, flagged, toggleFlag, runResult, runLoading, onRunCode, testResults, testLoading, onRunAllTests,
  onPrev, onNext, isLast, onConfirmSubmit,
}) {
  const code = codeSolutions[q.id]?.[activeLang] || q.starter_code?.[activeLang] || '';

  const handleChange = (value) => setCode(q.id, activeLang, value);

  return (
    <div className="max-w-5xl mx-auto flex flex-col flex-1 p-4 sm:p-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-annotation">Q{qi + 1}</span>
          <DifficultyBadge level={q.difficulty} />
          <span className="badge-clarify">{q.marks} marks</span>
        </div>
        <button
          onClick={() => toggleFlag(q.id)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors font-medium ${
            flagged.has(q.id)
              ? 'bg-accent/15 text-accent'
              : 'text-annotation hover:bg-panel hover:text-ink'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={flagged.has(q.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M3 21V4a1 1 0 011-1h12a1 1 0 01.8.4l2 2.6a1 1 0 010 1.2l-2 2.6A1 1 0 0116 10H4m7 11l-3-3m0 0l3-3m-3 3h10" />
          </svg>
          {flagged.has(q.id) ? 'Flagged' : 'Flag'}
        </button>
      </div>

      {/* Problem statement */}
      <div className="panel p-4 mb-4">
        <h3 className="font-display font-bold text-base text-ink mb-2">
          {q.title || `Problem ${qi + 1}`}
        </h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink mb-3">{q.description}</p>
        {q.input_format && (
          <div className="space-y-1 text-xs">
            <p className="font-mono text-annotation font-semibold">Input Format</p>
            <p className="font-mono text-ink bg-deck p-2 rounded">{q.input_format}</p>
          </div>
        )}
        {q.output_format && (
          <div className="space-y-1 text-xs mt-2">
            <p className="font-mono text-annotation font-semibold">Output Format</p>
            <p className="font-mono text-ink bg-deck p-2 rounded">{q.output_format}</p>
          </div>
        )}
        {q.constraints && (
          <div className="space-y-1 text-xs mt-2">
            <p className="font-mono text-annotation font-semibold">Constraints</p>
            <p className="font-mono text-ink bg-deck p-2 rounded">{q.constraints}</p>
          </div>
        )}
        {q.sample_input && q.sample_output && (
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div>
              <p className="font-mono text-annotation font-semibold mb-1">Sample Input</p>
              <pre className="font-mono text-ink bg-deck p-2 rounded whitespace-pre-wrap">{q.sample_input}</pre>
            </div>
            <div>
              <p className="font-mono text-annotation font-semibold mb-1">Sample Output</p>
              <pre className="font-mono text-verify bg-deck p-2 rounded whitespace-pre-wrap">{q.sample_output}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Language selector */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs font-medium text-annotation">Language</label>
        <select
          value={activeLang}
          onChange={e => setActiveLang(e.target.value)}
          className="select-field w-auto min-w-[160px] text-sm"
        >
          {allowedLangs.map(l => (
            <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <Editor
          height="100%"
          language={LANG_MAP[activeLang] || 'text'}
          theme="light"
          value={code}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            folding: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            cursorBlinking: 'phase',
            renderLineHighlight: 'line',
          }}
        />

        {/* Run result */}
        {/* Run All Tests button */}
      <div className="flex gap-2 mb-3">
        <Btn variant="primary" size="sm" onClick={onRunAllTests} disabled={testLoading || runLoading}>
          {testLoading ? <Spinner size={14} /> : '▶ Run All Visible Tests'}
        </Btn>
      </div>

      {/* Per-test-case results */}
      {testResults && testResults.length > 0 && (
        <div className="panel p-3 rounded-lg mb-3">
          <div className="text-xs font-mono font-bold text-annotation mb-2">
            Test Results ({testResults.filter(r => r.passed).length}/{testResults.length} passed)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-annotation/60 border-b border-rim">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Input</th>
                  <th className="text-left py-1 pr-2">Expected</th>
                  <th className="text-left py-1 pr-2">Got</th>
                  <th className="text-right py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((tr, i) => (
                  <tr key={i} className="border-b border-rim/50">
                    <td className="py-1.5 pr-2 text-annotation">{i + 1}</td>
                    <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.input}</td>
                    <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.expected}</td>
                    <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.actual}</td>
                    <td className="py-1.5 text-right">
                      <span className={tr.passed ? 'text-verify' : 'text-alert'}>
                        {tr.passed ? '✅ Pass' : '❌ Fail'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {runResult && (
          <div className={`panel mt-3 p-3 rounded-lg border ${
            runResult.output?.includes('error') || runResult.stderr
              ? 'border-alert/30 bg-alert/5'
              : 'border-verify/30 bg-verify/5'
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono font-bold text-annotation">Output</span>
              <span className={`text-2xs font-mono ${
                runResult.output?.includes('error') || runResult.stderr ? 'text-alert' : 'text-verify'
              }`}>
                {runResult.output?.includes('error') || runResult.stderr ? 'Error' : 'Success'}
              </span>
            </div>
            <pre className="font-mono text-xs text-ink/90 bg-deck p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
              {runResult.stdout || runResult.output || runResult.stderr || 'No output'}
            </pre>
            {runResult.time_ms && (
              <p className="text-2xs text-annotation/60 mt-1 font-mono">
                Time: {runResult.time_ms}ms · Memory: {runResult.memory_mb || 0} MB
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-rim">
        <button
          onClick={() => setCode(q.id, activeLang, '')}
          className="text-xs text-annotation/60 hover:text-alert transition-colors"
        >
          Clear code
        </button>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={onPrev}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </Btn>
          {isLast ? (
            <Btn variant="success" size="sm" onClick={onConfirmSubmit}>
              Submit
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7" />
              </svg>
            </Btn>
          ) : (
            <Btn variant="primary" size="sm" onClick={onNext}>
              Next
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7" />
              </svg>
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Confirm Submit Modal
 * ═══════════════════════════════════════════════════════════ */
function ConfirmSubmitModal({ isOpen, onClose, answeredCount, totalQ, submitting, onSubmit }) {
  const remaining = totalQ - answeredCount;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Submit Test?" width="max-w-sm">
      <Alert type="warning" className="mb-4">
        This will permanently submit your test. You cannot make changes after submission.
      </Alert>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="panel p-4 text-center">
          <div className="text-2xs text-annotation mb-1 font-mono uppercase tracking-wider">Answered</div>
          <div className="text-2xl font-display font-bold text-verify score-digit">{answeredCount}</div>
        </div>
        <div className="panel p-4 text-center">
          <div className="text-2xs text-annotation mb-1 font-mono uppercase tracking-wider">Remaining</div>
          <div className={`text-2xl font-display font-bold score-digit ${remaining > 0 ? 'text-accent' : 'text-annotation'}`}>{remaining}</div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Btn variant="ghost" onClick={onClose} disabled={submitting}>
          Continue Test
        </Btn>
        <Btn variant="success" onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <><Spinner size={14} className="text-deck" /> Submitting…</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg> Confirm Submit</>
          )}
        </Btn>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Question Palette (right sidebar)
 * ═══════════════════════════════════════════════════════════ */
function QuestionPalette({ sections, currentSection, currentQ, flagged, isAnswered, onNavigate, selectedProblems = [] }) {
  return (
    <div className="w-48 bg-panel border-l border-rim overflow-y-auto shrink-0 hidden md:block">
      <div className="p-3">
        <div className="text-2xs font-semibold text-annotation uppercase tracking-wider mb-3 font-mono">
          Questions
        </div>
        {sections.map((sec, si) => {
          const isCodingWithSelection = sec.type === 'coding' && selectedProblems.length > 0;
          const displayQuestions = isCodingWithSelection
            ? sec.questions.filter(qq => selectedProblems.includes(qq.id))
            : sec.questions;

          return (
            <div key={sec.id} className="mb-4">
              <div className="text-xs font-medium text-annotation/70 mb-2">{sec.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {displayQuestions.map((qq, qi) => {
                  const ans = isAnswered(sec, qq);
                  const cur = si === currentSection && qi === currentQ;
                  const flg = flagged.has(qq.id);
                  const cls = cur
                    ? 'q-grid-btn--current'
                    : ans
                    ? 'q-grid-btn--answered'
                    : flg
                    ? 'q-grid-btn--flagged'
                    : 'q-grid-btn--default';
                  return (
                    <button
                      key={qq.id}
                      onClick={() => onNavigate(si, qi)}
                      className={`q-grid-btn ${cls}`}
                    >
                      {qi + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="mt-4 space-y-1.5 pt-3 border-t border-rim">
          {[
            ['q-grid-btn--current', 'Current'],
            ['q-grid-btn--answered', 'Answered'],
            ['q-grid-btn--flagged', 'Flagged'],
            ['q-grid-btn--default', 'Unanswered'],
          ].map(([cls, lbl]) => (
            <div key={lbl} className="flex items-center gap-1.5 text-2xs text-annotation">
              <span className={`w-3 h-3 rounded border ${cls} inline-block shrink-0`} />
              {lbl}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Coding Problem Selection — Choose 3 of 5
 * Masterplan constraint: max 2 easy, max 1 hard
 * ═══════════════════════════════════════════════════════════ */
function CodingProblemSelection({ section, selectedProblems, setSelectedProblems, codeSolutions, onConfirm }) {
  const problems = section.questions;
  const easyCount = problems.filter(p => p.difficulty === 'easy').length;
  const hardCount = problems.filter(p => p.difficulty === 'hard').length;

  const toggleProblem = (id, difficulty) => {
    setSelectedProblems(prev => {
      if (prev.includes(id)) {
        return prev.filter(pid => pid !== id);
      }
      if (prev.length >= 3) return prev; // max 3

      // Constraint: max 2 easy
      if (difficulty === 'easy') {
        const selectedEasy = problems.filter(p => prev.includes(p.id) && p.difficulty === 'easy').length;
        if (selectedEasy >= 2) {
          toast.error('You cannot select more than 2 easy problems.');
          return prev;
        }
      }
      // Constraint: max 1 hard
      if (difficulty === 'hard') {
        const selectedHard = problems.filter(p => prev.includes(p.id) && p.difficulty === 'hard').length;
        if (selectedHard >= 1) {
          toast.error('You can only select at most 1 hard problem.');
          return prev;
        }
      }

      return [...prev, id];
    });
  };

  const alreadyHasCode = (id) =>
    Object.values(codeSolutions[id] || {}).some(c => c?.trim());

  const canConfirm = selectedProblems.length >= 1 && selectedProblems.length <= 3;

  return (
    <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
      <div className="max-w-2xl w-full animate-fade-up">
        <div className="mb-6">
          <h2 className="text-lg font-display font-bold text-ink mb-1">
            Select Your Coding Problems
          </h2>
          <p className="text-sm text-annotation">
            Choose <strong className="text-ink">up to 3</strong> out of {problems.length} problems.
            You may select at most 2 easy and at most 1 hard problem.
          </p>
        </div>

        <div className="space-y-2.5 mb-6">
          {problems.map((p, i) => {
            const selected = selectedProblems.includes(p.id);
            const hasCode = alreadyHasCode(p.id);
            const difficultyBadge = p.difficulty === 'easy' ? (
              <span className="badge-verify text-2xs">EASY</span>
            ) : p.difficulty === 'hard' ? (
              <span className="badge-alert text-2xs">HARD</span>
            ) : (
              <span className="badge-accent text-2xs">MED</span>
            );

            return (
              <label
                key={p.id}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all $
                  selected
                    ? 'border-accent bg-accent/8'
                    : 'border-rim bg-panel hover:border-annotation/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleProblem(p.id, p.difficulty)}
                  className="mt-1 accent-accent w-4 h-4 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-ink">
                      {difficultyBadge} {p.title || `Problem ${i + 1}`}
                    </span>
                    {hasCode && (
                      <span className="badge-accent text-2xs">Has code</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-annotation/70">
                    {difficultyBadge}
                    <span className="font-mono">{p.marks} marks</span>
                    {p.tags && (
                      <span>{p.tags.split(',').slice(0, 2).join(', ')}</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-rim pt-4">
          <div className="text-sm text-annotation">
            <span className="font-bold text-ink font-mono">{selectedProblems.length}</span>
            {' '}of{' '}
            <span className="font-mono">3</span>
            {' '}selected
          </div>
          <div className="flex gap-2">
            {selectedProblems.length > 0 && (
              <Btn variant="ghost" size="sm" onClick={() => setSelectedProblems([])}>
                Clear All
              </Btn>
            )}
            <Btn
              variant="primary"
              size="sm"
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7" />
              </svg>
              Confirm & Start Coding
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * DifficultyBadge
 * ═══════════════════════════════════════════════════════════ */
function DifficultyBadge({ level }) {
  const map = {
    easy:   'badge-verify',
    medium: 'badge-accent',
    hard:   'badge-alert',
  };
  const cls = map[level] || 'badge-annotation';
  return <span className={cls}>{level}</span>;
}