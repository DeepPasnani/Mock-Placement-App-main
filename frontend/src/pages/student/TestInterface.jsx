import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { testsAPI, submissionsAPI, shuffleAPI, submissionsAPIExtended } from '../../services/api';
import { useStore } from '../../store';
import Timer from '../../components/shared/Timer';
import { Btn, Modal, Spinner } from '../../components/shared/UI';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';

import AptitudeQuestion from './AptitudeQuestion';
import CodingQuestion from './CodingQuestion';
import QuestionPalette from './QuestionPalette';
import ConfirmSubmitModal from './ConfirmSubmitModal';
import CodingProblemSelection from './CodingProblemSelection';
import FullScreenEnforcer from '../../components/shared/FullScreenEnforcer';
import { lockdownService } from '../../services/lockdown';
import { fingerprintService } from '../../services/fingerprint';

const LANG_MAP = {
  python: 'python',
  javascript: 'javascript',
  java: 'java',
  cpp: 'cpp',
};

const AUTO_SAVE_INTERVAL = 30000;
const MAX_TAB_SWITCHES = 5;
const FINGERPRINT_INTERVAL = 60000;

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
  const [submissionId, setSubmissionId] = useState(null);

  const [questionOrder, setQuestionOrder] = useState(null);
  const [optionOrders, setOptionOrders] = useState(null);
  const [timeBombs, setTimeBombs] = useState({});



  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const fingerprintRef = useRef(null);

  const autoSaveRef = useRef(null);
  const lockdownApplied = useRef(false);

  const { data: testData, isLoading: loadingTest } = useQuery({
    queryKey: ['test-full', testId],
    queryFn: () => testsAPI.get(testId),
  });

  const { data: shuffleData } = useQuery({
    queryKey: ['shuffle', testId],
    queryFn: () => shuffleAPI.get(testId),
    enabled: !!testStarted,
  });

  const startMut = useMutation({
    mutationFn: submissionsAPI.start,
    onSuccess: async (data) => {
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
      setSubmissionId(data.submission.id);

      await shuffleAPI.assign(testId);
      if (!shuffleData?.shuffled) {
        try {
          const sd = await shuffleAPI.get(testId);
          if (sd.shuffled) {
            setQuestionOrder(sd.questionOrder);
            setOptionOrders(sd.optionOrders);
          }
        } catch {}
      } else {
        setQuestionOrder(shuffleData.questionOrder);
        setOptionOrders(shuffleData.optionOrders);
      }

      try {
        const bombData = await submissionsAPIExtended.getTimeBombStatus(testId);
        if (bombData?.bombs) {
          const bombMap = {};
          bombData.bombs.forEach(b => { bombMap[b.questionId] = b; });
          setTimeBombs(bombMap);
        }
      } catch {}
    },
    onError: (e) => {
      toast.error(e.response?.data?.error || 'Failed to start test');
      navigate('/student');
    },
  });

  const saveMut = useMutation({ mutationFn: submissionsAPI.save });
  const submitMut = useMutation({
    mutationFn: submissionsAPI.submit,
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

  useEffect(() => {
    if (testData && !testStarted) {
      startMut.mutate(testId);
    }
  }, [testData]);

  useEffect(() => {
    if (!testStarted || !submissionId) return;
    fingerprintRef.current = setInterval(async () => {
      try {
        await fingerprintService.verify(submissionId);
      } catch {}
    }, FINGERPRINT_INTERVAL);
    fingerprintService.send(submissionId);
    return () => {
      if (fingerprintRef.current) clearInterval(fingerprintRef.current);
    };
  }, [testStarted, submissionId]);

  useEffect(() => {
    if (!testStarted) return;
    autoSaveRef.current = setInterval(() => {
      saveMut.mutate({
        testId,
        answers,
        codeSolutions,
        flaggedQuestions: Array.from(flagged),
        tabSwitchCount,
        selectedProblems,
      });
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(autoSaveRef.current);
  }, [testStarted, answers, codeSolutions, flagged, tabSwitchCount, selectedProblems]);

  useEffect(() => {
    if (!testStarted || lockdownApplied.current) return;
    lockdownService.enable((msg) => toast(msg, { icon: '⚠️', duration: 2000 }));
    lockdownApplied.current = true;
    return () => {
      lockdownService.disable();
      lockdownApplied.current = false;
    };
  }, [testStarted]);

  useEffect(() => {
    return () => {
      lockdownService.disable();
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = 'Your progress is auto-saved. Are you sure?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    if (!testStarted) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const newCount = tabSwitchCount + 1;
        setTabSwitchCount(newCount);
        if (newCount > MAX_TAB_SWITCHES) {
          toast.error('Tab switch limit exceeded — submitting test.');
          handleSubmit({ autoSubmitted: true });
        } else {
          setShowTabWarning(true);
          setTimeout(() => setShowTabWarning(false), 3000);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [testStarted, tabSwitchCount]);

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
  }, [liveRemainingSeconds, testData, currentSection]);

  useEffect(() => {
    if (!testStarted || !submissionId) return;
    const interval = setInterval(async () => {
      try {
        const bombs = await submissionsAPIExtended.getTimeBombStatus(testId);
        if (bombs?.bombs) {
          const bombMap = {};
          bombs.bombs.forEach(b => { bombMap[b.questionId] = b; });
          setTimeBombs(bombMap);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [testStarted, submissionId, testId]);

  const handleSubmit = useCallback(async (opts = {}) => {
    setSubmitting(true);
    setConfirmSubmit(false);
    submitMut.mutate({
      testId,
      answers,
      codeSolutions,
      flaggedQuestions: Array.from(flagged),
      tabSwitchCount,
      selectedProblems,
      autoSubmitted: opts.autoSubmitted || false,
    });
  }, [testId, answers, codeSolutions, flagged, tabSwitchCount, selectedProblems]);

  const handleTimeExpired = useCallback(() => {
    setTimeExpired(true);
    handleSubmit({ autoSubmitted: true });
  }, [handleSubmit]);

  const handleFullscreenViolation = useCallback(async (count) => {
    setFullscreenExitCount(count);
    setTabSwitchCount(prev => prev + 1);
    if (submissionId) {
      try {
        await submissionsAPIExtended.fullscreenViolation({ submissionId, exitCount: count, testId });
      } catch {}
    }
  }, [submissionId, testId]);

  const handleFullscreenThresholdExceeded = useCallback(() => {
    toast.error('Fullscreen exit limit exceeded — submitting test.');
    handleSubmit({ autoSubmitted: true });
  }, [handleSubmit]);

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
  const totalQ = test?.sections?.reduce((n, s) => n + (s.type === 'aptitude' ? s.questions.length : 0), 0) || 0;
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

  const codingSection = section?.type === 'coding' && section?.questions?.length > 3
    ? section
    : null;
  const hasSelectedCodingProblems = codingSection
    ? selectedProblems.some(id => codingSection.questions.some(q => q.id === id))
    : true;

  const displayQuestions = codingSection && hasSelectedCodingProblems
    ? section.questions.filter(q => selectedProblems.includes(q.id))
    : section?.questions || [];

  const sectionQuestionOrder = questionOrder?.[section?.id] || [];
  const sortedDisplayQuestions = section?.type === 'aptitude' && sectionQuestionOrder.length > 0
    ? [...displayQuestions].sort((a, b) => sectionQuestionOrder.indexOf(a.id) - sectionQuestionOrder.indexOf(b.id))
    : displayQuestions;

  const displayQ = sortedDisplayQuestions[currentQ] || sortedDisplayQuestions[0];

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
    if (currentQ < sortedDisplayQuestions.length - 1) {
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
      const prevQuestions = prevSec?.type === 'aptitude' && questionOrder?.[prevSec.id]
        ? [...(prevSec.questions || [])].sort((a, b) => (questionOrder[prevSec.id].indexOf(a.id) - questionOrder[prevSec.id].indexOf(b.id)))
        : prevSec?.questions || [];
      navigateQ(currentSection - 1, prevQuestions.length - 1);
    }
  };

  const isLastQuestion =
    currentQ === sortedDisplayQuestions.length - 1 &&
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

  if (codingSection && !hasSelectedCodingProblems) {
    return <CodingProblemSelection
      section={codingSection}
      selectedProblems={selectedProblems}
      setSelectedProblems={setSelectedProblems}
      codeSolutions={codeSolutions}
      onConfirm={() => {
        saveMut.mutate({ testId, answers, codeSolutions, flaggedQuestions: Array.from(flagged), selectedProblems });
        setCurrentQ(0);
      }}
    />;
  }

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

  const bombInfo = displayQ ? timeBombs[displayQ.id] : null;

  return (
    <div className="h-screen flex flex-col bg-deck text-ink overflow-hidden exam-mode">
      <FullScreenEnforcer
        enabled={testStarted}
        onViolation={handleFullscreenViolation}
        onThresholdExceeded={handleFullscreenThresholdExceeded}
      />

      <header className="h-14 bg-panel border-b border-rim flex items-center justify-between px-3 sm:px-4 shrink-0 z-50">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-sm text-ink truncate max-w-40 sm:max-w-56">
            {test.title}
          </span>
          <span className="text-xs text-annotation/60 hidden sm:block font-mono">
            {answeredCount}/{totalQ}
          </span>
        </div>

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

        <div className="flex items-center gap-1.5">
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

          <Btn variant="success" size="sm" onClick={() => setConfirmSubmit(true)}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M5 13l4 4L19 7" />
            </svg>
            Submit
          </Btn>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
                timeBomb={bombInfo}
              />
            ) : displayQ ? (
              <div>
                {bombInfo?.enabled && bombInfo.expired && (
                  <div className="max-w-3xl mx-auto p-4 sm:p-5">
                    <div className="panel p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-alert/15 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-base font-display font-bold text-ink mb-1">Question Expired</h3>
                      <p className="text-sm text-annotation">This time-limited question is no longer available.</p>
                    </div>
                  </div>
                )}
                {(!bombInfo?.enabled || !bombInfo.expired) && (
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
                    timeBomb={bombInfo}
                    submissionId={submissionId}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>

        {showPalette && (
          <QuestionPalette
            sections={test.sections}
            currentSection={currentSection}
            currentQ={currentQ}
            flagged={flagged}
            isAnswered={isAnswered}
            onNavigate={navigateQ}
            selectedProblems={selectedProblems}
            questionOrder={questionOrder}
            optionOrders={optionOrders}
          />
        )}
      </div>

      <div role="alert" aria-live="assertive" className="sr-only">
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
