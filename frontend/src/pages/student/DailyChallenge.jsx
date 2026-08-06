import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import { Btn, Badge, Spinner, Alert } from '../../components/shared/UI';
import toast from 'react-hot-toast';
import { Zap, Clock, Code, CheckCircle, XCircle, ChevronRight } from 'lucide-react';

export default function DailyChallenge() {
  const [answer, setAnswer] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['daily-challenge'],
    queryFn: gamificationAPI.getDailyChallenge,
    refetchInterval: 60000,
  });

  const submitMut = useMutation({
    mutationFn: gamificationAPI.submitDailyChallenge,
    onSuccess: (data) => {
      setResult(data);
      setSubmitted(true);
      if (data.correct) {
        toast.success(`Correct! +${data.xpAwarded} XP`);
      } else {
        toast('Incorrect. You earned some XP for trying.', { icon: '💪' });
      }
      if (data.newAchievements?.length) {
        data.newAchievements.forEach(a => toast.success(`Achievement: ${a.name}`));
      }
    },
    onError: () => toast.error('Failed to submit'),
  });

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const diff = tomorrow - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  const challenge = data?.challenge;

  if (!challenge) {
    return (
      <div className="animate-fade-up">
        <div className="section-header">
          <h1 className="text-display">Daily Challenge</h1>
          <p className="section-subtitle">No challenge available today</p>
        </div>
        <div className="empty-state py-16">
          <Clock size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">Next challenge in {timeLeft}</h3>
        </div>
      </div>
    );
  }

  const question = challenge.question;
  const isMcq = challenge.type === 'mcq';
  const isCompleted = challenge.submitted || submitted;

  const handleSubmit = () => {
    if (!answer && isMcq) return toast.error('Please select an answer');
    submitMut.mutate({ challengeId: challenge.id, answer });
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Daily Challenge</h1>
          <p className="section-subtitle">Complete today's challenge for bonus XP</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock size={14} className="text-accent" />
          <span className="font-mono text-accent font-bold">{timeLeft}</span>
          <span className="text-annotation text-xs">until next</span>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <Badge color="clarify">{isMcq ? 'MCQ' : 'Coding'}</Badge>
          <span className="text-xs text-annotation">+{challenge.xp_reward} XP</span>
        </div>

        {question && (
          <>
            <h3 className="text-base font-display font-bold text-ink mb-4">{question.text || question.title}</h3>

            {isMcq && question.options && !isCompleted && (
              <div className="space-y-2 mb-4">
                {Object.entries(question.options).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setAnswer(key)}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                      answer === key
                        ? 'border-accent bg-accent/5 text-ink font-medium'
                        : 'border-rim text-annotation hover:border-accent/30'
                    }`}
                  >
                    <span className="font-mono mr-2">{key}.</span> {value}
                  </button>
                ))}
              </div>
            )}

            {isMcq && isCompleted && result && (
              <Alert type={result.correct ? 'success' : 'error'}>
                {result.correct
                  ? `Correct! You earned ${result.xpAwarded} XP.`
                  : `Not quite right. You earned ${result.xpAwarded} XP for trying.`
                }
              </Alert>
            )}

            {!isMcq && !isCompleted && (
              <textarea
                className="textarea-field mb-4 font-mono text-sm"
                rows={8}
                placeholder="Write your solution here..."
                aria-label="Write your solution here"
                value={answer || ''}
                onChange={e => setAnswer(e.target.value)}
              />
            )}

            {!isCompleted && (
              <Btn onClick={handleSubmit} disabled={submitMut.isPending} className="w-full">
                {submitMut.isPending ? 'Submitting...' : 'Submit Answer'}
              </Btn>
            )}

            {isCompleted && result && (
              <div className="mt-4">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5">
                  <Zap size={16} className="text-accent" />
                  <span className="text-sm text-ink font-medium">+{result.xpAwarded} XP earned</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
