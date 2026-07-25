import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsAPI, testsAPI, batchesAPI } from '../../../services/api';
import { Spinner } from '../../../components/shared/UI';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['var(--ct-accent)', 'var(--ct-clarify)', 'var(--ct-verify)', 'var(--ct-alert)', '#8B5CF6', '#F59E0B'];

export default function CohortAnalytics() {
  const [batchId, setBatchId] = useState('');
  const [department, setDepartment] = useState('');
  const [testId, setTestId] = useState('');

  const { data: testsData } = useQuery({ queryKey: ['tests'], queryFn: testsAPI.list });
  const { data: batchesData } = useQuery({ queryKey: ['batches'], queryFn: batchesAPI.list });

  const params = {};
  if (batchId) params.batch_id = batchId;
  if (department) params.department = department;
  if (testId) params.test_id = testId;

  const { data: radarData, isLoading: radarLoading } = useQuery({
    queryKey: ['cohort-radar', params],
    queryFn: () => analyticsAPI.cohortRadar(params),
    enabled: !!params.batch_id || !!params.department || !!params.test_id,
  });

  const { data: distData, isLoading: distLoading } = useQuery({
    queryKey: ['cohort-dist', params],
    queryFn: () => analyticsAPI.cohortDistribution(params),
    enabled: !!params.batch_id || !!params.department || !!params.test_id,
  });

  const tests = testsData?.tests || [];
  const batches = batchesData?.batches || [];

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Cohort Analytics</h1>
          <p className="section-subtitle">Compare placement readiness across cohorts</p>
        </div>
      </div>

      <div className="panel p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-2xs text-annotation/60 mb-1.5">Batch</label>
          <select value={batchId} onChange={e => setBatchId(e.target.value)} className="select-field max-w-xs">
            <option value="">All batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-2xs text-annotation/60 mb-1.5">Department</label>
          <select value={department} onChange={e => setDepartment(e.target.value)} className="select-field max-w-xs">
            <option value="">All departments</option>
            {[...new Set(tests.map(t => t.department).filter(Boolean))].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-2xs text-annotation/60 mb-1.5">Test</label>
          <select value={testId} onChange={e => setTestId(e.target.value)} className="select-field max-w-xs">
            <option value="">All tests</option>
            {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      </div>

      {!params.batch_id && !params.department && !params.test_id && (
        <div className="empty-state mt-8">
          <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="empty-state-title">Select filters</p>
          <p className="empty-state-desc">Choose batch, department, or test to compare cohorts.</p>
        </div>
      )}

      {(radarLoading || distLoading) && (
        <div className="flex justify-center py-16"><Spinner size={28} className="text-accent" /></div>
      )}

      {radarData && !radarLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel p-4">
            <h3 className="text-label text-annotation mb-3">Genre-wise Radar Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData.radarData}>
                <PolarGrid stroke="var(--ct-rim)" />
                <PolarAngleAxis dataKey="cohort" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--ct-annotation)' }} />
                <Tooltip contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', fontSize: '12px' }} />
                {radarData.genres.map((genre, i) => (
                  <Radar key={genre} name={genre} dataKey={genre} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.1} />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel p-4">
            <h3 className="text-label text-annotation mb-3">Percentile Distribution</h3>
            {distData && distData.distribution.map((cohort, ci) => (
              <div key={cohort.label} className="mb-4">
                <p className="text-xs font-medium text-ink mb-1">{cohort.label}</p>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={cohort.data} margin={{ top: 0, right: 0, bottom: 0, left: -16 }}>
                    <XAxis dataKey="range" tick={{ fontSize: 8, fill: 'var(--ct-annotation)' }} />
                    <YAxis tick={{ fontSize: 8, fill: 'var(--ct-annotation)' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]} fill={COLORS[ci % COLORS.length]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}

      {radarData && radarData.radarData.length > 0 && (
        <div className="panel p-4">
          <h3 className="text-label text-annotation mb-3">Cohort Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-rim">
                  <th className="text-left py-2 font-medium text-annotation">Cohort</th>
                  {radarData.genres.map(g => (
                    <th key={g} className="text-right py-2 font-medium text-annotation">{g.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {radarData.radarData.map((row, i) => (
                  <tr key={row.cohort} className="border-b border-rim/30">
                    <td className="py-1.5 font-medium text-ink">{row.cohort}</td>
                    {radarData.genres.map(g => (
                      <td key={g} className="text-right py-1.5 font-mono">{row[g]}%</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
