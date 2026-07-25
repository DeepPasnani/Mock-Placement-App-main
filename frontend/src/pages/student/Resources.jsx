import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { gamificationAPI } from '../../services/api';
import { Btn, Badge, Spinner, Tabs, ProgressBar } from '../../components/shared/UI';
import toast from 'react-hot-toast';
import { BookOpen, Video, Code, CheckCircle, ExternalLink, Filter, Search } from 'lucide-react';

const typeIcons = {
  note: { icon: BookOpen, color: 'text-clarify', bg: 'bg-clarify/10' },
  video: { icon: Video, color: 'text-accent', bg: 'bg-accent/10' },
  practice: { icon: Code, color: 'text-verify', bg: 'bg-verify/10' },
};

export default function Resources() {
  const [typeFilter, setTypeFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['resources', typeFilter, genreFilter],
    queryFn: () => gamificationAPI.listResources({ type: typeFilter || undefined, genre: genreFilter || undefined }),
  });
  const { data: statsData } = useQuery({
    queryKey: ['resource-stats'],
    queryFn: gamificationAPI.getResourceStats,
  });

  const completeMut = useMutation({
    mutationFn: gamificationAPI.completeResource,
    onSuccess: () => {
      toast.success('Resource completed! +10 XP');
    },
    onError: () => toast.error('Failed to mark as complete'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  const resources = data?.resources || [];
  const stats = statsData;

  const genres = [...new Set(resources.map(r => r.genre).filter(Boolean))];

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Study Resources</h1>
          <p className="section-subtitle">Curated learning materials</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="panel p-3 text-center">
            <div className="text-lg font-bold text-ink">{stats.total_resources}</div>
            <div className="text-2xs text-annotation">Total Resources</div>
          </div>
          <div className="panel p-3 text-center">
            <div className="text-lg font-bold text-clarify">{stats.notes_count}</div>
            <div className="text-2xs text-annotation">Notes</div>
          </div>
          <div className="panel p-3 text-center">
            <div className="text-lg font-bold text-accent">{stats.videos_count}</div>
            <div className="text-2xs text-annotation">Videos</div>
          </div>
          <div className="panel p-3 text-center">
            <div className="text-lg font-bold text-ink">{stats.completed_by_me}</div>
            <div className="text-2xs text-annotation">Completed</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          tabs={[
            { id: '', label: 'All' },
            { id: 'note', label: 'Notes' },
            { id: 'video', label: 'Videos' },
            { id: 'practice', label: 'Practice' },
          ]}
          active={typeFilter}
          onChange={setTypeFilter}
        />
        {genres.length > 0 && (
          <select
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
            className="select-field text-xs ml-auto max-w-[140px]"
          >
            <option value="">All Genres</option>
            {genres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>

      {resources.length === 0 ? (
        <div className="empty-state py-16">
          <BookOpen size={40} className="empty-state-icon" />
          <h3 className="empty-state-title">No resources available</h3>
          <p className="empty-state-desc">Check back later for study materials</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {resources.map(resource => {
            const typeStyle = typeIcons[resource.type] || typeIcons.note;
            const TypeIcon = typeStyle.icon;
            return (
              <div key={resource.id} className={`panel p-4 relative ${resource.completed ? 'ring-1 ring-verify/30' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${typeStyle.bg} flex items-center justify-center shrink-0`}>
                    <TypeIcon size={18} className={typeStyle.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-display font-semibold text-ink truncate">{resource.title}</h3>
                    {resource.description && (
                      <p className="text-xs text-annotation/70 mt-0.5 line-clamp-2">{resource.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge color={resource.type === 'note' ? 'blue' : resource.type === 'video' ? 'yellow' : 'green'}>
                        {resource.type}
                      </Badge>
                      {resource.genre && <span className="text-2xs text-annotation/50">{resource.genre}</span>}
                    </div>
                  </div>
                  {resource.completed && <CheckCircle size={16} className="text-verify shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost text-xs flex items-center gap-1"
                  >
                    Open <ExternalLink size={10} />
                  </a>
                  {!resource.completed && (
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => completeMut.mutate(resource.id)}
                      disabled={completeMut.isPending}
                    >
                      Mark Complete
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
