import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { forumAPI } from '../../services/api';
import { useStore } from '../../store';
import { Btn, Modal, Spinner } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function ForumPage() {
  const { problemId } = useParams();
  const { user } = useStore();
  const queryClient = useQueryClient();
  const [showNewThread, setShowNewThread] = useState(false);
  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['forum-threads', problemId],
    queryFn: () => forumAPI.listThreads(problemId),
    enabled: !!problemId,
  });

  const createMut = useMutation({
    mutationFn: forumAPI.createThread,
    onSuccess: () => {
      queryClient.invalidateQueries(['forum-threads', problemId]);
      setShowNewThread(false);
      setThreadTitle('');
      setThreadBody('');
      toast.success('Thread created');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create thread'),
  });

  const threads = data?.threads || [];

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Discussion Forum</h1>
          <p className="section-subtitle">{threads.length} thread{threads.length !== 1 ? 's' : ''}</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowNewThread(true)}>
          New Thread
        </Btn>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size={24} className="text-accent" /></div>
      ) : threads.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="empty-state-title">No discussions yet</h3>
          <p className="empty-state-desc">Be the first to start a discussion about this problem.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <ThreadCard key={t.id} thread={t} problemId={problemId} currentUser={user} />
          ))}
        </div>
      )}

      <Modal isOpen={showNewThread} onClose={() => setShowNewThread(false)} title="Start a Discussion" width="max-w-lg"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowNewThread(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={() => createMut.mutate({ problemId, title: threadTitle, body: threadBody })} disabled={!threadTitle.trim() || !threadBody.trim() || createMut.isLoading}>
              {createMut.isLoading ? <Spinner size={14} /> : 'Post'}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Title</label>
            <input className="input-field" value={threadTitle} onChange={e => setThreadTitle(e.target.value)} placeholder="What's on your mind?" />
          </div>
          <div>
            <label className="input-label">Details (Markdown supported)</label>
            <textarea className="textarea-field" rows={6} value={threadBody} onChange={e => setThreadBody(e.target.value)} placeholder="Explain your question or idea..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ThreadCard({ thread, problemId, currentUser }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [threadData, setThreadData] = useState(null);

  const { data: fullData } = useQuery({
    queryKey: ['forum-thread', thread.id],
    queryFn: () => forumAPI.getThread(thread.id),
    enabled: expanded,
  });

  const replyMut = useMutation({
    mutationFn: (data) => forumAPI.replyToThread(thread.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['forum-thread', thread.id]);
      queryClient.invalidateQueries(['forum-threads', problemId]);
      setReplyText('');
      toast.success('Reply posted');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to reply'),
  });

  const upvoteMut = useMutation({
    mutationFn: forumAPI.upvoteReply,
    onSuccess: () => {
      queryClient.invalidateQueries(['forum-thread', thread.id]);
    },
  });

  const deleteMut = useMutation({
    mutationFn: forumAPI.deleteReply,
    onSuccess: () => {
      queryClient.invalidateQueries(['forum-thread', thread.id]);
      toast.success('Reply deleted');
    },
  });

  const handleExpand = () => {
    if (!expanded) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  };

  // Load full thread data when expanded
  if (expanded && fullData && !threadData) {
    setThreadData(fullData);
  }

  useEffect(() => {
    if (expanded && fullData) {
      setThreadData(fullData);
    }
  }, [fullData, expanded]);

  return (
    <div className="panel p-4">
      <button onClick={handleExpand} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-sm text-ink">{thread.title}</h3>
            <p className="text-xs text-annotation/70 mt-0.5 line-clamp-2">{thread.body}</p>
          </div>
          <div className="shrink-0 text-right text-2xs text-annotation/50">
            <div>{thread.user_name}</div>
            <div>{new Date(thread.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
            <div className="mt-1">{thread.reply_count || 0} replies</div>
          </div>
        </div>
      </button>

      {expanded && threadData && (
        <div className="mt-4 border-t border-rim pt-4 space-y-3">
          {/* Existing replies */}
          {(threadData.replies || []).map((r) => (
            <div key={r.id} className={`pl-4 border-l-2 ${r.parent_reply_id ? 'ml-8' : 'border-rim'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-ink">{r.user_name}</span>
                    <span className="text-2xs text-annotation/50">{new Date(r.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-sm text-ink/80 whitespace-pre-wrap">{r.body}</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => upvoteMut.mutate(r.id)}
                    className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${r.has_upvoted ? 'text-accent bg-accent/10' : 'text-annotation hover:text-ink'}`}
                  >
                    ▲ {r.upvote_count || 0}
                  </button>
                  {r.user_id === currentUser?.id && (
                    <button onClick={() => deleteMut.mutate(r.id)} className="text-2xs text-alert hover:underline">Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Reply form */}
          <div className="flex gap-2 pt-2">
            <textarea
              className="input-field text-sm flex-1"
              rows={2}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
            />
            <Btn variant="primary" size="sm" className="self-end" onClick={() => replyMut.mutate({ body: replyText })} disabled={!replyText.trim() || replyMut.isLoading}>
              Reply
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}


