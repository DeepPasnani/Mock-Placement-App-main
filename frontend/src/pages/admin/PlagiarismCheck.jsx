import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { testsAPI } from '../../services/api';
import api from '../../services/api';
import { Btn, Spinner, Badge, Modal, Select } from '../../components/shared/UI';

export default function PlagiarismCheck() {
  const [selectedTest, setSelectedTest] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [showCode, setShowCode] = useState(null);
  const [viewMode, setViewMode] = useState('list');

  const { data: testsData } = useQuery({ queryKey: ['tests'], queryFn: testsAPI.list });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['plagiarism', selectedTest, threshold],
    queryFn: () => api.get(`/submissions/plagiarism-check/${selectedTest}`, {
      params: { threshold }
    }).then(r => r.data),
    enabled: !!selectedTest,
  });

  const tests = testsData?.tests || [];
  const pairs = data?.pairs || [];

  const students = useMemo(() => {
    const set = new Set();
    pairs.forEach(p => {
      set.add(p.student_a.name);
      set.add(p.student_b.name);
    });
    return Array.from(set).sort();
  }, [pairs]);

  const similarityMatrix = useMemo(() => {
    const matrix = {};
    pairs.forEach(p => {
      const key = [p.student_a.name, p.student_b.name].sort().join('||');
      if (!matrix[key] || matrix[key].similarity < p.similarity) {
        matrix[key] = p;
      }
    });
    return matrix;
  }, [pairs]);

  const getHeatColor = (pct) => {
    if (pct >= 85) return 'bg-alert/30';
    if (pct >= 70) return 'bg-accent/30';
    if (pct >= 50) return 'bg-clarify/30';
    return 'bg-annotation/10';
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Plagiarism Detection</h1>
          <p className="section-subtitle">Code similarity analysis across coding submissions</p>
        </div>
      </div>

      <div className="panel p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-2xs text-annotation/60 mb-1.5">Select Test</label>
          <select className="select-field max-w-sm" value={selectedTest}
            onChange={e => setSelectedTest(e.target.value)}>
            <option value="">— Select a test —</option>
            {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-2xs text-annotation/60 mb-1.5">Similarity Threshold</label>
          <input type="range" min="0.3" max="1.0" step="0.05" value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-28" />
          <span className="text-xs text-annotation ml-2 font-mono">{Math.round(threshold * 100)}%</span>
        </div>
        {pairs.length > 0 && (
          <div className="flex gap-1">
            <Btn variant={viewMode === 'list' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('list')}>List</Btn>
            <Btn variant={viewMode === 'heatmap' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('heatmap')}>Heatmap</Btn>
          </div>
        )}
        {data && (
          <div className="text-xs text-annotation/60 ml-auto">
            {data.flagged_pairs} flagged pairs · {data.total_code_entries} code entries
          </div>
        )}
      </div>

      {!selectedTest && (
        <div className="empty-state">
          <p className="empty-state-title">Select a test</p>
          <p className="empty-state-desc">Choose a test with coding submissions to check for plagiarism.</p>
        </div>
      )}

      {selectedTest && isLoading && (
        <div className="flex justify-center py-16"><Spinner size={28} className="text-accent" /></div>
      )}

      {selectedTest && !isLoading && pairs.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">No matches found</p>
          <p className="empty-state-desc">No plagiarism matches above {Math.round(threshold * 100)}% similarity. Try lowering the threshold.</p>
        </div>
      )}

      {viewMode === 'heatmap' && students.length > 0 && (
        <div className="panel p-4 overflow-x-auto">
          <div className="text-xs font-bold text-ink mb-3">Similarity Heatmap</div>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left p-1 text-annotation/60 font-medium"></th>
                {students.map(s => (
                  <th key={s} className="p-1 text-annotation/60 font-medium truncate max-w-[80px]" title={s}>{s.split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s1, i) => (
                <tr key={s1}>
                  <td className="p-1 text-annotation/60 font-medium truncate max-w-[80px]" title={s1}>{s1.split(' ')[0]}</td>
                  {students.map((s2, j) => {
                    const key = [s1, s2].sort().join('||');
                    const pair = similarityMatrix[key];
                    const isSelf = i === j;
                    return (
                      <td
                        key={s2}
                        className={`p-1 text-center rounded cursor-pointer transition-opacity hover:opacity-80 ${isSelf ? 'bg-ink/5' : pair ? getHeatColor(pair.similarity) : ''}`}
                        onClick={() => {
                          if (pair) {
                            if (pair.student_a.name === s1 || pair.student_a.name === s2) {
                              setShowCode(pair);
                            }
                          }
                        }}
                        title={pair ? `${s1} ↔ ${s2}: ${pair.similarity}%` : isSelf ? '' : 'No match'}
                      >
                        {isSelf ? '—' : pair ? `${pair.similarity}%` : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'list' && pairs.length > 0 && (
        <div className="space-y-2">
          {pairs.map((pair, idx) => (
            <div key={idx} className="panel p-3 hover:ring-1 hover:ring-accent/20 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pair.similarity >= 85 ? '#ef4444' : pair.similarity >= 70 ? '#f59e0b' : '#3b82f6' }} />
                      <span className={`text-lg font-bold font-mono ${
                        pair.similarity >= 85 ? 'text-alert' : pair.similarity >= 70 ? 'text-accent' : 'text-clarify'
                      }`}>{pair.similarity}%</span>
                    </div>
                    <Badge color={pair.similarity >= 85 ? 'red' : pair.similarity >= 70 ? 'yellow' : 'blue'}>
                      {pair.similarity >= 85 ? 'High' : pair.similarity >= 70 ? 'Medium' : 'Low'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="text-xs">
                      <span className="font-semibold text-ink">{pair.student_a.name}</span>
                      <span className="text-annotation/60 ml-2">{pair.student_a.email}</span>
                      {pair.student_a.roll && <span className="text-annotation/50 ml-1">({pair.student_a.roll})</span>}
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-ink">{pair.student_b.name}</span>
                      <span className="text-annotation/60 ml-2">{pair.student_b.email}</span>
                      {pair.student_b.roll && <span className="text-annotation/50 ml-1">({pair.student_b.roll})</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-2xs text-annotation/50">
                    <span>Jaccard: {pair.jaccard}%</span>
                    <span>Levenshtein: {pair.levenshtein}%</span>
                    {pair.ast_similarity !== undefined && <span>AST: {pair.ast_similarity}%</span>}
                    <span>Language: {pair.language}</span>
                  </div>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => setShowCode(pair)}>
                  View Code
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!showCode} onClose={() => setShowCode(null)} title="Code Comparison" width="max-w-5xl">
        {showCode && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: showCode.similarity >= 85 ? '#ef4444' : '#f59e0b' }} />
                <span className="text-sm font-bold text-ink">{showCode.similarity}% similar</span>
              </div>
              <Badge color={showCode.similarity >= 85 ? 'red' : 'yellow'}>{showCode.language}</Badge>
              {showCode.matched_passages?.length > 0 && (
                <span className="text-2xs text-annotation/50">{showCode.matched_passages.length} matching passages</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-ink">{showCode.student_a.name}</p>
                  <span className="text-2xs text-annotation/50">{showCode.student_a.email}</span>
                </div>
                <pre className="text-xs bg-deck p-3 rounded border border-rim overflow-auto max-h-80 whitespace-pre font-mono leading-relaxed">
                  {showCode.code_a.split('\n').map((line, i) => {
                    const isMatched = showCode.matched_passages?.some(m => m.lineA === i);
                    return (
                      <div key={i} className={isMatched ? 'bg-alert/10 -mx-1 px-1 rounded' : ''}>
                        <span className="text-annotation/30 mr-2 select-none">{i + 1}</span>
                        {line || ' '}
                      </div>
                    );
                  })}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-ink">{showCode.student_b.name}</p>
                  <span className="text-2xs text-annotation/50">{showCode.student_b.email}</span>
                </div>
                <pre className="text-xs bg-deck p-3 rounded border border-rim overflow-auto max-h-80 whitespace-pre font-mono leading-relaxed">
                  {showCode.code_b.split('\n').map((line, i) => {
                    const isMatched = showCode.matched_passages?.some(m => m.lineB === i);
                    return (
                      <div key={i} className={isMatched ? 'bg-alert/10 -mx-1 px-1 rounded' : ''}>
                        <span className="text-annotation/30 mr-2 select-none">{i + 1}</span>
                        {line || ' '}
                      </div>
                    );
                  })}
                </pre>
              </div>
            </div>
            {showCode.matched_passages?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink mb-1">Highlighted Matches</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {showCode.matched_passages.slice(0, 10).map((m, i) => (
                    <div key={i} className="text-2xs p-1.5 bg-deck rounded border border-rim flex gap-2">
                      <span className="text-annotation/50 shrink-0">L{m.lineA + 1} ↔ L{m.lineB + 1}</span>
                      <code className="text-ink font-mono truncate">{m.text}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
