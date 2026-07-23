import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersAPI } from '../../services/api';
import { useStore } from '../../store';
import { Btn, Table, Badge, Modal, Input, Alert, ConfirmModal, Spinner } from '../../components/shared/UI';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 * Admin Admins — Super admin management of admin accounts
 * ═══════════════════════════════════════════════════════════ */

export default function AdminAdmins() {
  const qc = useQueryClient();
  const { user: me } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [formErr, setFormErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: () => usersAPI.listAdmins(),
  });
  const createMut = useMutation({
    mutationFn: usersAPI.createAdmin,
    onSuccess: () => {
      toast.success('Admin account created');
      qc.invalidateQueries({ queryKey: ['admins'] });
      setShowAdd(false);
      setForm({ name: '', email: '', password: '' });
    },
    onError: (e) => setFormErr(e.response?.data?.error || 'Failed to create admin'),
  });
  const deleteMut = useMutation({
    mutationFn: usersAPI.delete,
    onSuccess: () => { toast.success('Admin removed'); qc.invalidateQueries({ queryKey: ['admins'] }); },
  });

  const admins = data?.admins || [];

  const handleCreate = () => {
    setFormErr('');
    if (!form.name || !form.email || !form.password) {
      setFormErr('All fields are required.');
      return;
    }
    if (form.password.length < 8) {
      setFormErr('Password must be at least 8 characters.');
      return;
    }
    createMut.mutate(form);
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
            {(u.name || u.email)[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-sm text-ink">{u.name}</div>
            <div className="text-xs text-annotation/60">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <div className="flex items-center gap-2">
          <Badge color="green">Active</Badge>
          {u.id === me?.id && <Badge color="blue">You</Badge>}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'Added',
      render: (u) => (
        <span className="text-xs text-annotation/60 font-mono">
          {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (u) =>
        u.id === me?.id ? null : (
          <button
            onClick={() => setDeleteId(u.id)}
            className="btn-ghost-icon text-annotation hover:text-alert"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ),
    },
  ];

  return (
    <div className="animate-fade-up">
      <div className="section-header">
        <div>
          <h1 className="section-title">Admin Accounts</h1>
          <p className="section-subtitle">
            {admins.length} admin{admins.length !== 1 ? 's' : ''} with full platform access
          </p>
        </div>
        <Btn variant="primary" onClick={() => setShowAdd(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Admin
        </Btn>
      </div>

      <Alert type="warning" className="mb-5">
        Admin accounts can create/edit tests, view all student results, and manage users. Only grant access to trusted staff.
      </Alert>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-accent" />
        </div>
      ) : (
        <Table
          columns={columns}
          data={admins}
          emptyMessage="No admin accounts found."
        />
      )}

      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setFormErr(''); }}
        title="Create Admin Account"
        width="max-w-md"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleCreate} disabled={createMut.isLoading}>
              {createMut.isLoading ? 'Creating…' : 'Create Admin'}
            </Btn>
          </>
        }
      >
        {formErr && <Alert type="error" className="mb-4">{formErr}</Alert>}
        <div className="space-y-4">
          <Input
            label="Full Name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Dr. Jane Smith"
          />
          <Input
            label="Email Address *"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="placement@college.edu"
          />
          <Input
            label="Password *"
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Min. 8 characters"
            hint="Admin must change this after first login."
          />
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMut.mutate(deleteId)}
        title="Remove Admin"
        message="This admin will lose all access. Their created tests will remain."
        confirmLabel="Remove Admin"
      />
    </div>
  );
}
