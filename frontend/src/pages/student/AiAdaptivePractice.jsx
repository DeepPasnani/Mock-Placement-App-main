import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { testsAPI, submissionsAPI } from '../../services/api';
import { aiAPI } from '../../services/ai';
import { Btn, Badge, Spinner, ProgressBar } from '../../components/shared/UI';
import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const DIFF_ICONS = {
  easy: { icon: TrendingDown, color: 'text-verify', label: 'Easy' },
  medium: { icon: Minus, color: 'text-accent', label: 'Medium' },
  hard: { icon: TrendingUp, color: 'text-alert', label: 'Hard' },
};

export default function AiAdaptivePractice() {
  const navigate = useNavigate();
  const [selectedTest, setSelectedTest] = useState('');
  const [adaptiveInfo, setAdaptiveInfo] = useState(null);

  const { data: testsData } = useQuery({
    queryKey: ['tests'],
    queryFn: testsAPI.list,
  });

  const adaptiveMut = useMutation({
    mutationFn: (testId) => aiAPI.getAdaptiveNext(testId),
    onSuccess: (data) => setAdaptiveInfo(data),
    onError: () => setAdaptiveInfo(null),
  });

  const tests = testsData?.tests?.filter(t => t.status === 'published') || [];

  const handleTestSelect = (testId) => {
    setSelectedTest(testId);
    if (testId) adaptiveMut.mutate(testId);
  };

  const startPractice = () => {
    if (selectedTest) navigate(`/test/${selectedTest}`);
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Adaptive Practice Mode</h1>
          <p className="section-subtitle">AI adjusts question difficulty based on your performance</p>
        </div>
      </div>

      <div className="panel p-5 space-y-4">
        <div>
          <label className="input-label">Select a test for adaptive practice</label>
          <select
            value={selectedTest}
            onChange={e => handleTestSelect(e.target.value)}
            className="select-field max-w-md"
          >
            <option value="">Choose a test...</option>
            {tests.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>

        {adaptiveMut.isLoading && (
          <div className="flex items-center gap-2 text-xs text-annotation">
            <Spinner size={14} /> Analyzing your performance...
          </div>
        )}

        {adaptiveInfo && (
          <div className="space-y-3 animate-fade-up">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="panel-muted p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {(() => {
                    const d = DIFF_ICONS[adaptiveInfo.recommendedDifficulty] || DIFF_ICONS.medium;
                    const Icon = d.icon;
                    return <Icon size={18} className={d.color} />;
                  })()}
                  <span className="text-sm font-bold">{adaptiveInfo.recommendedDifficulty?.toUpperCase()}</span>
                </div>
                <div className="text-2xs text-annotation/60">Recommended Difficulty</div>
              </div>

              <div className="panel-muted p-4 text-center">
                <div className={`text-lg font-bold font-mono ${adaptiveInfo.streak >= 0 ? 'text-verify' : 'text-alert'}`}>
                  {adaptiveInfo.streak > 0 ? '+' : ''}{adaptiveInfo.streak}
                </div>
                <div className="text-2xs text-annotation/60">Performance Streak</div>
              </div>

              <div className="panel-muted p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {adaptiveInfo.recentPerformance?.slice(-3).map((p, i) => (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded text-2xs font-mono flex items-center justify-center font-bold ${p >= 0.8 ? 'bg-verify/20 text-verify' : p >= 0.4 ? 'bg-accent/20 text-accent' : 'bg-alert/20 text-alert'}`}
                    >
                      {Math.round(p * 100)}%
                    </div>
                  ))}
                </div>
                <div className="text-2xs text-annotation/60 mt-1">Recent Scores</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Zap size={16} className="text-accent" />
              <span className="text-xs text-annotation">
                Adaptive mode will present questions at <strong className="text-ink">{adaptiveInfo.recommendedDifficulty}</strong> difficulty based on your recent performance.
              </span>
            </div>
          </div>
        )}

        {selectedTest && (
          <Btn onClick={startPractice} size="lg" className="w-full sm:w-auto">
            <Zap size={16} className="mr-1.5" />
            Start Adaptive Practice
          </Btn>
        )}
      </div>
    </div>
  );
}
