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

  const departments = ['CSE', 'IT', 'ECE', 'EEE', 'ME', 'CE', 'AI', 'CSIT'];

  return (
    <div className="max-w-4xl animate-fade-up">
      <div className="section-header">
        <div>
          <h1 className="section-title">Send Email</h1>
          <p className="section-subtitle">Compose and send emails to students</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: composer */}
        <div className="lg:col-span-3 space-y-4">
          {/* Template selector */}
          <div>
            <label className="input-label">Template</label>
            <select
              value={template}
              onChange={e => handleTemplateChange(e.target.value)}
              className="select-field w-full"
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
              className="input-field w-full"
              placeholder="Email subject…"
            />
          </div>

          {/* Body */}
          <div>
            <label className="input-label">Body (HTML)</label>
            <div className="flex gap-1 mb-1.5">
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<strong></strong>')}
                title="Bold"
              ><strong>B</strong></button>
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<em></em>')}
                title="Italic"
              ><em>I</em></button>
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<a href=""></a>')}
                title="Link"
              >🔗</button>
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<ul>\n<li></li>\n</ul>')}
                title="List"
              >•</button>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="textarea-field w-full font-mono text-xs"
              rows={12}
              placeholder="<p>Hello {name},</p>..."
            />
          </div>

          {/* Preview */}
          {body && (
            <div className="panel p-4">
              <div className="text-xs text-annotation font-semibold mb-2">Preview</div>
              <div className="border border-rim rounded-lg p-4 bg-white text-black text-sm max-h-64 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: body }} />
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Email
            </Btn>
          </div>
        </div>

        {/* Right: recipients */}
        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-4">
            <h3 className="text-sm font-display font-bold text-ink mb-3">Recipients</h3>

            {/* All students toggle */}
            <label className="flex items-center gap-2 mb-3 pb-3 border-b border-rim">
              <input
                type="checkbox"
                checked={allStudents}
                onChange={e => setAllStudents(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm text-ink">All Students</span>
            </label>

            {!allStudents && (
              <>
                {/* Departments */}
                <div className="mb-3">
                  <p className="text-xs text-annotation font-semibold mb-1.5">Departments</p>
                  <div className="flex flex-wrap gap-1">
                    {departments.map(dept => (
                      <button
                        key={dept}
                        onClick={() => toggleDept(dept)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          selectedDepts.includes(dept)
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-rim text-annotation hover:text-ink'
                        }`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Batches */}
                <div className="mb-3">
                  <p className="text-xs text-annotation font-semibold mb-1.5">Batches</p>
                  <div className="flex flex-wrap gap-1">
                    {(batchData?.batches || []).map(b => (
                      <button
                        key={b.id}
                        onClick={() => toggleBatch(b.id)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          selectedBatches.includes(b.id)
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-rim text-annotation hover:text-ink'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Individual students */}
                <div>
                  <p className="text-xs text-annotation font-semibold mb-1.5">Individual Students</p>
                  <input
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="input-field w-full text-xs mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(studentResults?.users || []).map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-panel rounded px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(s.id)}
                          onChange={() => toggleStudent(s.id)}
                          className="accent-accent w-3.5 h-3.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-ink truncate">{s.name || s.email}</div>
                          <div className="text-2xs text-annotation/60 truncate">{s.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Summary */}
            <div className="mt-4 pt-3 border-t border-rim">
              <div className="text-xs text-annotation">
                Recipients: <span className="text-ink font-semibold">{getRecipientSummary()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
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
        <div className="space-y-1 text-sm text-ink/80">
          <p><strong>Subject:</strong> {subject}</p>
          <p><strong>Recipients:</strong> {getRecipientSummary()}</p>
        </div>
      </Modal>
    </div>
  );
}
