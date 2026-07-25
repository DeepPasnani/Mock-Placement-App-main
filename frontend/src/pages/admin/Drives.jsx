import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { drivesAPI, testsAPI, batchesAPI } from '../../services/api';
import { Btn, Spinner, Modal, Badge } from '../../components/shared/UI';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const toLocalDatetimeString = (utcStr) => {
  if (!utcStr) return '';
  const d = new Date(utcStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
};

export default function AdminDrives() {
  const qc = useQueryClient();
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [editing, setEditing] = useState(null);

  const { data: drivesData, isLoading } = useQuery({ queryKey: ['drives'], queryFn: drivesAPI.list });
  const { data: testsData } = useQuery({ queryKey: ['tests'], queryFn: testsAPI.list });
  const { data: batchesData } = useQuery({ queryKey: ['batches'], queryFn: batchesAPI.list });

  const drives = drivesData?.drives || [];
  const tests = testsData?.tests || [];
  const batches = batchesData?.batches || [];

  const deleteMut = useMutation({
    mutationFn: drivesAPI.delete,
    onSuccess: () => { toast.success('Drive deleted'); qc.invalidateQueries({ queryKey: ['drives'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => drivesAPI.update(id, data),
    onSuccess: () => { toast.success('Drive updated'); qc.invalidateQueries({ queryKey: ['drives'] }); setEditing(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const addTestMut = useMutation({
    mutationFn: ({ id, data }) => drivesAPI.addTest(id, data),
    onSuccess: () => { toast.success('Test added to drive'); qc.invalidateQueries({ queryKey: ['drives'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const removeTestMut = useMutation({
    mutationFn: ({ id, testId }) => drivesAPI.removeTest(id, testId),
    onSuccess: () => { toast.success('Test removed'); qc.invalidateQueries({ queryKey: ['drives'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const addBatchMut = useMutation({
    mutationFn: ({ id, data }) => drivesAPI.addBatch(id, data),
    onSuccess: () => { toast.success('Batch added to drive'); qc.invalidateQueries({ queryKey: ['drives'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const removeBatchMut = useMutation({
    mutationFn: ({ id, batchId }) => drivesAPI.removeBatch(id, batchId),
    onSuccess: () => { toast.success('Batch removed'); qc.invalidateQueries({ queryKey: ['drives'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const statusColor = (s) => {
    const map = { draft: 'yellow', published: 'blue', in_progress: 'green', completed: 'gray', archived: 'gray' };
    return map[s] || 'gray';
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Drives</h1>
          <p className="section-subtitle">Manage placement drives</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 4v16m8-8H4" />
          </svg>
          New Drive
        </Btn>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size={28} className="text-accent" /></div>
      ) : drives.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="empty-state-title">No drives yet</p>
          <p className="empty-state-desc">Create a placement drive to group tests and batches together.</p>
          <Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create First Drive</Btn>
        </div>
      ) : (
        <div className="grid gap-3">
          {drives.map(d => (
            <div key={d.id} className="panel p-4 hover:ring-1 hover:ring-accent/20 transition-all cursor-pointer"
              onClick={() => setShowDetail(d)}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-ink">{d.title}</h3>
                    <Badge color={statusColor(d.status)}>{d.status}</Badge>
                  </div>
                  <p className="text-xs text-annotation/70 truncate">{d.description || 'No description'}</p>
                  <div className="flex gap-4 mt-2 text-2xs text-annotation/60">
                    <span>{d.department}</span>
                    {d.start_time && <span>Start: {format(new Date(d.start_time), 'dd MMM yyyy, HH:mm')}</span>}
                    {d.mcq_duration_minutes && <span>MCQ: {d.mcq_duration_minutes}min</span>}
                    {d.coding_duration_minutes && <span>Coding: {d.coding_duration_minutes}min</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setEditing(d); }}
                  className="btn-ghost-icon text-annotation hover:text-accent" title="Edit">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Drive Modal */}
      <DriveFormModal isOpen={showCreate} onClose={() => setShowCreate(false)}
        onSave={async (data) => {
          await drivesAPI.create(data);
          toast.success('Drive created');
          qc.invalidateQueries({ queryKey: ['drives'] });
          setShowCreate(false);
        }} />

      {/* Edit Drive Modal */}
      <DriveFormModal isOpen={!!editing} onClose={() => setEditing(null)}
        initial={editing}
        onSave={async (data) => {
          await drivesAPI.update(editing.id, data);
          toast.success('Drive updated');
          qc.invalidateQueries({ queryKey: ['drives'] });
          setEditing(null);
        }} />

      {/* Drive Detail Modal */}
      <DriveDetailModal isOpen={!!showDetail} drive={showDetail}
        tests={tests} batches={batches}
        onClose={() => setShowDetail(null)}
        onAddTest={(testId, round) => addTestMut.mutate({ id: showDetail.id, data: { test_id: testId, round_number: round, round_type: 'aptitude' } })}
        onRemoveTest={(testId) => removeTestMut.mutate({ id: showDetail.id, testId })}
        onAddBatch={(batchId) => addBatchMut.mutate({ id: showDetail.id, data: { batch_id: batchId } })}
        onRemoveBatch={(batchId) => removeBatchMut.mutate({ id: showDetail.id, batchId })}
        onDelete={() => { deleteMut.mutate(showDetail.id); setShowDetail(null); }}
      />
    </div>
  );
}

function DriveFormModal({ isOpen, onClose, initial, onSave }) {
  const [form, setForm] = useState(initial || {
    title: '', description: '', department: 'Computer Engineering',
    start_time: '', end_time: '', mcq_duration_minutes: 60, coding_duration_minutes: 120, passing_score: 40,
  });
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Drive' : 'Create Drive'} width="max-w-xl">
      <div className="space-y-3">
        <div>
          <label className="input-label">Title *</label>
          <input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="input-label">Description</label>
          <textarea className="textarea-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Department</label>
            <select className="select-field" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              {['Computer Engineering', 'Information Technology', 'Electronics & Communication', 'Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering', 'All Departments'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Passing Score (%)</label>
            <input className="input-field" type="number" min={0} max={100} value={form.passing_score} onChange={e => setForm({ ...form, passing_score: +e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">MCQ Duration (min)</label>
            <input className="input-field" type="number" min={1} value={form.mcq_duration_minutes} onChange={e => setForm({ ...form, mcq_duration_minutes: +e.target.value })} />
          </div>
          <div>
            <label className="input-label">Coding Duration (min)</label>
            <input className="input-field" type="number" min={1} value={form.coding_duration_minutes} onChange={e => setForm({ ...form, coding_duration_minutes: +e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Start Time</label>
            <input className="input-field" type="datetime-local" value={form.start_time ? toLocalDatetimeString(form.start_time) : ''} onChange={e => setForm({ ...form, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          </div>
          <div>
            <label className="input-label">End Time</label>
            <input className="input-field" type="datetime-local" value={form.end_time ? toLocalDatetimeString(form.end_time) : ''} onChange={e => setForm({ ...form, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-5">
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" disabled={saving || !form.title} onClick={async () => {
          setSaving(true); try { await onSave(form); } finally { setSaving(false); }
        }}>{saving ? 'Saving…' : initial ? 'Update' : 'Create'}</Btn>
      </div>
    </Modal>
  );
}

function DriveDetailModal({ isOpen, drive, tests, batches, onClose, onAddTest, onRemoveTest, onAddBatch, onRemoveBatch, onDelete }) {
  const [addTestId, setAddTestId] = useState('');
  const [addBatchId, setAddBatchId] = useState('');
  const [roundNum, setRoundNum] = useState(1);

  if (!isOpen || !drive) return null;

  const driveTests = Array.isArray(drive.tests) ? drive.tests : [];
  const driveBatches = Array.isArray(drive.batches) ? drive.batches : [];
  const addedTestIds = driveTests.map(t => t.test_id);
  const addedBatchIds = driveBatches.map(b => b.batch_id);
  const availableTests = tests.filter(t => !addedTestIds.includes(t.id));
  const availableBatches = batches.filter(b => !addedBatchIds.includes(b.id));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={drive.title} width="max-w-2xl">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Badge color={{ draft: 'yellow', published: 'blue', in_progress: 'green', completed: 'gray' }[drive.status] || 'gray'}>{drive.status}</Badge>
          <span className="text-xs text-annotation/60">{drive.department}</span>
        </div>
        {drive.description && <p className="text-sm text-annotation">{drive.description}</p>}

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="panel p-3"><div className="text-lg font-bold text-accent">{drive.mcq_duration_minutes}</div><div className="text-2xs text-annotation/60">MCQ (min)</div></div>
          <div className="panel p-3"><div className="text-lg font-bold text-clarify">{drive.coding_duration_minutes}</div><div className="text-2xs text-annotation/60">Coding (min)</div></div>
          <div className="panel p-3"><div className="text-lg font-bold text-verify">{drive.passing_score}%</div><div className="text-2xs text-annotation/60">Pass Score</div></div>
        </div>

        {/* Tests in Drive */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-ink">Tests ({driveTests.length})</h4>
            {availableTests.length > 0 && (
              <div className="flex gap-2 items-center">
                <select className="select-field text-xs py-1 max-w-40" value={addTestId} onChange={e => setAddTestId(e.target.value)}>
                  <option value="">Select test…</option>
                  {availableTests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                <input className="input-field text-xs py-1 w-16" type="number" min={1} value={roundNum} onChange={e => setRoundNum(+e.target.value)} placeholder="Round" />
                <Btn variant="primary" size="sm" disabled={!addTestId} onClick={() => { onAddTest(addTestId, roundNum); setAddTestId(''); }}>Add</Btn>
              </div>
            )}
          </div>
          {driveTests.length === 0 ? (
            <p className="text-xs text-annotation/50 py-2">No tests added to this drive yet.</p>
          ) : (
            <div className="space-y-1">
              {driveTests.map(t => (
                <div key={t.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-deck/50">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-mono text-annotation/50">R{t.round_number}</span>
                    <span className="text-sm text-ink">{t.test_title}</span>
                    <Badge color={t.test_status === 'published' ? 'green' : 'yellow'}>{t.test_status}</Badge>
                  </div>
                  <button onClick={() => onRemoveTest(t.test_id)} className="btn-ghost-icon text-annotation hover:text-alert" title="Remove">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Batches in Drive */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-ink">Batches ({driveBatches.length})</h4>
            {availableBatches.length > 0 && (
              <div className="flex gap-2 items-center">
                <select className="select-field text-xs py-1 max-w-40" value={addBatchId} onChange={e => setAddBatchId(e.target.value)}>
                  <option value="">Select batch…</option>
                  {availableBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name} ({b.department})</option>)}
                </select>
                <Btn variant="primary" size="sm" disabled={!addBatchId} onClick={() => { onAddBatch(addBatchId); setAddBatchId(''); }}>Add</Btn>
              </div>
            )}
          </div>
          {driveBatches.length === 0 ? (
            <p className="text-xs text-annotation/50 py-2">No batches mapped to this drive yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {driveBatches.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent/10 text-xs text-accent">
                  {b.batch_name}
                  <button onClick={() => onRemoveBatch(b.batch_id)} className="hover:text-alert">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-between pt-3 border-t border-rim">
          {drive.status !== 'completed' && (
            <Btn variant="primary" size="sm" onClick={async () => {
              const newStatus = drive.status === 'draft' ? 'published' : drive.status === 'published' ? 'in_progress' : 'completed';
              await drivesAPI.update(drive.id, { status: newStatus });
              toast.success(`Drive status: ${newStatus}`);
              onClose();
            }}>Move to {drive.status === 'draft' ? 'Published' : drive.status === 'published' ? 'In Progress' : 'Completed'}</Btn>
          )}
          <Btn variant="danger" size="sm" onClick={() => { if (confirm('Delete this drive?')) onDelete(); }}>Delete Drive</Btn>
        </div>
      </div>
    </Modal>
  );
}
