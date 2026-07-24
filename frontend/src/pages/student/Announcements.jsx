import { useQuery } from '@tanstack/react-query';
import { announcementsAPI } from '../../services/api';
import { Badge, Spinner } from '../../components/shared/UI';

const PRIORITY_COLORS = {
  urgent: 'red',
  high: 'yellow',
  normal: 'blue',
  low: 'gray',
};

const PRIORITY_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export default function StudentAnnouncements() {
  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementsAPI.list,
  });

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size={28} className="text-accent" /></div>;
  }

  const announcements = data?.announcements || [];

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Announcements</h1>
          <p className="section-subtitle">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
          <h3 className="empty-state-title">No announcements</h3>
          <p className="empty-state-desc">Check back later for updates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className={`panel p-4 ${a.priority === 'urgent' ? 'border-alert/30' : a.priority === 'high' ? 'border-accent/30' : ''}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="font-display font-bold text-sm text-ink">{a.title}</h2>
                <Badge color={PRIORITY_COLORS[a.priority] || 'gray'}>
                  {PRIORITY_LABELS[a.priority] || 'Normal'}
                </Badge>
              </div>
              <div className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: a.body }} />
              <div className="flex items-center gap-3 mt-3 text-2xs text-annotation/50">
                <span>By {a.created_by_name || 'Admin'}</span>
                <span>{new Date(a.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {a.expires_at && (
                  <span>Expires: {new Date(a.expires_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
