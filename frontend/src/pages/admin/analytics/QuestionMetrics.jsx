import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { analyticsAPI, testsAPI } from '../../../services/api';
import { Btn, Spinner, Modal } from '../../../components/shared/UI';

export default function QuestionMetrics() {
  const { testId } = useParams();
  const [selectedQ, setSelectedQ] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: testsData } = useQuery({ queryKey: 'tests', queryFn: testsAPI.list });
  const { data, isLoading } = useQuery({
    queryKey: ['question-metrics', testId],
    queryFn: () => analyticsAPI.questionMetrics(testId),
    enabled: !!testId,
  });

  const test = testsData?.tests?.find(t => t.id === testId);
  const questions = data?.questions || [];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return questions;
    const q = searchQuery.toLowerCase();
    return questions.filter(qq =>
      (qq.text || '').toLowerCase().includes(q) ||
      (qq.genre || '').toLowerCase().includes(q) ||
      (qq.difficulty || '').toLowerCase().includes(q)
    );
  }, [questions, searchQuery]);

  const getColor = (value, inverse = false) => {
    if (inverse) {
      if (value >= 70) return 'bg-alert/20 text-alert';
      if (value >= 40) return 'bg-accent/20 text-accent';
      return 'bg-verify/20 text-verify';
    }
    if (value >= 70) return 'bg-verify/20 text-verify';
    if (value >= 40) return 'bg-accent/20 text-accent';
    return 'bg-alert/20 text-alert';
  };

  const getBgColor = (value, inverse = false) => {
    if (inverse) {
      if (value >= 70) return '#FEE2E2';
      if (value >= 40) return '#FEF3C7';
      return '#D1FAE5';
    }
    if (value >= 70) return '#D1FAE5';
    if (value >= 40) return '#FEF3C7';
    return '#FEE2E2';
  };

  const exportCsv = () => {
    const headers = ['Question', 'Genre', 'Difficulty', 'Marks', 'Attempts', 'Correct', 'Difficulty Index', 'Discrimination Index', 'Distractor Efficiency'];
    const rows = questions.map(q => [
      `"${q.text.replace(/"/g, '""')}"`, q.genre, q.difficulty, q.marks,
      q.total_attempts, q.correct_count, q.difficulty_index, q.discrimination_index, q.distractor_efficiency,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `question-metrics-${testId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-display">Question Metrics</h1>
          <p className="section-subtitle">{test?.title || 'Loading...'} · {questions.length} questions</p>
        </div>
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            className="input-field max-w-56 text-xs"
          />
          <Btn variant="ghost" size="sm" onClick={exportCsv} disabled={!questions.length}>
            Export CSV
          </Btn>
        </div>
      </div>

      {!testId && (
        <div className="empty-state">
          <p className="empty-state-title">Select a test</p>
          <p className="empty-state-desc">Use the URL to specify a test ID, or navigate from Results page.</p>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-16"><Spinner size={28} className="text-accent" /></div>}

      {questions.length > 0 && !isLoading && (
        <div className="panel p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-rim">
                  <th className="text-left py-2 px-3 font-medium text-annotation">Question</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Genre</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Difficulty</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Marks</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Attempts</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Difficulty Index</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Discrimination</th>
                  <th className="text-center py-2 px-2 font-medium text-annotation">Distractor Eff.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => (
                  <tr
                    key={q.id}
                    className="border-b border-rim/30 cursor-pointer hover:bg-panel/60"
                    onClick={() => setSelectedQ(q)}
                  >
                    <td className="py-2 px-3 text-ink max-w-64 truncate">{q.text}</td>
                    <td className="text-center py-2 px-2 text-annotation/70">{q.genre}</td>
                    <td className="text-center py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${q.difficulty === 'easy' ? 'bg-verify/20 text-verify' : q.difficulty === 'hard' ? 'bg-alert/20 text-alert' : 'bg-accent/20 text-accent'}`}>
                        {q.difficulty}
                      </span>
                    </td>
                    <td className="text-center py-2 px-2 font-mono">{q.marks}</td>
                    <td className="text-center py-2 px-2 font-mono">{q.total_attempts}</td>
                    <td className="text-center py-2 px-2">
                      <span className={`px-2 py-1 rounded font-mono text-2xs font-bold ${getColor(q.difficulty_index)}`}>
                        {q.difficulty_index}%
                      </span>
                    </td>
                    <td className="text-center py-2 px-2">
                      <span className={`px-2 py-1 rounded font-mono text-2xs font-bold ${getColor(q.discrimination_index, true)}`}>
                        {q.discrimination_index}%
                      </span>
                    </td>
                    <td className="text-center py-2 px-2">
                      <span className={`px-2 py-1 rounded font-mono text-2xs font-bold ${getColor(q.distractor_efficiency)}`}>
                        {q.distractor_efficiency}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={!!selectedQ} onClose={() => setSelectedQ(null)} title="Question Detail" width="max-w-lg">
        {selectedQ && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-2xs text-annotation/60 block mb-1">Question Text</span>
              <p className="text-ink">{selectedQ.text}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="panel p-2 text-center">
                <div className="text-2xs text-annotation/60">Difficulty Index</div>
                <div className={`text-lg font-bold font-mono ${selectedQ.difficulty_index >= 70 ? 'text-verify' : selectedQ.difficulty_index >= 40 ? 'text-accent' : 'text-alert'}`}>
                  {selectedQ.difficulty_index}%
                </div>
                <div className="text-2xs text-annotation/50">{selectedQ.difficulty_index >= 70 ? 'Easy' : selectedQ.difficulty_index >= 40 ? 'Medium' : 'Hard'}</div>
              </div>
              <div className="panel p-2 text-center">
                <div className="text-2xs text-annotation/60">Discrimination</div>
                <div className={`text-lg font-bold font-mono ${selectedQ.discrimination_index >= 30 ? 'text-verify' : selectedQ.discrimination_index >= 15 ? 'text-accent' : 'text-alert'}`}>
                  {selectedQ.discrimination_index}%
                </div>
                <div className="text-2xs text-annotation/50">{selectedQ.discrimination_index >= 30 ? 'Good' : selectedQ.discrimination_index >= 15 ? 'Fair' : 'Poor'}</div>
              </div>
              <div className="panel p-2 text-center">
                <div className="text-2xs text-annotation/60">Distractor Efficiency</div>
                <div className={`text-lg font-bold font-mono ${selectedQ.distractor_efficiency >= 70 ? 'text-verify' : selectedQ.distractor_efficiency >= 40 ? 'text-accent' : 'text-alert'}`}>
                  {selectedQ.distractor_efficiency}%
                </div>
              </div>
              <div className="panel p-2 text-center">
                <div className="text-2xs text-annotation/60">Attempts</div>
                <div className="text-lg font-bold font-mono text-ink">{selectedQ.total_attempts}</div>
                <div className="text-2xs text-annotation/50">{selectedQ.correct_count} correct</div>
              </div>
            </div>
            <div className="flex gap-2 text-2xs text-annotation/60 pt-2 border-t border-rim">
              <span>Genre: {selectedQ.genre}</span>
              <span>·</span>
              <span>Difficulty: {selectedQ.difficulty}</span>
              <span>·</span>
              <span>Marks: {selectedQ.marks}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
