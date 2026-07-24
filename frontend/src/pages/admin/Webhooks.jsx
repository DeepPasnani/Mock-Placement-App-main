import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webhooksAPI } from '../../services/api';
import { Btn, Modal, Spinner, Table } from '../../components/shared/UI';
import toast from 'react-hot-toast';

const EVENTS = [
  { value: 'test_published', label: 'Test Published' },
  { value: 'results_ready', label: 'Results Ready' },
  { value: 'new_feedback', label: 'New Feedback' },
  { value: 'submission_flagged', label: 'Submission Flagged' },
];

export default function AdminWebhooks() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ type: 'slack', webhookUrl: '', events: [] });
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['webhooks'], queryFn: webhooksAPI.list });

  const createMutation = useMutation({
    mutationFn: webhooksAPI.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setShowForm(false); setFormData({ type: 'slack', webhookUrl: '', events: [] }); },
  });
  const testMutation = useMutation({ mutationFn: webhooksAPI.test });
  const toggleMutation = useMutation({
    mutationFn: ({ id, data }) => webhooksAPI.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });
  const deleteMutation = useMutation({
    mutationFn: webhooksAPI.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    await createMutation.mutateAsync({ type: formData.type, webhookUrl: formData.webhookUrl, events: formData.events });
    toast.success('Webhook created');
  };

  const handleTest = async (wh) => {
    await testMutation.mutateAsync({ type: wh.type, webhookUrl: wh.webhook_url });
    toast.success('Test webhook sent');
  };

  const handleToggle = async (wh) => {
    await toggleMutation.mutateAsync({ id: wh.id, data: { enabled: !wh.enabled } });
    toast.success(`Webhook ${wh.enabled ? 'disabled' : 'enabled'}`);
  };

  const toggleEvent = (ev) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter(e => e !== ev) : [...prev.events, ev],
    }));
  };

  const webhooks = data?.webhooks || [];
  const columns = [
    { key: 'type', label: 'Type', render: (r) => <span className={`badge ${r.type === 'slack' ? 'badge-clarify' : 'badge-accent'}`}>{r.type}</span> },
    { key: 'webhook_url', label: 'URL', render: (r) => <span className="text-xs font-mono truncate max-w-[200px] block">{r.webhook_url}</span> },
    { key: 'events', label: 'Events', render: (r) => (r.events || []).map(e => <span key={e} className="badge badge-annotation mr-1">{e}</span>) },
    { key: 'enabled', label: 'Active', render: (r) => <button onClick={() => handleToggle(r)} className={`w-10 h-5 rounded-full transition-colors ${r.enabled ? 'bg-verify' : 'bg-rim'} relative`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-5 left-0' : 'left-0.5'}`} /></button> },
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Btn variant="ghost" size="sm" onClick={() => handleTest(r)} disabled={testMutation.isPending}>Test</Btn>
        <Btn variant="danger" size="sm" onClick={() => { deleteMutation.mutate(r.id); toast.success('Deleted'); }}>Del</Btn>
      </div>
    )},
  ];

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Webhooks</h1>
          <p className="section-subtitle">Slack / Discord notifications</p>
        </div>
        <Btn onClick={() => setShowForm(true)}>Add Webhook</Btn>
      </div>

      <div className="panel p-4">
        {isLoading ? <Spinner /> : <Table columns={columns} data={webhooks} emptyMessage="No webhooks configured" />}
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add Webhook" width="max-w-md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="input-label">Type</label>
            <select className="select-field" value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
            </select>
          </div>
          <div>
            <label className="input-label">Webhook URL</label>
            <input className="input-field" value={formData.webhookUrl} onChange={e => setFormData(p => ({ ...p, webhookUrl: e.target.value }))} placeholder="https://hooks.slack.com/..." required />
          </div>
          <div>
            <label className="input-label">Events</label>
            <div className="space-y-1.5">
              {EVENTS.map(ev => (
                <label key={ev.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.events.includes(ev.value)} onChange={() => toggleEvent(ev.value)} className="accent-accent" />
                  {ev.label}
                </label>
              ))}
            </div>
          </div>
          <Btn type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Spinner size={14} /> : null}Create Webhook
          </Btn>
        </form>
      </Modal>
    </div>
  );
}
