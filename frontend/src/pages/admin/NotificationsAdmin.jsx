import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsAPI } from '../../services/api';
import { Btn, Modal, Spinner } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function AdminNotifications() {
  const [page, setPage] = useState(1);
  const [showSend, setShowSend] = useState(false);
  const [notifType, setNotifType] = useState('admin_announcement');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [targetRole, setTargetRole] = useState('student');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationsAPI.list({ page, limit: 20 }),
  });

  const sendMut = useMutation({
    mutationFn: notificationsAPI.send,
    onSuccess: () => {
      toast.success('Notification sent');
      setShowSend(false);
      setNotifTitle('');
      setNotifBody('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const notifications = data?.notifications || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size={28} className="text-accent" /></div>;
  }

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Notifications</h1>
          <p className="section-subtitle">{total} total</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowSend(true)}>Send Notification</Btn>
      </div>

      <div className="panel divide-y divide-rim/50">
        {notifications.length === 0 ? (
          <div className="empty-state py-12">
            <p className="empty-state-title">No notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${!n.is_read ? 'bg-accent/[0.02]' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{n.title}</p>
                {n.body && <p className="text-xs text-annotation/70 mt-0.5">{n.body}</p>}
                <p className="text-2xs text-annotation/40 mt-1">
                  User: {n.user_id?.substring(0, 8)}... | {new Date(n.created_at).toLocaleString('en-IN')}
                </p>
              </div>
              <span className={`shrink-0 text-2xs px-2 py-0.5 rounded ${n.is_read ? 'text-annotation/40' : 'text-accent font-bold'}`}>
                {n.is_read ? 'Read' : 'New'}
              </span>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Btn>
          <span className="text-xs text-annotation">{page} / {totalPages}</span>
          <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Btn>
        </div>
      )}

      <Modal isOpen={showSend} onClose={() => setShowSend(false)} title="Send Notification" width="max-w-md"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowSend(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={() => sendMut.mutate({ type: notifType, title: notifTitle, body: notifBody, targetRole })} disabled={!notifTitle.trim() || sendMut.isLoading}>
              {sendMut.isLoading ? <Spinner size={14} /> : 'Send'}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Target</label>
            <select className="select-field" value={targetRole} onChange={e => setTargetRole(e.target.value)}>
              <option value="student">All Students</option>
              <option value="admin">All Admins</option>
            </select>
          </div>
          <div>
            <label className="input-label">Type</label>
            <input className="input-field" value={notifType} onChange={e => setNotifType(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Title</label>
            <input className="input-field" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Notification title" />
          </div>
          <div>
            <label className="input-label">Body</label>
            <textarea className="textarea-field" rows={4} value={notifBody} onChange={e => setNotifBody(e.target.value)} placeholder="Optional body text" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
