import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { analyticsAPI, batchesAPI } from '../../../services/api';
import { Btn, Spinner, Input, Select } from '../../../components/shared/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function PlacementPredictions() {
  const [batchFilter, setBatchFilter] = useState('');
  const [minProb, setMinProb] = useState(0);
  const [department, setDepartment] = useState('');

  const { data: batchesData } = useQuery({ queryKey: ['batches'], queryFn: batchesAPI.list });

  const params = {};
  if (batchFilter) params.batch_id = batchFilter;
  if (department) params.department = department;
  if (minProb > 0) params.min_probability = minProb;

  const { data, isLoading } = useQuery({
    queryKey: ['placement-probability', params],
    queryFn: () => analyticsAPI.placementBatch(params),
  });

  const batches = batchesData?.batches || [];

  const exportCsv = () => {
    if (!data?.students?.length) return;
    const headers = ['Name', 'Email', 'Branch', 'Roll No', 'Batch', 'Avg Score', 'Pass Rate', 'Tests', 'Probability', 'Confidence', 'Recommendation'];
    const rows = data.students.map(s => [
      s.name, s.email, s.branch || '', s.roll_number || '', s.batch || '',
      `${s.avg_score}%`, `${s.pass_rate}%`, s.test_count,
      `${s.probability}%`, s.confidence, `"${s.recommendation}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'placement-predictions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getProbColor = (p) => {
    if (p >= 70) return 'text-verify';
    if (p >= 40) return 'text-accent';
    return 'text-alert';
  };

  const getProbBg = (p) => {
    if (p >= 70) return 'bg-verify/10 border-verify/20';
    if (p >= 40) return 'bg-accent/10 border-accent/20';
    return 'bg-alert/10 border-alert/20';
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-display">Placement Predictions</h1>
          <p className="section-subtitle">Predicted placement probability based on test performance</p>
        </div>
        {data?.students?.length > 0 && (
          <Btn variant="ghost" size="sm" onClick={exportCsv}>
            Export CSV
          </Btn>
        )}
      </div>

      <div className="panel p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="pp-batch" className="text-2xs text-annotation/60 mb-1.5">Batch</label>
          <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className="select-field max-w-xs" id="pp-batch">
            <option value="">All batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pp-dept" className="text-2xs text-annotation/60 mb-1.5">Department</label>
          <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. CSE" className="input-field max-w-28 text-xs" id="pp-dept" />
        </div>
        <div>
          <label htmlFor="pp-minprob" className="text-2xs text-annotation/60 mb-1.5">Min Probability</label>
          <input type="number" min={0} max={100} value={minProb} onChange={e => setMinProb(Number(e.target.value))} className="input-field max-w-20 text-xs" id="pp-minprob" />
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-16"><Spinner size={28} className="text-accent" /></div>}

      {data && !isLoading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold text-accent">{data.total}</div>
              <div className="text-2xs text-annotation/60">Students Analyzed</div>
            </div>
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold text-ink">{data.avg_probability}%</div>
              <div className="text-2xs text-annotation/60">Avg Probability</div>
            </div>
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold text-verify">{data.high_confidence_count}</div>
              <div className="text-2xs text-annotation/60">High Confidence</div>
            </div>
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold text-alert">{data.low_probability_count}</div>
              <div className="text-2xs text-annotation/60">Need Attention (&lt;40%)</div>
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="text-label text-annotation mb-3">Probability Distribution</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.distribution} margin={{ top: 0, right: 0, bottom: 0, left: -16 }}>
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} allowDecimals={false} />
                <Tooltip formatter={v => [`${v} students`]} contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {data.distribution.map((d, i) => {
                    const rangeStart = parseInt(d.range.split('-')[0]);
                    return <Cell key={i} fill={rangeStart >= 70 ? 'var(--ct-verify)' : rangeStart >= 40 ? 'var(--ct-accent)' : 'var(--ct-alert)'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 font-medium text-annotation">Student</th>
                    <th className="text-center py-2 font-medium text-annotation">Avg Score</th>
                    <th className="text-center py-2 font-medium text-annotation">Tests</th>
                    <th className="text-center py-2 font-medium text-annotation">Probability</th>
                    <th className="text-center py-2 font-medium text-annotation">Confidence</th>
                    <th className="text-left py-2 font-medium text-annotation">Recommendation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.students
                    .filter(s => s.probability >= minProb)
                    .map(s => (
                      <tr key={s.user_id} className="border-b border-rim/30">
                        <td>
                          <Link to={`/admin/analytics/students/${s.user_id}`} className="font-medium text-ink hover:text-accent transition-colors">
                            {s.name}
                          </Link>
                          <div className="text-2xs text-annotation/60">{s.email}</div>
                        </td>
                        <td className="text-center font-mono">{s.avg_score}%</td>
                        <td className="text-center font-mono">{s.test_count}</td>
                        <td className="text-center">
                          <span className={`inline-block px-2 py-1 rounded font-mono font-bold text-xs ${getProbBg(s.probability)} ${getProbColor(s.probability)}`}>
                            {s.probability}%
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${s.confidence === 'high' ? 'bg-verify/20 text-verify' : s.confidence === 'medium' ? 'bg-accent/20 text-accent' : 'bg-annotation/20 text-annotation'}`}>
                            {s.confidence}
                          </span>
                        </td>
                        <td className="text-annotation/70 max-w-48 truncate">{s.recommendation}</td>
                        <td>
                          <Link to={`/admin/analytics/students/${s.user_id}`} className="text-clarify hover:underline text-2xs">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
