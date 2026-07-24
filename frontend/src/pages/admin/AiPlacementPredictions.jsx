import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiAPI } from '../../services/ai';
import { batchesAPI, usersAPI } from '../../services/api';
import { Btn, Select, Spinner, Badge, Modal, ProgressBar } from '../../components/shared/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const PROB_COLOR = (p) => p >= 80 ? 'text-verify' : p >= 50 ? 'text-accent' : 'text-alert';
const BADGE_COLOR = (p) => p >= 80 ? 'green' : p >= 50 ? 'yellow' : 'red';

export default function AiPlacementPredictions() {
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: batchesAPI.list,
  });

  const { data: predictions, isLoading } = useQuery({
    queryKey: ['placement-predictions', selectedBatch],
    queryFn: () => selectedBatch ? aiAPI.getBatchPredictions(selectedBatch) : Promise.resolve(null),
    enabled: !!selectedBatch,
  });

  const { data: studentPredictions } = useQuery({
    queryKey: ['all-students-batch', selectedBatch],
    queryFn: () => usersAPI.list({ batch: selectedBatch }).then(r => r.users),
    enabled: !!selectedBatch,
  });

  const { data: individualPred } = useQuery({
    queryKey: ['placement-prediction', selectedStudent?.id],
    queryFn: () => aiAPI.getPlacementPrediction(selectedStudent.id),
    enabled: !!selectedStudent,
  });

  const batchList = batches?.batches || [];
  const preds = predictions?.predictions || [];

  const chartData = preds.map(p => ({
    name: p.student?.name?.split(' ')[0] || 'Student',
    probability: p.placement_probability,
  }));

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Placement Predictions</h1>
          <p className="section-subtitle">AI-powered placement probability analysis</p>
        </div>
      </div>

      <div className="panel p-4">
        <Select label="Select Batch" value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} className="max-w-xs">
          <option value="">Choose a batch...</option>
          {batchList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {isLoading && <div className="flex justify-center py-10"><Spinner size={28} /></div>}

      {predictions && !isLoading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold text-accent">{predictions.total_students}</div>
              <div className="text-2xs text-annotation/60">Total Students</div>
            </div>
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold text-clarify">{predictions.analyzed}</div>
              <div className="text-2xs text-annotation/60">Analyzed</div>
            </div>
            <div className="panel p-3 text-center">
              <div className={`text-lg font-bold ${PROB_COLOR(predictions.avg_placement_probability)}`}>{predictions.avg_placement_probability}%</div>
              <div className="text-2xs text-annotation/60">Avg Probability</div>
            </div>
            <div className="panel p-3 text-center">
              <div className="text-lg font-bold">{preds.filter(p => p.placement_probability >= 80).length}</div>
              <div className="text-2xs text-annotation/60">High Chance (&gt;80%)</div>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="panel p-4">
              <h3 className="text-xs font-bold text-ink mb-3">Probability Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ct-annotation)' }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Probability']} contentStyle={{ background: 'var(--ct-panel)', border: '1px solid var(--ct-rim)', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="probability" radius={[3, 3, 0, 0]} fill="var(--ct-accent)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="panel p-4">
            <h3 className="text-xs font-bold text-ink mb-3">Student Predictions</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Probability</th>
                    <th>Avg Score</th>
                    <th>Focus Areas</th>
                    <th>Percentile</th>
                  </tr>
                </thead>
                <tbody>
                  {preds.map((p, i) => (
                    <tr key={p.student?.id || i} className="cursor-pointer hover:bg-panel/50" onClick={() => setSelectedStudent(p.student)}>
                      <td className="text-annotation">{i + 1}</td>
                      <td className="font-medium text-ink">{p.student?.name || 'N/A'}</td>
                      <td>
                        <span className={`font-bold font-mono ${PROB_COLOR(p.placement_probability)}`}>
                          {p.placement_probability}%
                        </span>
                        <ProgressBar value={p.placement_probability} max={100} color={p.placement_probability >= 80 ? 'bg-verify' : p.placement_probability >= 50 ? 'bg-accent' : 'bg-alert'} className="w-20 mt-1" />
                      </td>
                      <td className="font-mono">{p.avg_score || '—'}%</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(p.recommended_focus || []).slice(0, 2).map(f => (
                            <Badge key={f} color="blue">{f}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="font-mono text-xs">{p.peer_percentile}th</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={!!selectedStudent} onClose={() => setSelectedStudent(null)} title={selectedStudent?.name || 'Student Prediction'} width="max-w-lg">
        {individualPred ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className={`text-4xl font-display font-bold ${PROB_COLOR(individualPred.placement_probability)}`}>{individualPred.placement_probability}%</div>
              <p className="text-xs text-annotation">Placement Probability</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="panel p-2">
                <div className="text-sm font-bold text-clarify">{individualPred.avg_score}%</div>
                <div className="text-2xs text-annotation">Avg Score</div>
              </div>
              <div className="panel p-2">
                <div className={`text-sm font-bold ${individualPred.improvement_rate >= 0 ? 'text-verify' : 'text-alert'}`}>{individualPred.improvement_rate}%</div>
                <div className="text-2xs text-annotation">Improvement</div>
              </div>
              <div className="panel p-2">
                <div className="text-sm font-bold text-clarify">{individualPred.peer_percentile}th</div>
                <div className="text-2xs text-annotation">Peer Percentile</div>
              </div>
            </div>
            {individualPred.recommended_focus?.length > 0 && (
              <div>
                <label className="input-label">Recommended Focus Areas</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {individualPred.recommended_focus.map(f => (
                    <Badge key={f} color="red">{f}</Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-annotation/60">Based on {individualPred.test_count || 0} test(s) completed</p>
          </div>
        ) : (
          <div className="flex justify-center py-6"><Spinner /></div>
        )}
      </Modal>
    </div>
  );
}
