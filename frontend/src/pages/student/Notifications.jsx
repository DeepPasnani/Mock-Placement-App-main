import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../services/api';
import { Btn, Spinner } from '../../components/shared/UI';
import toast from 'react-hot-toast';

const NOTIF_ICONS = {
  test_start_alert: '⏰',
  submission_confirmed: '✅',
  score_updated: '📊',
  admin_announcement: '📢',
};

export default function StudentNotifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationsAPI.list({ page, limit: 20 }),
  });

  const markReadMut = useMutation({
    mutationFn: notificationsAPI.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['notifications-unread']);
    },
  });

  const markAllMut = useMutation({
    mutationFn: notificationsAPI.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['notifications-unread']);
      toast.success('All marked as read');
    },
  });

  const handleNotifClick = (n) => {
    if (!n.is_read) markReadMut.mutate(n.id);
    const d = n.data || {};
    if (d.testId) navigate(`/test/${d.testId}`);
    else if (d.announcementId) navigate('/student/announcements');
  };

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size={28} className="text-accent" /></div>;
  }

  const notifications = data?.notifications || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Notifications</h1>
          <p className="section-subtitle">{total} notification{total !== 1 ? 's' : ''}</p>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => markAllMut.mutate()}>
          Mark all read
        </Btn>
      </div>

      <div className="panel divide-y divide-rim/50">
        {notifications.length === 0 ? (
          <div className="empty-state py-12">
            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h3 className="empty-state-title">No notifications</h3>
            <p className="empty-state-desc">You're all caught up!</p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleNotifClick(n)}
              className={`w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-sunken/50 transition-colors ${!n.is_read ? 'bg-accent/[0.02]' : ''}`}
            >
              <div className="text-lg shrink-0 mt-0.5">
                {NOTIF_ICONS[n.type] || '🔔'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${!n.is_read ? 'font-bold text-ink' : 'text-ink/80'}`}>{n.title}</p>
                  {!n.is_read && <span className="shrink-0 w-2 h-2 rounded-full bg-accent mt-1.5" />}
                </div>
                {n.body && <p className="text-xs text-annotation/70 mt-0.5">{n.body}</p>}
                <p className="text-2xs text-annotation/40 mt-1">
                  {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Btn>
          <span className="text-xs text-annotation">{page} / {totalPages}</span>
          <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Btn>
        </div>
      )}
    </div>
  );
}
