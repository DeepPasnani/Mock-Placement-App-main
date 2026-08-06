import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { analyticsAPI, testsAPI } from '../../../services/api';
import { Btn, Spinner } from '../../../components/shared/UI';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceArea,
} from 'recharts';

export default function TimeSinkAnalysis() {
  const { testId } = useParams();
  const [sortField, setSortField] = useState('time_vs_accuracy_score');
  const [sortDir, setSortDir] = useState('desc');
  const [thresholdTime, setThresholdTime] = useState(60);
  const [thresholdAcc, setThresholdAcc] = useState(40);

  const { data: testsData } = useQuery({ queryKey: ['tests'], queryFn: testsAPI.list });
  const { data, isLoading } = useQuery({
    queryKey: ['time-sink', testId],
    queryFn: () => analyticsAPI.timeSink(testId),
    enabled: !!testId,
  });

  const test = testsData?.tests?.find(t => t.id === testId);
  const questions = data?.questions || [];

  const scatterData = questions.map(q => ({
    x: q.avg_time_seconds,
    y: q.accuracy,
    id: q.question_id,
    text: q.text,
    genre: q.genre,
    difficulty: q.difficulty,
    isTimeSink: q.is_time_sink,
    timeVsAccuracy: q.time_vs_accuracy_score,
  }));

  const timeSinks = scatterData.filter(d => d.x > thresholdTime && d.y < thresholdAcc);

  const sorted = useMemo(() => {
    const list = [...questions];
    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [questions, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Time-Sink Analysis</h1>
          <p className="section-subtitle">{test?.title || ''} · Identify questions with high time + low accuracy</p>
        </div>
      </div>

      {!testId && (
        <div className="empty-state">
          <p className="empty-state-title">Select a test</p>
          <p className="empty-state-desc">Navigate from Results page to see time-sink analysis.</p>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-16"><Spinner size={28} className="text-accent" /></div>}

      {questions.length > 0 && !isLoading && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="panel p-4">
              <h3 className="text-label text-annotation mb-3">Time vs Accuracy Scatter Plot</h3>
              <p className="text-2xs text-annotation/50 mb-2">Red quadrant = time sink (high time, low accuracy)</p>
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-rim)" />
                  <XAxis
                    dataKey="x"
                    name="Avg Time (s)"
                    tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }}
                    label={{ value: 'Avg Time (s)', position: 'insideBottom', offset: -5, style: { fontSize: 10, fill: 'var(--ct-annotation)' } }}
                  />
                  <YAxis
                    dataKey="y"
                    name="Accuracy %"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v, name) => [name === 'x' ? `${v}s` : `${v}%`, name === 'x' ? 'Avg Time' : 'Accuracy']}
                    contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <ReferenceArea x1={thresholdTime} x2={Number.MAX_SAFE_INTEGER} y1={0} y2={thresholdAcc} fill="var(--ct-alert-light)" fillOpacity={0.3} />
                  <Scatter
                    data={scatterData}
                    fill="var(--ct-accent)"
                    shape={props => {
                      const { cx, cy, payload } = props;
                      const isSink = payload.x > thresholdTime && payload.y < thresholdAcc;
                      return (
                        <circle
                          cx={cx} cy={cy} r={6}
                          fill={isSink ? 'var(--ct-alert-light)' : 'var(--ct-clarify)'}
                          stroke={isSink ? 'var(--ct-alert)' : 'transparent'}
                          strokeWidth={isSink ? 2 : 0}
                          opacity={isSink ? 1 : 0.6}
                        />
                      );
                    }}
                  />
                  <Legend
                    payload={[
                      { value: 'Normal', type: 'circle', color: 'var(--ct-clarify)' },
                      { value: 'Time Sink', type: 'circle', color: 'var(--ct-alert-light)' },
                    ]}
                  />
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex gap-3 mt-2">
                <div>
                  <label className="text-2xs text-annotation/60">Time threshold (s)</label>
                  <input type="number" value={thresholdTime} onChange={e => setThresholdTime(Number(e.target.value))} className="input-field w-20 text-xs" />
                </div>
                <div>
                  <label className="text-2xs text-annotation/60">Accuracy threshold (%)</label>
                  <input type="number" value={thresholdAcc} onChange={e => setThresholdAcc(Number(e.target.value))} className="input-field w-20 text-xs" />
                </div>
              </div>
            </div>

            <div className="panel p-4">
              <h3 className="text-label text-annotation mb-3">Flagged Time Sinks ({timeSinks.length})</h3>
              {timeSinks.length === 0 ? (
                <p className="text-xs text-annotation/50 py-8 text-center">No time sinks detected with current thresholds</p>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {timeSinks.map(q => (
                    <div key={q.id} className="p-2 rounded-lg bg-alert/10 border border-alert/20">
                      <p className="text-xs font-medium text-ink truncate">{q.text}</p>
                      <div className="flex gap-3 mt-1 text-2xs text-annotation/60">
                        <span className="text-alert font-mono">{q.x}s avg</span>
                        <span className="text-alert font-mono">{q.y}% acc</span>
                        <span>{q.genre} · {q.difficulty}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {timeSinks.length > 0 && (
                <Btn variant="ghost" size="sm" className="mt-3" onClick={() => {
                  const msg = timeSinks.map(q => `${q.text} (${q.x}s, ${q.y}%)`).join('\n');
                  alert(`Flagged Questions for Review:\n\n${msg}`);
                }}>
                  Flag All for Review
                </Btn>
              )}
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="text-label text-annotation mb-3">All Questions · Sorted Table</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-rim">
                    <th className="text-left py-2 font-medium text-annotation cursor-pointer hover:text-accent select-none" onClick={() => handleSort('text')}>Question</th>
                    <th className="text-center py-2 font-medium text-annotation cursor-pointer hover:text-accent select-none" onClick={() => handleSort('genre')}>Genre</th>
                    <th className="text-center py-2 font-medium text-annotation cursor-pointer hover:text-accent select-none" onClick={() => handleSort('difficulty')}>Difficulty</th>
                    <th className="text-center py-2 font-medium text-annotation cursor-pointer hover:text-accent select-none" onClick={() => handleSort('avg_time_seconds')}>
                      Avg Time {sortField === 'avg_time_seconds' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="text-center py-2 font-medium text-annotation cursor-pointer hover:text-accent select-none" onClick={() => handleSort('accuracy')}>
                      Accuracy {sortField === 'accuracy' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="text-center py-2 font-medium text-annotation cursor-pointer hover:text-accent select-none" onClick={() => handleSort('time_vs_accuracy_score')}>
                      Time-Sink Score {sortField === 'time_vs_accuracy_score' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(q => (
                    <tr key={q.question_id} className={`border-b border-rim/30 ${q.is_time_sink ? 'bg-alert/5' : ''}`}>
                      <td className="py-1.5 text-ink max-w-48 truncate">{q.text}</td>
                      <td className="text-center py-1.5 text-annotation/70">{q.genre}</td>
                      <td className="text-center py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${q.difficulty === 'easy' ? 'bg-verify/20 text-verify' : q.difficulty === 'hard' ? 'bg-alert/20 text-alert' : 'bg-accent/20 text-accent'}`}>
                          {q.difficulty}
                        </span>
                      </td>
                      <td className={`text-center py-1.5 font-mono ${q.avg_time_seconds > 60 ? 'text-alert font-bold' : 'text-annotation/70'}`}>
                        {q.avg_time_seconds}s
                      </td>
                      <td className={`text-center py-1.5 font-mono ${q.accuracy < 40 ? 'text-alert font-bold' : 'text-verify'}`}>
                        {q.accuracy}%
                      </td>
                      <td className={`text-center py-1.5 font-mono ${q.time_vs_accuracy_score > 50 ? 'text-alert font-bold' : ''}`}>
                        {q.time_vs_accuracy_score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-3 flex items-center gap-2 text-xs text-annotation/70">
            <span className="w-3 h-3 rounded-full bg-alert inline-block" />
            <span>Time Sink (≤{thresholdAcc}% accuracy, ≥{thresholdTime}s average time)</span>
            <span className="ml-auto">{timeSinks.length} of {questions.length} questions flagged</span>
          </div>
        </>
      )}
    </div>
  );
}
