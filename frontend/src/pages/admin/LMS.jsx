import { useState, useQuery, useMutation } from '@tanstack/react-query';
import { lmsAPI } from '../../services/api';
import { Btn, Select, Alert, Spinner, Modal, Table } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function AdminLMS() {
  const [csvData, setCsvData] = useState('');
  const [courseId, setCourseId] = useState('');
  const [testId, setTestId] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const { data: logsData, isLoading } = useQuery({ queryKey: ['lms-logs'], queryFn: lmsAPI.getSyncLogs });
  const { data: coursesData } = useQuery({ queryKey: ['lms-courses'], queryFn: lmsAPI.listCourses, enabled: false });

  const testMutation = useMutation({ mutationFn: lmsAPI.testConnection });
  const rosterMutation = useMutation({ mutationFn: lmsAPI.syncRoster });
  const scoresMutation = useMutation({ mutationFn: lmsAPI.syncScores });

  const handleTest = async () => {
    const res = await testMutation.mutateAsync();
    toast[res.connected ? 'success' : 'error'](res.message);
  };

  const handleSyncRoster = async () => {
    await rosterMutation.mutateAsync({ csvData, courseId });
    toast.success('Roster synced');
    setCsvData('');
  };

  const handleSyncScores = async () => {
    await scoresMutation.mutateAsync({ testId, courseId });
    toast.success('Scores synced');
  };

  const logs = logsData?.logs || [];
  const columns = [
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.status === 'success' ? 'badge-verify' : 'badge-alert'}`}>{r.status}</span> },
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">LMS Integration</h1>
          <p className="section-subtitle">Moodle, Canvas, or Blackboard</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setShowConnect(true)}>Config</Btn>
          <Btn variant="clarify" onClick={handleTest} disabled={testMutation.isPending}>
            {testMutation.isPending ? <Spinner size={14} /> : null}Test Connection
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-4">
          <h3 className="text-title mb-3">Sync Roster</h3>
          <p className="text-xs text-annotation mb-3">Import student roster from LMS or paste CSV</p>
          <div className="space-y-3">
            <div>
              <label className="input-label">Course ID (optional)</label>
              <input className="input-field" value={courseId} onChange={e => setCourseId(e.target.value)} placeholder="e.g. 42" />
            </div>
            <div>
              <label className="input-label">CSV Data (optional — paste from LMS export)</label>
              <textarea className="input-field textarea-field font-mono text-xs" value={csvData} onChange={e => setCsvData(e.target.value)} rows={5} placeholder="email,name,department&#10;john@edu.com,John Doe,Computer Engineering" />
            </div>
            <Btn onClick={handleSyncRoster} disabled={rosterMutation.isPending}>
              {rosterMutation.isPending ? <Spinner size={14} /> : null}Sync Roster
            </Btn>
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="text-title mb-3">Push Scores</h3>
          <p className="text-xs text-annotation mb-3">Push test scores back to LMS gradebook</p>
          <div className="space-y-3">
            <div>
              <label className="input-label">Test ID</label>
              <input className="input-field" value={testId} onChange={e => setTestId(e.target.value)} placeholder="Test UUID" />
            </div>
            <Btn onClick={handleSyncScores} disabled={scoresMutation.isPending}>
              {scoresMutation.isPending ? <Spinner size={14} /> : null}Sync Scores
            </Btn>
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="text-title mb-3">Sync Log</h3>
        {isLoading ? <Spinner /> : <Table columns={columns} data={logs} emptyMessage="No syncs yet" />}
      </div>

      <Modal isOpen={showConnect} onClose={() => setShowConnect(false)} title="LMS Configuration">
        <p className="text-sm text-annotation mb-4">Configure via environment variables:</p>
        <div className="space-y-2 text-xs font-mono bg-sunken p-3 rounded-lg">
          <p>LMS_TYPE=moodle|canvas|blackboard</p>
          <p>LMS_BASE_URL=https://your-lms.com</p>
          <p>LMS_API_KEY=your_key</p>
          <p>LMS_API_SECRET=your_secret</p>
        </div>
      </Modal>
    </div>
  );
}
