import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import { Btn, Badge, Spinner, ProgressBar, Select } from '../../components/shared/UI';
import toast from 'react-hot-toast';
import { Clock, Code, ChevronRight, Zap, CheckCircle, XCircle, BarChart3 } from 'lucide-react';

const STEPS = { SELECT: 0, MCQ: 1, CODING: 2, RESULTS: 3 };

export default function MockInterview() {
  const [step, setStep] = useState(STEPS.SELECT);
  const [difficulty, setDifficulty] = useState('medium');
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [mcqScore, setMcqScore] = useState(0);
  const [codingScore, setCodingScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentProblem, setCurrentProblem] = useState(0);
  const [code, setCode] = useState('');

  const startMut = useMutation({
    mutationFn: gamificationAPI.startMockInterview,
    onSuccess: (data) => {
      setSession(data.session);
      setStep(STEPS.MCQ);
      setTimeLeft(data.session.mcqQuestions?.length * 60 || 600);
      toast.success('Mock interview started!');
    },
    onError: () => toast.error('Failed to start interview'),
  });

  const completeMut = useMutation({
    mutationFn: gamificationAPI.completeMockInterview,
    onSuccess: (data) => {
      setResults(data);
      setStep(STEPS.RESULTS);
      toast.success(`Interview complete! +${data.xpAwarded} XP`);
    },
    onError: () => toast.error('Failed to complete interview'),
  });

  const mcqQ = session?.mcqQuestions || [];
  const codingP = session?.codingProblems || [];
  const current = mcqQ[currentQuestion];

  useEffect(() => {
    if (timeLeft <= 0 || step === STEPS.RESULTS) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          if (step === STEPS.MCQ) handleMcqComplete();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step, timeLeft, currentQuestion]);

  const handleMcqAnswer = (answer) => {
    const q = mcqQ[currentQuestion];
    const correctAnswer = typeof q.correct_answer === 'string'
      ? JSON.parse(q.correct_answer) : q.correct_answer;
    const correct = JSON.stringify(answer) === JSON.stringify(correctAnswer);
    setAnswers(prev => ({ ...prev, [q.id]: { answer, correct } }));
    if (correct) setMcqScore(s => s + (q.marks || 2));
  };

  const handleMcqComplete = () => {
    if (codingP.length > 0) {
      setStep(STEPS.CODING);
      setTimeLeft(codingP.length * 600 || 1200);
      toast('Coding round started!', { icon: '💻' });
    } else {
      completeMut.mutate({ sessionId: session.id });
    }
  };

  const handleCodingSubmit = (problemId, code) => {
    setAnswers(prev => ({ ...prev, [problemId]: { answer: code, correct: true } }));
    setCodingScore(s => s + (codingP.find(p => p.id === problemId)?.marks || 10));
  };

  const handleFinish = () => {
    completeMut.mutate({ sessionId: session.id });
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (step === STEPS.SELECT) {
    return (
      <div className="animate-fade-up space-y-5">
        <div className="section-header">
          <div>
            <h1 className="text-display">Mock Interview</h1>
            <p className="section-subtitle">Practice with timed MCQ and coding rounds</p>
          </div>
        </div>
        <div className="panel p-6 max-w-lg mx-auto">
          <h3 className="text-sm font-display font-bold text-ink mb-4">Configure Your Interview</h3>
          <div className="space-y-4">
            <Select label="Difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <div className="text-xs text-annotation space-y-2">
              <p>• 10 MCQ questions (timed)</p>
              <p>• 2 Coding problems (timed)</p>
              <p>• Scorecard with feedback</p>
            </div>
            <Btn onClick={() => startMut.mutate({ difficulty })} disabled={startMut.isPending} className="w-full">
              {startMut.isPending ? 'Starting...' : 'Start Interview'}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  if (step === STEPS.MCQ) {
    return (
      <div className="animate-fade-up space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge color="blue">MCQ Round</Badge>
            <span className="text-xs text-annotation">{currentQuestion + 1}/{mcqQ.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-mono">
            <Clock size={14} className={timeLeft < 60 ? 'text-alert' : 'text-accent'} />
            <span className={timeLeft < 60 ? 'text-alert font-bold' : 'text-ink'}>{formatTime(timeLeft)}</span>
          </div>
        </div>

        <ProgressBar value={currentQuestion + 1} max={mcqQ.length} color="bg-accent" />

        {current && (
          <div className="panel p-5">
            <h3 className="text-base font-display font-bold text-ink mb-4">{current.text}</h3>
            <div className="space-y-2">
              {Object.entries(current.options || {}).map(([key, value]) => {
                const isSelected = answers[current.id]?.answer === key;
                const isAnswered = !!answers[current.id];
                return (
                  <button
                    key={key}
                    onClick={() => !isAnswered && handleMcqAnswer(key)}
                    disabled={isAnswered}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                      isSelected
                        ? answers[current.id]?.correct
                          ? 'border-verify bg-verify/5 text-verify font-medium'
                          : 'border-alert bg-alert/5 text-alert font-medium'
                        : isAnswered
                          ? 'border-rim/30 text-annotation/50'
                          : 'border-rim text-annotation hover:border-accent/30'
                    }`}
                  >
                    <span className="font-mono mr-2">{key}.</span> {value}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Btn variant="ghost" onClick={() => setCurrentQuestion(i => Math.max(0, i - 1))} disabled={currentQuestion === 0}>
            Previous
          </Btn>
          {currentQuestion < mcqQ.length - 1 ? (
            <Btn onClick={() => setCurrentQuestion(i => i + 1)}>
              Next <ChevronRight size={14} />
            </Btn>
          ) : (
            <Btn onClick={handleMcqComplete}>
              Go to Coding Round <Code size={14} />
            </Btn>
          )}
        </div>
      </div>
    );
  }

  if (step === STEPS.CODING) {
    const problem = codingP[currentProblem];

    return (
      <div className="animate-fade-up space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge color="purple">Coding Round</Badge>
            <span className="text-xs text-annotation">{currentProblem + 1}/{codingP.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-mono">
            <Clock size={14} className={timeLeft < 120 ? 'text-alert' : 'text-accent'} />
            <span className={timeLeft < 120 ? 'text-alert font-bold' : 'text-ink'}>{formatTime(timeLeft)}</span>
          </div>
        </div>

        {problem && (
          <div className="panel p-5">
            <h3 className="text-base font-display font-bold text-ink mb-2">{problem.title}</h3>
            <div className="text-sm text-annotation/80 mb-4 whitespace-pre-wrap">{problem.description}</div>
            {problem.input_format && (
              <div className="mb-2">
                <p className="text-xs font-bold text-ink mb-1">Input Format:</p>
                <p className="text-xs text-annotation/70">{problem.input_format}</p>
              </div>
            )}
            {problem.output_format && (
              <div className="mb-2">
                <p className="text-xs font-bold text-ink mb-1">Output Format:</p>
                <p className="text-xs text-annotation/70">{problem.output_format}</p>
              </div>
            )}
            {problem.sample_input && (
              <div className="mb-2">
                <p className="text-xs font-bold text-ink mb-1">Sample Input:</p>
                <pre className="text-xs bg-sunken p-2 rounded text-ink/80 font-mono">{problem.sample_input}</pre>
              </div>
            )}
            {problem.sample_output && (
              <div className="mb-3">
                <p className="text-xs font-bold text-ink mb-1">Sample Output:</p>
                <pre className="text-xs bg-sunken p-2 rounded text-ink/80 font-mono">{problem.sample_output}</pre>
              </div>
            )}
            <textarea
              className="textarea-field font-mono text-sm"
              rows={10}
              placeholder="// Write your solution here"
              value={code}
              onChange={e => setCode(e.target.value)}
            />
            <div className="flex justify-between mt-3">
              <Btn variant="ghost" onClick={() => { setCurrentProblem(i => Math.max(0, i - 1)); setCode(''); }} disabled={currentProblem === 0}>
                Previous
              </Btn>
              {currentProblem < codingP.length - 1 ? (
                <Btn onClick={() => { handleCodingSubmit(problem.id, code); setCurrentProblem(i => i + 1); setCode(''); }}>
                  Next Problem <ChevronRight size={14} />
                </Btn>
              ) : (
                <Btn onClick={() => { handleCodingSubmit(problem.id, code); handleFinish(); }}>
                  Finish Interview
                </Btn>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === STEPS.RESULTS) {
    if (completeMut.isPending) {
      return (
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-accent" />
        </div>
      );
    }

    if (!results) {
      return <div className="empty-state py-16"><p className="empty-state-title">No results available</p></div>;
    }

    return (
      <div className="animate-fade-up space-y-5">
        <div className="section-header">
          <h1 className="text-display">Interview Complete!</h1>
          <p className="section-subtitle">Here's your performance summary</p>
        </div>

        <div className="panel p-6 text-center">
          <div className="text-4xl font-display font-bold text-accent mb-1">{results.percentage}%</div>
          <p className="text-sm text-annotation">Overall Score</p>
          <div className="flex justify-center gap-6 mt-4">
            <div>
              <div className="text-lg font-bold text-ink">{results.mcqScore}/{results.mcqScore + (results.codingScore > 0 ? 0 : 0)}</div>
              <p className="text-xs text-annotation">MCQ</p>
            </div>
            <div className="w-px bg-rim" />
            <div>
              <div className="text-lg font-bold text-ink">{results.codingScore}/{results.codingScore > 0 ? 0 : 0}</div>
              <p className="text-xs text-annotation">Coding</p>
            </div>
            <div className="w-px bg-rim" />
            <div>
              <div className="text-lg font-bold text-ink">+{results.xpAwarded}</div>
              <p className="text-xs text-annotation">XP Earned</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {(results.sectionFeedback || []).map((section, i) => (
            <div key={i} className="panel p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-display font-bold text-ink">{section.section}</h3>
                <Badge color={section.percentage >= 60 ? 'green' : 'yellow'}>{section.percentage}%</Badge>
              </div>
              <ProgressBar value={section.score} max={section.maxScore} color={section.percentage >= 60 ? 'bg-verify' : 'bg-accent'} />
              <div className="mt-2 space-y-1">
                {section.suggestions?.map((s, j) => (
                  <p key={j} className="text-xs text-annotation/70 flex items-start gap-1.5">
                    <span className="text-accent mt-0.5">•</span> {s}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Btn onClick={() => { setStep(STEPS.SELECT); setSession(null); setAnswers({}); setMcqScore(0); setCodingScore(0); setResults(null); }} className="w-full">
          Try Again
        </Btn>
      </div>
    );
  }

  return null;
}
