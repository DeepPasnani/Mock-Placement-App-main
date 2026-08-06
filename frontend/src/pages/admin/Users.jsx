import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { usersAPI } from '../../services/api';
import { Btn, Table, Badge, Modal, Input, Alert, ConfirmModal, Spinner } from '../../components/shared/UI';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const DEPT_ORDER = ['Computer Engineering', 'Computer Science and Design'];

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

const yearLabel = (y) => {
  if (y === null || y === undefined || y === '' || y === 'Any') return 'Any year';
  const num = Number(y);
  return Number.isFinite(num) ? `${num}${ordinal(num)} Year` : String(y);
};

/* ═══════════════════════════════════════════════════════════
 * Admin Users — Student management (clustered by
 * department → year of study → batch)
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

  const clusters = useMemo(() => {
    const deptMap = new Map();
    users.forEach(u => {
      const dept = u.department || 'Unassigned';
      const year = u.year_of_study ?? 'Any';
      const batch = u.batch || 'Unassigned';

      if (!deptMap.has(dept)) deptMap.set(dept, { department: dept, years: new Map(), total: 0 });
      const deptGroup = deptMap.get(dept);
      deptGroup.total++;

      if (!deptGroup.years.has(year)) deptGroup.years.set(year, { year, batches: new Map() });
      const yearGroup = deptGroup.years.get(year);

      if (!yearGroup.batches.has(batch)) yearGroup.batches.set(batch, { batch, students: [] });
      yearGroup.batches.get(batch).students.push(u);
    });

    return [...deptMap.values()]
      .sort((a, b) => {
        const da = DEPT_ORDER.indexOf(a.department);
        const db = DEPT_ORDER.indexOf(b.department);
        if (da !== -1 && db !== -1) return da - db;
        if (da !== -1) return -1;
        if (db !== -1) return 1;
        return a.department.localeCompare(b.department);
      })
      .map(dept => ({
        ...dept,
        years: [...dept.years.values()]
          .sort((a, b) => {
            const ay = a.year === 'Any' ? 0 : Number(a.year) || 99;
            const by = b.year === 'Any' ? 0 : Number(b.year) || 99;
            return ay - by;
          })
          .map(year => ({
            ...year,
            batches: [...year.batches.values()]
              .sort((a, b) => a.batch.localeCompare(b.batch, undefined, { numeric: true })),
          })),
      }));
  }, [users]);

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
      key: 'cluster',
      label: 'Department / Year / Batch',
      render: (u) => (
        <div className="flex flex-wrap gap-1 items-center">
          <Badge color="verify">{u.department || 'Unassigned'}</Badge>
          <Badge color="annotation">{yearLabel(u.year_of_study)}</Badge>
          <Badge color="clarify">{u.batch || 'Unassigned'}</Badge>
        </div>
      ),
    },
    {
      key: 'login',
      label: 'Login',
      render: (u) => (
        <Badge color={u.google_id ? 'clarify' : 'annotation'}>
          {u.google_id ? 'Google' : 'Email'}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <Badge color={u.is_active ? 'verify' : 'alert'}>
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
          aria-label="Search by name or email"
          className="input-field max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-accent" />
        </div>
      ) : clusters.length === 0 ? (
        <div className="text-center py-16 text-annotation text-sm">
          No students found.
        </div>
      ) : (
        <div className="space-y-5">
          {clusters.map(dept => (
            <div key={dept.department} className="panel overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-deck/40 border-b border-rim">
                <h3 className="font-display font-semibold text-sm text-ink">
                  {dept.department}
                </h3>
                <span className="text-2xs font-mono text-annotation/70">
                  {dept.total} student{dept.total === 1 ? '' : 's'}
                </span>
              </div>
              <div className="divide-y divide-rim">
                {dept.years.map(yr => (
                  <div key={`${dept.department}-${yr.year}`}>
                    <div className="px-4 py-1.5 bg-deck/20 flex items-center gap-2">
                      <svg className="w-3 h-3 text-annotation/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs font-medium text-annotation">
                        {yearLabel(yr.year)}
                      </span>
                    </div>
                    {yr.batches.map(b => (
                      <div key={`${dept.department}-${yr.year}-${b.batch}`} className="border-t border-rim/40">
                        <div className="px-4 py-1.5 flex items-center gap-2 bg-deck/10">
                          <svg className="w-3 h-3 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-xs font-semibold text-ink">{b.batch}</span>
                          <span className="text-2xs font-mono text-annotation/60">
                            {b.students.length} student{b.students.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <Table
                          columns={columns}
                          data={b.students}
                          emptyMessage="No students in this cluster."
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
          Alice Smith,alice@college.edu,Computer Engineering,CS001
          <br />
          Bob Jones,bob@college.edu,Computer Science and Design,CSD042
        </p>
        <textarea
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={10}
          placeholder="Paste CSV data here…"
          aria-label="Paste CSV data here"
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
          aria-label="Paste CSV data here (email,batch,year_of_study)"
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
