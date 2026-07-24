import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { atsAPI, usersAPI } from '../../services/api';
import { Btn, Alert, Spinner, Table } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function AdminATS() {
  const [selected, setSelected] = useState([]);
  const [jobId, setJobId] = useState('');
  const queryClient = useQueryClient();
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => usersAPI.list({ role: 'student' }) });
  const { data: logsData, isLoading } = useQuery({ queryKey: ['ats-logs'], queryFn: atsAPI.getPushLogs });

  const pushMutation = useMutation({
    mutationFn: atsAPI.pushCandidate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ats-logs'] }); },
  });

  const handlePush = async () => {
    if (!selected.length) return toast.error('Select at least one student');
    const res = await pushMutation.mutateAsync({ studentIds: selected, jobId });
    toast.success(`Pushed ${res.pushed} candidate(s)`);
    setSelected([]);
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const students = usersData?.users || [];
  const logs = logsData?.logs || [];

  const studentColumns = [
    { key: 'select', label: '', render: (r) => <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} className="accent-accent" /> },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
  ];

  const logColumns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.status === 'success' ? 'badge-verify' : 'badge-alert'}`}>{r.status}</span> },
    { key: 'student_ids', label: 'Students', render: (r) => (r.student_ids || []).length },
  ];

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">ATS Integration</h1>
          <p className="section-subtitle">Greenhouse / Lever</p>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="text-title mb-3">Push Candidates to ATS</h3>
        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1 max-w-xs">
            <label className="input-label">Job ID (optional)</label>
            <input className="input-field" value={jobId} onChange={e => setJobId(e.target.value)} placeholder="e.g. job_123" />
          </div>
          <Btn onClick={handlePush} disabled={!selected.length || pushMutation.isPending}>
            {pushMutation.isPending ? <Spinner size={14} /> : null}Push Selected ({selected.length})
          </Btn>
        </div>
        <Table columns={studentColumns} data={students} emptyMessage="No students found" />
      </div>

      <div className="panel p-4">
        <h3 className="text-title mb-3">Push History</h3>
        {isLoading ? <Spinner /> : <Table columns={logColumns} data={logs} emptyMessage="No pushes yet" />}
      </div>
    </div>
  );
}
