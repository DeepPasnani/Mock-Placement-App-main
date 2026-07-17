import { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import { emailAPI, usersAPI, batchesAPI } from '../../services/api';
import { Btn, Modal, Alert, Spinner } from '../../components/shared/UI';
import toast from 'react-hot-toast';

const TEMPLATES = {
  blank: { label: 'Blank', subject: '', body: '' },
  welcome: { label: 'Welcome', subject: '🎓 Welcome to PlacementPro!', body: '<p>Hi {name},</p><p>Your account has been successfully created on <strong>PlacementPro</strong>.</p><p>Best of luck with your placement journey! 🚀</p>' },
  testScheduled: { label: 'Test Scheduled', subject: '📋 New Test Scheduled', body: '<p>Hi {name},</p><p>A new placement test has been scheduled. Log in for details.</p>' },
  testResults: { label: 'Test Results', subject: '📊 Your Results', body: '<p>Hi {name},</p><p>Your results are now available. Log in to view.</p>' },
  passwordReset: { label: 'Password Reset', subject: '🔐 Password Reset OTP', body: '<p>Hi {name},</p><p>Use the OTP provided to reset your password.</p>' },
};

const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EEE', 'ME', 'CE', 'AI', 'CSIT'];

export default function SendEmail() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [allStudents, setAllStudents] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [template, setTemplate] = useState('blank');
  const [studentSearch, setStudentSearch] = useState('');

  const { data: batchData } = useQuery('batches', batchesAPI.list);

  const { data: studentResults } = useQuery(
    ['students-search', studentSearch],
    () => usersAPI.list({ role: 'student', search: studentSearch, limit: 10 }),
    { enabled: studentSearch.length >= 2 }
  );

  const sendMut = useMutation(emailAPI.send, {
    onSuccess: (data) => {
      toast.success(`Email sent to ${data.sent} student(s)`);
      setShowConfirm(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const handleTemplateChange = (tplKey) => {
    setTemplate(tplKey);
    const tpl = TEMPLATES[tplKey] || TEMPLATES.blank;
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const toggleDept = (dept) => {
    setSelectedDepts(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const toggleBatch = (id) => {
    setSelectedBatches(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const toggleStudent = (id) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const getRecipientSummary = () => {
    if (allStudents) return 'All students';
    const parts = [];
    if (selectedDepts.length) parts.push(`${selectedDepts.length} dept(s)`);
    if (selectedBatches.length) parts.push(`${selectedBatches.length} batch(es)`);
    if (selectedStudents.length) parts.push(`${selectedStudents.length} student(s)`);
    return parts.join(', ') || 'No recipients selected';
  };

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    sendMut.mutate({
      subject: subject.trim(),
      html: body,
      recipients: {
        allStudents: allStudents || undefined,
        departments: selectedDepts.length ? selectedDepts : undefined,
        batches: selectedBatches.length ? selectedBatches : undefined,
        studentIds: selectedStudents.length ? selectedStudents : undefined,
      },
    });
  };

  // Insert HTML snippet at cursor position in the body textarea
  const insertAtCursor = (snippet) => {
    setBody(b => b + snippet);
  };

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Send Email</h1>
          <p className="section-subtitle">Compose and send emails to students</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Left: Composer ───────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          {/* Template selector */}
          <div>
            <label className="input-label">Template</label>
            <select
              value={template}
              onChange={e => handleTemplateChange(e.target.value)}
              className="select-field"
            >
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <option key={key} value={key}>{tpl.label}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="input-label">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="input-field"
              placeholder="Email subject…"
            />
          </div>

          {/* Body */}
          <div>
            <label className="input-label">Body (HTML)</label>
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                className="btn-ghost-icon text-sm leading-none px-2"
                onClick={() => insertAtCursor('<strong></strong>')}
                title="Bold"
                aria-label="Insert bold tags"
              ><strong>B</strong></button>
              <button
                type="button"
                className="btn-ghost-icon text-sm leading-none px-2"
                onClick={() => insertAtCursor('<em></em>')}
                title="Italic"
                aria-label="Insert italic tags"
              ><em>I</em></button>
              <button
                type="button"
                className="btn-ghost-icon text-sm leading-none px-2"
                onClick={() => insertAtCursor('<a href=""></a>')}
                title="Link"
                aria-label="Insert link tag"
              >🔗</button>
              <button
                type="button"
                className="btn-ghost-icon text-sm leading-none px-2"
                onClick={() => insertAtCursor('<ul>\n<li></li>\n</ul>')}
                title="List"
                aria-label="Insert list tags"
              >•</button>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="textarea-field"
              rows={14}
              placeholder="<p>Hello {name},</p>..."
            />
          </div>

          {/* Preview */}
          {body && (
            <div className="panel p-4">
              <div className="text-label mb-2" style={{ color: 'var(--ct-annotation)' }}>Preview</div>
              <div className="panel-muted p-4 text-ink" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              </div>
            </div>
          )}

          {/* Send button */}
          <div className="flex justify-end">
            <Btn
              variant="primary"
              onClick={() => setShowConfirm(true)}
              disabled={!subject.trim() || !body.trim()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Email
            </Btn>
          </div>
        </div>

        {/* ── Right: Recipients ────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="panel p-4 space-y-4">
            <h3 className="text-title" style={{ fontSize: '0.875rem' }}>Recipients</h3>

            {/* All students */}
            <label className="flex items-center gap-2.5 pb-3" style={{ borderBottom: '1px solid var(--ct-rim)' }}>
              <input
                type="checkbox"
                checked={allStudents}
                onChange={e => setAllStudents(e.target.checked)}
                className="focus-ring"
                style={{ accentColor: 'var(--ct-accent)', width: '1rem', height: '1rem' }}
              />
              <span className="text-body">All Students</span>
            </label>

            {!allStudents && (
              <>
                {/* Departments */}
                <div>
                  <p className="text-label mb-2">Departments</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DEPARTMENTS.map(dept => {
                      const active = selectedDepts.includes(dept);
                      return (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => toggleDept(dept)}
                          className={`focus-ring text-xs px-1.5 py-1 rounded-sm border cursor-pointer transition-all ${
                            active
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-rim text-annotation hover:bg-panel hover:text-ink'
                          }`}
                        >
                          {dept}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Batches */}
                <div>
                  <p className="text-label mb-2">Batches</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(batchData?.batches || []).map(b => {
                      const active = selectedBatches.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBatch(b.id)}
                          className={`focus-ring text-xs px-1.5 py-1 rounded-sm border cursor-pointer transition-all ${
                            active
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-rim text-annotation hover:bg-panel hover:text-ink'
                          }`}
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Individual students */}
                <div>
                  <p className="text-label mb-2">Individual Students</p>
                  <input
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="input-field text-sm mb-2"
                  />
                  <div className="rounded-sm max-h-40 overflow-y-auto">
                    {(studentResults?.users || []).map(s => {
                      const selected = selectedStudents.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors ${
                            selected ? 'bg-accent/[0.06]' : 'hover:bg-sunken'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleStudent(s.id)}
                            style={{ accentColor: 'var(--ct-accent)', width: '0.875rem', height: '0.875rem', flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="text-body" style={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.name || s.email}
                            </div>
                            <div className="text-caption" style={{ color: 'var(--ct-annotation)', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.email}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                    {studentSearch.length >= 2 && (studentResults?.users || []).length === 0 && (
                      <p className="text-caption" style={{ padding: '0.75rem 0.5rem', color: 'var(--ct-annotation)' }}>No students found</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Summary */}
            <div className="pt-3" style={{ borderTop: '1px solid var(--ct-rim)' }}>
              <div className="text-caption" style={{ color: 'var(--ct-annotation)' }}>
                Recipients: <strong style={{ color: 'var(--ct-ink)' }}>{getRecipientSummary()}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirm modal ─────────────────────────────────── */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Send Email?"
        width="max-w-sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowConfirm(false)} disabled={sendMut.isLoading}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSend} disabled={sendMut.isLoading}>
              {sendMut.isLoading ? <><Spinner size={14} /> Sending…</> : 'Send'}
            </Btn>
          </>
        }
      >
        <Alert type="warning" className="mb-3">
          This will email all selected recipients immediately.
        </Alert>
        <div className="space-y-2" style={{ fontSize: '0.875rem', color: 'var(--ct-ink)' }}>
          <p><strong>Subject:</strong> {subject}</p>
          <p><strong>Recipients:</strong> {getRecipientSummary()}</p>
        </div>
      </Modal>
    </div>
  );
}
