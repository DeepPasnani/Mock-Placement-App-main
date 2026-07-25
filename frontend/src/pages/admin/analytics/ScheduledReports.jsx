import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsAPI } from '../../../services/api';
import { Btn, Spinner, Modal } from '../../../components/shared/UI';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const METRIC_OPTIONS = [
  { value: 'avg_score', label: 'Average Score' },
  { value: 'avg_percentage', label: 'Average Percentage' },
  { value: 'genre_accuracy', label: 'Genre-wise Accuracy' },
  { value: 'completion_rate', label: 'Completion Rate' },
];

export default function ScheduledReports() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', config: { metrics: ['avg_percentage'] }, schedule: 'weekly',
    recipients: '', enabled: true,
  });
  const [alertForm, setAlertForm] = useState({
    name: '', student_id: '', threshold_pct: 20, email_recipients: '', enabled: true,
  });

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: analyticsAPI.scheduledReports.list,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['threshold-alerts'],
    queryFn: analyticsAPI.thresholdAlerts.list,
  });

  const createMut = useMutation({
    mutationFn: (data) => analyticsAPI.scheduledReports.create(data),
    onSuccess: () => { toast.success('Report created'); setShowCreate(false);       qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); resetForm(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create report'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => analyticsAPI.scheduledReports.delete(id),
    onSuccess: () => { toast.success('Report deleted');       qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) => analyticsAPI.scheduledReports.update(id, { enabled }),
    onSuccess: () => {       qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); },
  });

  const createAlertMut = useMutation({
    mutationFn: (data) => analyticsAPI.thresholdAlerts.create(data),
    onSuccess: () => { toast.success('Alert created'); setShowAlert(false);       qc.invalidateQueries({ queryKey: ['threshold-alerts'] }); setAlertForm({ name: '', student_id: '', threshold_pct: 20, email_recipients: '', enabled: true }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create alert'),
  });

  const deleteAlertMut = useMutation({
    mutationFn: (id) => analyticsAPI.thresholdAlerts.delete(id),
    onSuccess: () => { toast.success('Alert deleted');       qc.invalidateQueries({ queryKey: ['threshold-alerts'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  const resetForm = () => {
    setForm({ name: '', config: { metrics: ['avg_percentage'] }, schedule: 'weekly', recipients: '', enabled: true });
    setEditingId(null);
  };

  const handleCreate = () => {
    createMut.mutate({
      name: form.name,
      config: form.config,
      schedule: form.schedule,
      recipients: form.recipients.split(',').map(e => e.trim()).filter(Boolean),
      enabled: form.enabled,
    });
  };

  const handleCreateAlert = () => {
    createAlertMut.mutate({
      name: alertForm.name,
      student_id: alertForm.student_id,
      threshold_pct: alertForm.threshold_pct,
      email_recipients: alertForm.email_recipients.split(',').map(e => e.trim()).filter(Boolean),
      enabled: alertForm.enabled,
    });
  };

  const reports = reportsData?.reports || [];
  const alerts = alertsData?.alerts || [];

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-display">Scheduled Reports & Alerts</h1>
          <p className="section-subtitle">Auto-generate reports and monitor student performance</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={() => setShowAlert(true)}>
            New Alert
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            New Report
          </Btn>
        </div>
      </div>

      <h2 className="text-sm font-bold text-ink mt-6">Scheduled Reports</h2>
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size={24} className="text-accent" /></div>
      ) : reports.length === 0 ? (
        <div className="panel p-6 text-center text-xs text-annotation/60">
          No scheduled reports configured. Create one to auto-generate reports.
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className="panel p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">{r.name}</div>
                <div className="text-2xs text-annotation/60">
                  {r.schedule} · Next: {r.next_send_at ? format(new Date(r.next_send_at), 'dd MMM yyyy') : '—'}
                  {r.last_sent_at ? ` · Last sent: ${format(new Date(r.last_sent_at), 'dd MMM')}` : ''}
                </div>
              </div>
              <button
                onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}
                className={`relative w-10 h-5 rounded-full transition-colors ${r.enabled ? 'bg-verify' : 'bg-rim'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${r.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <Btn variant="ghost" size="sm" onClick={() => {
                if (confirm('Delete this report?')) deleteMut.mutate(r.id);
              }}>
                Delete
              </Btn>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-bold text-ink mt-6">Threshold Alerts</h2>
      {alerts.length === 0 ? (
        <div className="panel p-6 text-center text-xs text-annotation/60">
          No alerts configured. Set up alerts to monitor student performance drops.
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className="panel p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">{a.name}</div>
                <div className="text-2xs text-annotation/60">
                  {a.student_name} ({a.roll_number || '—'}) · Drop threshold: {a.threshold_pct}%
                  {a.last_triggered_at ? ` · Last triggered: ${format(new Date(a.last_triggered_at), 'dd MMM')}` : ''}
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => {
                if (confirm('Delete this alert?')) deleteAlertMut.mutate(a.id);
              }}>
                Delete
              </Btn>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Create Scheduled Report" width="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Report Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Weekly Performance Report" />
          </div>
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Schedule</label>
            <select value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} className="select-field">
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Metrics</label>
            <div className="grid grid-cols-2 gap-1">
              {METRIC_OPTIONS.map(m => (
                <label key={m.value} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={form.config.metrics.includes(m.value)}
                    onChange={() => {
                      const metrics = form.config.metrics.includes(m.value)
                        ? form.config.metrics.filter(x => x !== m.value)
                        : [...form.config.metrics, m.value];
                      setForm(f => ({ ...f, config: { ...f.config, metrics } }));
                    }}
                    className="accent-accent"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Email Recipients (comma-separated)</label>
            <input value={form.recipients} onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))} className="input-field" placeholder="admin@college.edu, hod@college.edu" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" size="sm" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleCreate} disabled={!form.name || createMut.isLoading}>
              {createMut.isLoading ? 'Creating...' : 'Create'}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAlert} onClose={() => setShowAlert(false)} title="Create Threshold Alert" width="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Alert Name</label>
            <input value={alertForm.name} onChange={e => setAlertForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Student Performance Drop" />
          </div>
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Student ID (UUID)</label>
            <input value={alertForm.student_id} onChange={e => setAlertForm(f => ({ ...f, student_id: e.target.value }))} className="input-field" placeholder="Enter student UUID" />
          </div>
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Drop Threshold (%)</label>
            <input type="number" value={alertForm.threshold_pct} onChange={e => setAlertForm(f => ({ ...f, threshold_pct: Number(e.target.value) }))} className="input-field" />
            <p className="text-2xs text-annotation/50 mt-0.5">Alert when average drops more than this % from previous 3 tests</p>
          </div>
          <div>
            <label className="text-2xs text-annotation/60 mb-1">Email Recipients (comma-separated)</label>
            <input value={alertForm.email_recipients} onChange={e => setAlertForm(f => ({ ...f, email_recipients: e.target.value }))} className="input-field" placeholder="admin@college.edu" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowAlert(false)}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={handleCreateAlert} disabled={!alertForm.name || !alertForm.student_id || createAlertMut.isLoading}>
              {createAlertMut.isLoading ? 'Creating...' : 'Create'}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
