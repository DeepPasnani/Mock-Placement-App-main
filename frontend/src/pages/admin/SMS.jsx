import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { smsAPI, usersAPI } from '../../services/api';
import { Btn, Select, Spinner, Table } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function AdminSMS() {
  const [mode, setMode] = useState('single');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => usersAPI.list({ sms_opted_in: true }) });
  const { data: historyData, isLoading } = useQuery({ queryKey: ['sms-history'], queryFn: smsAPI.getHistory });

  const sendMutation = useMutation({ mutationFn: smsAPI.send });
  const bulkMutation = useMutation({ mutationFn: smsAPI.sendBulk });

  const handleSend = async () => {
    if (!message.trim()) return toast.error('Message required');
    if (mode === 'single') {
      if (!phone) return toast.error('Phone number required');
      await sendMutation.mutateAsync({ phone, message });
      toast.success('SMS sent');
    } else {
      const students = usersData?.users || [];
      const phones = students.filter(s => s.phone && s.sms_opted_in).map(s => s.phone);
      if (!phones.length) return toast.error('No opted-in students with phone numbers');
      const res = await bulkMutation.mutateAsync({ phones, message });
      toast.success(`Sent to ${res.sent} students`);
    }
  };

  const history = historyData?.history || [];
  const columns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'phone', label: 'Phone' },
    { key: 'body', label: 'Message', render: (r) => <span className="text-xs truncate max-w-[250px] block">{r.body}</span> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.status === 'sent' ? 'badge-verify' : 'badge-alert'}`}>{r.status}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">SMS Gateway</h1>
          <p className="section-subtitle">Twilio-powered SMS</p>
        </div>
      </div>

      <div className="panel p-4 max-w-lg">
        <div className="flex gap-2 mb-4">
          <Btn variant={mode === 'single' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('single')}>Single</Btn>
          <Btn variant={mode === 'bulk' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('bulk')}>Bulk (opted-in)</Btn>
        </div>

        <div className="space-y-3">
          {mode === 'single' && (
            <div>
              <label className="input-label">Phone Number</label>
              <input className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+919876543210" />
            </div>
          )}
          {mode === 'bulk' && (
            <div className="text-xs text-annotation mb-2">
              Sending to all opted-in students with phone numbers ({usersData?.users?.filter(s => s.phone && s.sms_opted_in).length || 0} recipients)
            </div>
          )}
          <div>
            <label className="input-label">Message</label>
            <textarea className="input-field textarea-field" value={message} onChange={e => setMessage(e.target.value)}
              rows={4} maxLength={1600} placeholder="Type your message..." />
            <p className="text-2xs text-annotation mt-1">{message.length}/1600 chars (~{Math.ceil(message.length / 160)} SMS segments)</p>
          </div>
          <Btn onClick={handleSend} disabled={sendMutation.isPending || bulkMutation.isPending} className="w-full">
            {(sendMutation.isPending || bulkMutation.isPending) ? <Spinner size={14} /> : null}
            {mode === 'single' ? 'Send SMS' : 'Send to All Opted-In'}
          </Btn>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="text-title mb-3">Send History</h3>
        {isLoading ? <Spinner /> : <Table columns={columns} data={history} emptyMessage="No messages sent" />}
      </div>
    </div>
  );
}
