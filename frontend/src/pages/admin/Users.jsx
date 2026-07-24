import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { usersAPI } from '../../services/api';
import { Btn, Table, Badge, Modal, Input, Alert, ConfirmModal, Spinner } from '../../components/shared/UI';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 * Admin Users — Student management
 * ═══════════════════════════════════════════════════════════ */

export default function AdminUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showBatchUpdate, setShowBatchUpdate] = useState(false);
  const [batchCsvText, setBatchCsvText] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'student', search],
    queryFn: () => usersAPI.list({ role: 'student', search }),
  });
  const deleteMut = useMutation({
    mutationFn: usersAPI.delete,
    onSuccess: () => { toast.success('User removed'); qc.invalidateQueries({ queryKey: ['users'] }); },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }) => usersAPI.update(id, { isActive }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['users'] }); },
  });
  const importMut = useMutation({
    mutationFn: () => {
      const lines = csvText.trim().split('\n').slice(1);
      const students = lines
        .map(l => {
          const [name, email, branch, rollNumber] = l
            .split(',')
            .map(s => s.trim().replace(/"/g, ''));
          return { name, email, branch, rollNumber };
        })
        .filter(s => s.email);
      return usersAPI.bulkImport({ students });
    },
    onSuccess: (r) => {
      toast.success(`Created ${r.created} students`);
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowImport(false);
      setCsvText('');
    },
  });

  const batchUpdateMut = useMutation({
    mutationFn: () => {
      const lines = batchCsvText.trim().split('\n').slice(1);
      const students = lines
        .map(l => {
          const [email, batch, yearOfStudy] = l
            .split(',')
            .map(s => s.trim().replace(/"/g, ''));
          return { email, batch, year_of_study: yearOfStudy ? parseInt(yearOfStudy) : undefined };
        })
        .filter(s => s.email);
      return usersAPI.bulkUpdateBatch({ students });
    },
    onSuccess: (r) => {
      toast.success(`Updated ${r.updated} students`);
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowBatchUpdate(false);
      setBatchCsvText('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Batch update failed'),
  });

  const users = data?.users || [];

  const columns = [
    {
      key: 'name',
      label: 'Student',
      render: (u) => (
        <div>
          <div className="font-medium text-sm text-ink">{u.name || '—'}</div>
          <div className="text-xs text-annotation/60">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'roll_number',
      label: 'Roll / Branch',
      render: (u) => (
        <span className="text-xs text-annotation/70">
          {u.roll_number || '—'} {u.branch ? `· ${u.branch}` : ''}
        </span>
      ),
    },
    {
      key: 'login',
      label: 'Login',
      render: (u) => (
        <Badge color={u.google_id ? 'blue' : 'gray'}>
          {u.google_id ? 'Google' : 'Email'}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <Badge color={u.is_active ? 'green' : 'red'}>
          {u.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'last_login',
      label: 'Last Login',
      render: (u) =>
        u.last_login ? (
          <span className="text-xs text-annotation/60 font-mono">
            {format(new Date(u.last_login), 'dd MMM yyyy')}
          </span>
        ) : (
          <span className="text-xs text-annotation/40">Never</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      render: (u) => (
        <div className="flex gap-1 justify-end">
          <Link to={`/admin/analytics/students/${u.id}`}
            className="btn-ghost-icon text-clarify hover:text-accent"
            title="View analytics" aria-label="View student analytics">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </Link>
          <button
            onClick={() =>
              toggleMut.mutate({ id: u.id, isActive: !u.is_active })
            }
            className="btn-ghost-icon"
            title={u.is_active ? 'Deactivate' : 'Activate'}
            aria-label={u.is_active ? 'Deactivate user' : 'Activate user'}
          >
            {u.is_active ? (
              <svg className="w-4 h-4 text-verify" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-annotation" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setDeleteId(u.id)}
            className="btn-ghost-icon text-annotation hover:text-alert"
            aria-label="Delete user"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-up">
      <div className="section-header">
        <div>
          <h1 className="section-title">Students</h1>
          <p className="section-subtitle">{data?.total || 0} registered</p>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => setShowBatchUpdate(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Update Batch
        </Btn>
        <Btn variant="primary" onClick={() => setShowImport(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Bulk Import
        </Btn>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="input-field max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-accent" />
        </div>
      ) : (
        <Table
          columns={columns}
          data={users}
          emptyMessage="No students found."
        />
      )}

      {/* Bulk Import Modal */}
      <Modal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Bulk Import Students"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowImport(false)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={() => importMut.mutate()}
              disabled={!csvText.trim() || importMut.isLoading}
            >
              {importMut.isLoading ? 'Importing…' : 'Import Students'}
            </Btn>
          </>
        }
      >
        <Alert type="info" className="mb-4">
          Paste CSV with header row. Students receive a temporary password and
          must reset it.
        </Alert>
        <p className="text-xs text-annotation/70 mb-3 font-mono bg-deck p-2 rounded border border-rim">
          name,email,branch,rollNumber
          <br />
          Alice Smith,alice@college.edu,CSE,CS001
          <br />
          Bob Jones,bob@college.edu,IT,IT042
        </p>
        <textarea
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={10}
          placeholder="Paste CSV data here…"
          className="textarea-field"
        />
        {importMut.data && (
          <Alert type="success" className="mt-3">
            Created: {importMut.data.created} · Skipped:{' '}
            {importMut.data.skipped}
          </Alert>
        )}
      </Modal>

      {/* Bulk Update Batch Modal */}
      <Modal
        isOpen={showBatchUpdate}
        onClose={() => setShowBatchUpdate(false)}
        title="Bulk Update Batch / Year"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowBatchUpdate(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={() => batchUpdateMut.mutate()} disabled={!batchCsvText.trim() || batchUpdateMut.isLoading}>
              {batchUpdateMut.isLoading ? 'Updating…' : 'Update Batches'}
            </Btn>
          </>
        }
      >
        <Alert type="info" className="mb-4">
          Update student batch assignments and year of study for semester re-shuffling.
        </Alert>
        <p className="text-xs text-annotation/70 mb-3 font-mono bg-deck p-2 rounded border border-rim">
          email,batch,year_of_study
          <br />
          alice@college.edu,CS-A,3
          <br />
          bob@college.edu,IT-B,2
        </p>
        <textarea
          value={batchCsvText}
          onChange={e => setBatchCsvText(e.target.value)}
          rows={10}
          placeholder="Paste CSV data here (email,batch,year_of_study)..."
          className="textarea-field"
        />
        {batchUpdateMut.data && (
          <Alert type="success" className="mt-3">
            Updated: {batchUpdateMut.data.updated} · Skipped: {batchUpdateMut.data.skipped}
          </Alert>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMut.mutate(deleteId)}
        title="Remove Student"
        message="This will permanently delete the student and all their submissions."
        confirmLabel="Remove"
      />
    </div>
  );
}
