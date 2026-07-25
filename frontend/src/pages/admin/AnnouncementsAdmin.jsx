import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementsAPI } from '../../services/api';
import { Btn, Modal, Spinner, Badge, Alert } from '../../components/shared/UI';
import toast from 'react-hot-toast';

const PRIORITY_COLORS = { urgent: 'red', high: 'yellow', normal: 'blue', low: 'gray' };

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal', targetRole: 'all', expiresAt: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementsAPI.list,
  });

  const createMut = useMutation({
    mutationFn: announcementsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowCreate(false);
      resetForm();
      toast.success('Announcement created');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => announcementsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setEditing(null);
      resetForm();
      toast.success('Announcement updated');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: announcementsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Deleted');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const resetForm = () => setForm({ title: '', body: '', priority: 'normal', targetRole: 'all', expiresAt: '' });

  const openEdit = (a) => {
    setEditing(a.id);
    setForm({
      title: a.title,
      body: a.body,
      priority: a.priority,
      targetRole: a.target_role,
      expiresAt: a.expires_at ? a.expires_at.substring(0, 16) : '',
    });
  };

  const announcements = data?.announcements || [];

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size={28} className="text-accent" /></div>;
  }

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Announcements</h1>
          <p className="section-subtitle">{announcements.length} active</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>Create</Btn>
      </div>

      {announcements.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No announcements</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className={`panel p-4 ${a.priority === 'urgent' ? 'border-alert/30' : ''}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-bold text-sm text-ink">{a.title}</h2>
                  <Badge color={PRIORITY_COLORS[a.priority] || 'gray'}>{a.priority}</Badge>
                  <Badge color="blue">{a.target_role}</Badge>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Btn variant="ghost" size="sm" onClick={() => openEdit(a)}>Edit</Btn>
                  <Btn variant="danger" size="sm" onClick={() => { if (confirm('Delete this announcement?')) deleteMut.mutate(a.id); }}>Delete</Btn>
                </div>
              </div>
              <div className="text-sm text-ink/80 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: a.body }} />
              <div className="flex items-center gap-3 mt-3 text-2xs text-annotation/50">
                <span>By {a.created_by_name || 'Admin'}</span>
                <span>{new Date(a.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {a.expires_at && <span>Expires: {new Date(a.expires_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate || !!editing} onClose={() => { setShowCreate(false); setEditing(null); }} title={editing ? 'Edit Announcement' : 'Create Announcement'} width="max-w-lg"
        footer={
          <>
            <Btn variant="ghost" onClick={() => { setShowCreate(false); setEditing(null); }}>Cancel</Btn>
            <Btn variant="primary" onClick={() => {
              const payload = { ...form, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null };
              if (editing) updateMut.mutate({ id: editing, data: payload });
              else createMut.mutate(payload);
            }} disabled={!form.title.trim() || !form.body.trim()}>
              {editing ? 'Update' : 'Create'}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Title</label>
            <input className="input-field" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" />
          </div>
          <div>
            <label className="input-label">Body (HTML supported)</label>
            <textarea className="textarea-field" rows={6} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Full announcement content..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Priority</label>
              <select className="select-field" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="input-label">Target Role</label>
              <select className="select-field" value={form.targetRole} onChange={e => setForm(f => ({ ...f, targetRole: e.target.value }))}>
                <option value="all">All</option>
                <option value="student">Students Only</option>
                <option value="admin">Admins Only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Expires At (optional)</label>
            <input className="input-field" type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
