import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { testsAPI, uploadAPI, questionBankAPI } from '../../services/api';
import { Btn, Input, Select, Textarea, Alert, ImageUpload, Tabs, Spinner, HelpTip, Modal, Badge } from '../../components/shared/UI';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 * Admin Test Creator — Assessment builder
 *
 * Three-step flow: Configuration → Questions → Review & Publish.
 * ═══════════════════════════════════════════════════════════ */

const genId = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const DEFAULT_TEST = {
  title: '',
  description: '',
  status: 'draft',
  startTime: '',
  endTime: '',
  durationMinutes: 90,
  department: '',
  settings: {
    shuffleQuestions: true,
    shuffleOptions: true,
    showResults: 'after_submit',
    passingScore: 40,
    negativeMarking: false,
    negativeFraction: 0.25,
    allowedBranches: '',
    allowedLanguages: ['python', 'javascript', 'java', 'cpp'],
  },
  sections: [],
};

const DEPARTMENTS = [
  'Computer Engineering',
  'Computer Science and Design',
  'Aeronautical Engineering',
  'Electrical Engineering',
  'Electronics and Communication Engineering',
  'Civil Engineering',
];

const DEFAULT_APT_Q = () => ({
  _id: genId(),
  type: 'mcq',
  text: '',
  imageUrl: '',
  options: ['', '', '', ''],
  optionImages: ['', '', '', ''],
  correctAnswer: 0,
  explanation: '',
  marks: 2,
  difficulty: 'medium',
  genre: 'general',
  questionSet: 'A',
});

const DEFAULT_CODE_Q = () => ({
  _id: genId(),
  title: '',
  description: '',
  imageUrl: '',
  inputFormat: '',
  outputFormat: '',
  constraints: '',
  sampleInput: '',
  sampleOutput: '',
  explanation: '',
  testCases: [{ input: '', output: '', isHidden: false }],
  starterCode: {
    python: '# Write your solution here\n',
    javascript: '// Write your solution here\n',
    java:
      'public class Solution {\n    public static void main(String[] args) {\n        // Write your solution\n    }\n}\n',
    cpp:
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution\n    return 0;\n}\n',
  },
  timeLimit: 2,
  memoryLimit: 256,
  marks: 10,
  difficulty: 'medium',
  tags: '',
});

// ── Aptitude Question Editor ───────────────────────────────
// ── Question Bank picker ─────────────────────────────────────
// Lets an admin browse the reusable Question Bank and drop a
// question straight into the section they're currently editing.
function BankPickerModal({ open, onClose, type, onPick }) {
  const { data, isLoading } = useQuery(
    ['question-bank', type],
    () => questionBankAPI.list({ type }),
    { enabled: open }
  );
  const questions = data?.questions || [];

  return (
    <Modal isOpen={open} onClose={onClose} title={`Add from Bank — ${type === 'mcq' ? 'MCQ' : 'Coding'} Questions`} width="max-w-2xl">
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : questions.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No {type === 'mcq' ? 'MCQ' : 'coding'} questions in the bank yet.</p>
          <p className="text-xs text-annotation/60 mt-1">Add some from the Question Bank page first.</p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2">
          {questions.map(q => (
            <button
              key={q.id}
              onClick={() => { onPick(q); onClose(); }}
              className="w-full text-left panel p-3 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-ink line-clamp-2">{type === 'mcq' ? q.data?.text : q.data?.title}</span>
                <Badge color={q.difficulty === 'hard' ? 'red' : q.difficulty === 'easy' ? 'green' : 'yellow'}>{q.difficulty}</Badge>
              </div>
              <div className="text-xs text-annotation/60 mt-1">{q.marks} marks{q.genre ? ` · ${q.genre}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AptQEditor({ q, onChange, onRemove }) {
  const update = (f, v) => onChange({ ...q, [f]: v });
  const updateOption = (i, v) => {
    const o = [...q.options];
    o[i] = v;
    update('options', o);
  };

  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex gap-2 flex-wrap flex-1">
          <Select
            value={q.type}
            onChange={e => update('type', e.target.value)}
            className="w-36 text-xs py-1.5"
          >
            <option value="mcq">MCQ (Single)</option>
            <option value="msq">MSQ (Multi)</option>
            <option value="truefalse">True / False</option>
            <option value="fillblank">Fill in Blank</option>
            <option value="numerical">Numerical</option>
          </Select>
          <Select
            value={q.genre || 'general'}
            onChange={e => update('genre', e.target.value)}
            className="w-32 text-xs py-1.5"
          >
            <option value="general">General</option>
            <option value="quantitative">Quantitative</option>
            <option value="aptitude">General Aptitude</option>
            <option value="technical">Technical</option>
            <option value="verbal">Verbal Reasoning</option>
            <option value="logical">Logical</option>
            <option value="data_interpretation">Data Interpretation</option>
          </Select>
          <Select
            value={q.questionSet || 'A'}
            onChange={e => update('questionSet', e.target.value)}
            className="w-20 text-xs py-1.5"
          >
            <option value="A">Set A</option>
            <option value="B">Set B</option>
            <option value="C">Set C</option>
            <option value="D">Set D</option>
          </Select>
          <Input
            type="number"
            value={q.marks}
            onChange={e => update('marks', +e.target.value)}
            min={1}
            max={20}
            className="w-16 text-xs py-1.5"
            placeholder="Marks"
          />
          <Select
            value={q.difficulty}
            onChange={e => update('difficulty', e.target.value)}
            className="w-24 text-xs py-1.5"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </div>
        <Btn variant="danger" size="sm" onClick={onRemove} className="shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </Btn>
      </div>

      <Textarea
        value={q.text}
        onChange={e => update('text', e.target.value)}
        placeholder="Enter question text..."
        rows={3}
        className="mb-3 text-sm"
      />

      <ImageUpload
        value={q.imageUrl}
        onChange={async (file) => {
          if (typeof file === 'string') { update('imageUrl', file); return; }
          try { const r = await uploadAPI.image(file); update('imageUrl', r.url); } catch { toast.error('Image upload failed'); }
        }}
        label="Attach Image"
      />

      {(q.type === 'mcq' || q.type === 'msq') && (
        <div className="mt-3 space-y-2">
          <p className="text-2xs text-annotation/70 mb-2">
            Options — {q.type === 'msq' ? 'check all correct' : 'select correct'}
          </p>
          {q.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={q.type === 'msq' ? 'checkbox' : 'radio'}
                name={`correct_${q._id}`}
                checked={
                  q.type === 'msq'
                    ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(i)
                    : q.correctAnswer === i
                }
                onChange={() => {
                  if (q.type === 'msq') {
                    const ca = Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : [];
                    const idx = ca.indexOf(i);
                    idx > -1 ? ca.splice(idx, 1) : ca.push(i);
                    update('correctAnswer', ca);
                  } else update('correctAnswer', i);
                }}
                className="accent-accent w-4 h-4 shrink-0 cursor-pointer"
              />
              <span className="text-xs font-mono text-annotation w-5 shrink-0">
                {String.fromCharCode(65 + i)}.
              </span>
              <input
                value={opt}
                onChange={e => updateOption(i, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className="input-field text-sm py-1.5"
              />
            </div>
          ))}
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...q, options: [...q.options, ''] })}
          >
            + Add Option
          </Btn>
        </div>
      )}

      {q.type === 'truefalse' && (
        <div className="flex gap-4 mt-3">
          {['True', 'False'].map(v => (
            <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-ink">
              <input
                type="radio"
                checked={q.correctAnswer === v}
                onChange={() => update('correctAnswer', v)}
                className="accent-accent"
              />
              {v}
            </label>
          ))}
        </div>
      )}

      {(q.type === 'fillblank' || q.type === 'numerical') && (
        <Input
          value={q.correctAnswer || ''}
          onChange={e => update('correctAnswer', e.target.value)}
          placeholder={q.type === 'numerical' ? 'Correct numeric answer' : 'Correct answer'}
          className="mt-3 max-w-xs text-sm"
        />
      )}

      <Textarea
        value={q.explanation}
        onChange={e => update('explanation', e.target.value)}
        placeholder="Explanation (shown after submission, optional)"
        rows={2}
        className="mt-3 text-sm"
      />
    </div>
  );
}

// ── Coding Problem Editor ──────────────────────────────────
function CodeQEditor({ q, onChange, onRemove }) {
  const [tab, setTab] = useState('desc');
  const [codeLang, setCodeLang] = useState('python');
  const update = (f, v) => onChange({ ...q, [f]: v });
  const TABS = [
    { id: 'desc', label: 'Description' },
    { id: 'io', label: 'I/O & Format' },
    { id: 'tests', label: 'Test Cases' },
    { id: 'code', label: 'Starter Code' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap items-center flex-1">
          <Input
            value={q.title}
            onChange={e => update('title', e.target.value)}
            placeholder="Problem Title"
            className="w-48 text-sm py-1.5"
          />
          <Input
            type="number"
            value={q.marks}
            onChange={e => update('marks', +e.target.value)}
            min={1}
            className="w-16 text-sm py-1.5"
            placeholder="Marks"
          />
          <Select
            value={q.difficulty}
            onChange={e => update('difficulty', e.target.value)}
            className="w-24 text-sm py-1.5"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Input
            value={q.tags}
            onChange={e => update('tags', e.target.value)}
            placeholder="Tags (e.g. arrays, dp)"
            className="w-36 text-sm py-1.5"
          />
        </div>
        <Btn variant="danger" size="sm" onClick={onRemove}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </Btn>
      </div>

      <div className="tab-bar mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`tab-btn ${tab === t.id ? 'tab-btn--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'desc' && (
        <div className="space-y-3">
          <Textarea
            value={q.description}
            onChange={e => update('description', e.target.value)}
            placeholder="Full problem description..."
            rows={7}
            className="text-sm"
          />
          <ImageUpload
            value={q.imageUrl}
            onChange={async (file) => {
              if (typeof file === 'string') { update('imageUrl', file); return; }
              try { const r = await uploadAPI.image(file); update('imageUrl', r.url); } catch { toast.error('Upload failed'); }
            }}
            label="Attach Diagram"
          />
        </div>
      )}

      {tab === 'io' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Textarea
            label="Input Format"
            value={q.inputFormat}
            onChange={e => update('inputFormat', e.target.value)}
            rows={5}
            className="text-sm"
          />
          <Textarea
            label="Output Format"
            value={q.outputFormat}
            onChange={e => update('outputFormat', e.target.value)}
            rows={5}
            className="text-sm"
          />
          <Textarea
            label="Constraints"
            value={q.constraints}
            onChange={e => update('constraints', e.target.value)}
            rows={4}
            className="text-sm"
          />
          <Textarea
            label="Explanation (after submit)"
            value={q.explanation}
            onChange={e => update('explanation', e.target.value)}
            rows={4}
            className="text-sm"
          />
          <div>
            <label className="input-label">Sample Input</label>
            <textarea
              value={q.sampleInput}
              onChange={e => update('sampleInput', e.target.value)}
              rows={4}
              className="textarea-field font-mono text-xs bg-deck text-verify"
            />
          </div>
          <div>
            <label className="input-label">Sample Output</label>
            <textarea
              value={q.sampleOutput}
              onChange={e => update('sampleOutput', e.target.value)}
              rows={4}
              className="textarea-field font-mono text-xs bg-deck text-verify"
            />
          </div>
        </div>
      )}

      {tab === 'tests' && (
        <div>
          <Alert type="info" className="mb-3">
            Hidden test cases are used for final grading. Visible ones serve as examples.
          </Alert>
          <div className="space-y-3">
            {q.testCases.map((tc, i) => (
              <div key={i} className="panel-muted p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-annotation font-mono">
                    Test Case {i + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-2xs text-annotation/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tc.isHidden}
                        onChange={e => {
                          const t = [...q.testCases];
                          t[i] = { ...t[i], isHidden: e.target.checked };
                          update('testCases', t);
                        }}
                        className="accent-accent"
                      />
                      Hidden
                    </label>
                    <button
                      onClick={() =>
                        update('testCases', q.testCases.filter((_, j) => j !== i))
                      }
                      className="btn-ghost-icon text-annotation hover:text-alert"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <textarea
                    value={tc.input}
                    onChange={e => {
                      const t = [...q.testCases];
                      t[i] = { ...t[i], input: e.target.value };
                      update('testCases', t);
                    }}
                    rows={3}
                    placeholder="Input"
                    className="textarea-field font-mono text-xs bg-deck text-verify"
                  />
                  <textarea
                    value={tc.output}
                    onChange={e => {
                      const t = [...q.testCases];
                      t[i] = { ...t[i], output: e.target.value };
                      update('testCases', t);
                    }}
                    rows={3}
                    placeholder="Expected Output"
                    className="textarea-field font-mono text-xs bg-deck text-verify"
                  />
                </div>
              </div>
            ))}
          </div>
          <Btn
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              update('testCases', [
                ...q.testCases,
                { input: '', output: '', isHidden: false },
              ])
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Test Case
          </Btn>
        </div>
      )}

      {tab === 'code' && (
        <div>
          <div className="flex gap-2 mb-3">
            {Object.keys(q.starterCode).map(lang => (
              <button
                key={lang}
                onClick={() => setCodeLang(lang)}
                className={`tab-btn ${
                  codeLang === lang ? 'tab-btn--active' : 'tab-btn--inactive'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
          <Editor
            height="200px"
            language={
              codeLang === 'cpp'
                ? 'cpp'
                : codeLang === 'java'
                ? 'java'
                : codeLang
            }
            value={q.starterCode[codeLang]}
            theme="vs-dark"
            onChange={v =>
              update('starterCode', {
                ...q.starterCode,
                [codeLang]: v || '',
              })
            }
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Time Limit (seconds)"
            type="number"
            min={1}
            max={30}
            value={q.timeLimit}
            onChange={e => update('timeLimit', +e.target.value)}
            hint="Max execution time per test case"
          />
          <Input
            label="Memory Limit (MB)"
            type="number"
            min={32}
            max={512}
            value={q.memoryLimit}
            onChange={e => update('memoryLimit', +e.target.value)}
            hint="Max memory usage"
          />
        </div>
      )}
    </div>
  );
}

// ── Main Test Creator ───────────────────────────────────────
export default function TestCreator() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(DEFAULT_TEST);
  const [activeSection, setActiveSection] = useState(0);
  const [bankOpen, setBankOpen] = useState(false);
  const isEdit = !!id;

  // ── Keyboard shortcut: Ctrl+S → save draft ───────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (form.title.trim()) {
          handleSave('draft');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const { isLoading: loadingTest } = useQuery(
    ['test', id],
    () => testsAPI.get(id),
    {
      enabled: !!id,
      onSuccess: (data) => {
        setForm({
          title: data.title,
          description: data.description,
          status: data.status,
          startTime: data.start_time
            ? new Date(
                new Date(data.start_time).getTime() -
                  new Date(data.start_time).getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)
            : '',
          endTime: data.end_time
            ? new Date(
                new Date(data.end_time).getTime() -
                  new Date(data.end_time).getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)
            : '',
          durationMinutes: data.duration_minutes,
          settings: data.settings || DEFAULT_TEST.settings,
          sections: (data.sections || []).map(s => ({
            ...s,
            questions: (s.questions || []).map(q => ({
              ...q,
              _id: q.id || genId(),
            })),
          })),
        });
      },
    },
  );

  const saveMut = useMutation(
    (payload) => (isEdit ? testsAPI.update(id, payload) : testsAPI.create(payload)),
    {
      onSuccess: () => {
        toast.success(isEdit ? 'Test updated!' : 'Test created!');
        qc.invalidateQueries('tests');
        navigate('/admin/tests');
      },
      onError: (e) => toast.error(e.response?.data?.error || 'Save failed'),
    },
  );

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const updSettings = (f, v) =>
    setForm(p => ({ ...p, settings: { ...p.settings, [f]: v } }));

  const addSection = (type) => {
    const sec = {
      _id: genId(),
      name: type === 'aptitude' ? 'Aptitude' : 'Coding',
      type,
      questions: [],
    };
    setForm(p => ({ ...p, sections: [...p.sections, sec] }));
    setActiveSection(form.sections.length);
  };

  const updateSection = (si, f, v) => {
    setForm(p => {
      const s = [...p.sections];
      s[si] = { ...s[si], [f]: v };
      return { ...p, sections: s };
    });
  };

  const addQuestion = (si) => {
    setForm(p => {
      const s = [...p.sections];
      s[si].questions = [
        ...s[si].questions,
        s[si].type === 'aptitude' ? DEFAULT_APT_Q() : DEFAULT_CODE_Q(),
      ];
      return { ...p, sections: s };
    });
  };

  // Clone a Question Bank entry into the active section, giving it a
  // fresh local id so it edits independently of the bank original.
  const addQuestionFromBank = (si, bankQ) => {
    setForm(p => {
      const s = [...p.sections];
      const cloned = s[si].type === 'aptitude'
        ? {
            ...DEFAULT_APT_Q(),
            text: bankQ.data.text || '',
            options: bankQ.data.options || ['', '', '', ''],
            correctAnswer: bankQ.data.correctAnswer ?? 0,
            genre: bankQ.genre || 'general',
            difficulty: bankQ.difficulty || 'medium',
            marks: bankQ.marks || 2,
          }
        : {
            ...DEFAULT_CODE_Q(),
            title: bankQ.data.title || '',
            description: bankQ.data.description || '',
            testCases: bankQ.data.testCases?.length ? bankQ.data.testCases : [{ input: '', output: '', isHidden: false }],
            difficulty: bankQ.difficulty || 'medium',
            marks: bankQ.marks || 10,
          };
      s[si].questions = [...s[si].questions, cloned];
      return { ...p, sections: s };
    });
    toast.success('Added from bank');
  };

  const updateQuestion = (si, qi, q) => {
    setForm(p => {
      const s = [...p.sections];
      s[si].questions = s[si].questions.map((qq, i) => (i === qi ? q : qq));
      return { ...p, sections: s };
    });
  };

  const removeQuestion = (si, qi) => {
    setForm(p => {
      const s = [...p.sections];
      s[si].questions = s[si].questions.filter((_, i) => i !== qi);
      return { ...p, sections: s };
    });
  };

  const removeSection = (si) => {
    setForm(p => {
      const s = p.sections.filter((_, i) => i !== si);
      return { ...p, sections: s };
    });
    setActiveSection(Math.max(0, activeSection - 1));
  };

  const handleSave = (status) => {
    if (!form.title.trim()) {
      toast.error('Test title is required');
      setStep(0);
      return;
    }
    if (!form.department) {
      toast.error('Department is required');
      setStep(0);
      return;
    }

    const convertToUTC = (localDateTime) => {
      if (!localDateTime) return null;
      const date = new Date(localDateTime);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
    };

    const payload = {
      title: form.title,
      description: form.description,
      status: status || form.status,
      startTime: convertToUTC(form.startTime),
      endTime: convertToUTC(form.endTime),
      durationMinutes: form.durationMinutes,
      department: form.department,
      settings: form.settings,
      sections: form.sections.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        questions: s.questions.map(q => ({ ...q, imageUrl: q.imageUrl || q.image_url })),
      })),
    };
    saveMut.mutate(payload);
  };

  if (loadingTest)
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} className="text-accent" />
      </div>
    );

  const STEPS = ['Configuration', 'Questions', 'Review & Publish'];
  const totalQ = form.sections.reduce((n, s) => n + s.questions.length, 0);
  const totalM = form.sections.reduce(
    (n, s) => n + s.questions.reduce((m, q) => m + (q.marks || 0), 0),
    0,
  );
  const sec = form.sections[activeSection];

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/tests')}
            className="btn-ghost-icon"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-ink">
              {isEdit ? 'Edit Test' : 'Create Test'}
            </h1>
            {form.title && (
              <p className="text-xs text-annotation/60">{form.title}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Btn
            variant="ghost"
            onClick={() => handleSave('draft')}
            disabled={saveMut.isLoading}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Draft
          </Btn>
          <Btn
            variant="primary"
            onClick={() => handleSave('published')}
            disabled={saveMut.isLoading}
          >
            {saveMut.isLoading ? 'Saving…' : 'Publish'}
          </Btn>
        </div>
      </div>

      {/* Step tabs */}
      <Tabs
        tabs={STEPS.map((s, i) => ({ id: i.toString(), label: `${i + 1}. ${s}` }))}
        active={step.toString()}
        onChange={v => setStep(parseInt(v))}
      />

      <div className="mt-5">
        {/* Step 0: Configuration */}
        {step === 0 && (
          <div className="panel p-5 space-y-5">
            <h2 className="text-sm font-display font-bold text-ink">
              Test Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Test Title *"
                value={form.title}
                onChange={e => upd('title', e.target.value)}
                placeholder="e.g. Campus Placement Drive – Round 1"
              />
              <Select
                label="Status"
                value={form.status}
                onChange={e => upd('status', e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
            <Textarea
              label="Description / Instructions"
              value={form.description}
              onChange={e => upd('description', e.target.value)}
              placeholder="Instructions shown to students before starting..."
              rows={3}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Start Date & Time"
                type="datetime-local"
                value={form.startTime}
                onChange={e => upd('startTime', e.target.value)}
              />
              <Input
                label="End Date & Time"
                type="datetime-local"
                value={form.endTime}
                onChange={e => upd('endTime', e.target.value)}
              />
              <Input
                label="Duration (minutes)"
                type="number"
                min={10}
                max={480}
                value={form.durationMinutes}
                onChange={e => upd('durationMinutes', +e.target.value)}
                disabled={!!form.settings.splitTimers}
                hint={form.settings.splitTimers ? 'Auto-computed from MCQ + Coding limits below' : undefined}
              />
              <div>
                <label className="input-label">Target Department *</label>
                <select
                  value={form.department}
                  onChange={e => upd('department', e.target.value)}
                  className="select-field"
                  required
                >
                  <option value="">Select Department</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Independent MCQ / Coding round timers */}
            <div className="border-t border-rim pt-5">
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-accent w-4 h-4"
                  checked={!!form.settings.splitTimers}
                  onChange={e => {
                    const on = e.target.checked;
                    updSettings('splitTimers', on);
                    if (on) {
                      const mcq = form.settings.mcqDurationMinutes || 60;
                      const coding = form.settings.codingDurationMinutes || 60;
                      updSettings('mcqDurationMinutes', mcq);
                      updSettings('codingDurationMinutes', coding);
                      upd('durationMinutes', mcq + coding);
                    }
                  }}
                />
                <span className="text-sm font-display font-bold text-ink flex items-center gap-1.5">
                  Independent MCQ / Coding time limits
                  <HelpTip text="When enabled, the aptitude and coding rounds each get their own clock. Once the MCQ clock runs out, students are locked out of MCQ questions and moved into coding; the overall Duration field above is kept in sync automatically." />
                </span>
              </label>
              {form.settings.splitTimers && (
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <Input
                    label="MCQ Time Limit (minutes)"
                    type="number"
                    min={5}
                    max={300}
                    value={form.settings.mcqDurationMinutes || 60}
                    onChange={e => {
                      const mcq = +e.target.value;
                      updSettings('mcqDurationMinutes', mcq);
                      upd('durationMinutes', mcq + (form.settings.codingDurationMinutes || 60));
                    }}
                  />
                  <Input
                    label="Coding Time Limit (minutes)"
                    type="number"
                    min={5}
                    max={300}
                    value={form.settings.codingDurationMinutes || 60}
                    onChange={e => {
                      const coding = +e.target.value;
                      updSettings('codingDurationMinutes', coding);
                      upd('durationMinutes', (form.settings.mcqDurationMinutes || 60) + coding);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Settings section */}
            <div className="border-t border-rim pt-5">
              <h3 className="text-sm font-display font-bold text-ink mb-4">
                Test Settings
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Input
                  label="Passing Score (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={form.settings.passingScore}
                  onChange={e => updSettings('passingScore', +e.target.value)}
                />
                <Select
                  label={
                    <span className="flex items-center gap-1.5">
                      Show Results <HelpTip text="When students can see scores: 'After Submission' (immediate), 'After End' (test window closes), 'Manual' (admin releases), 'Never' (admin only)." />
                    </span>
                  }
                  value={form.settings.showResults}
                  onChange={e => updSettings('showResults', e.target.value)}
                >
                  <option value="after_submit">After Submission</option>
                  <option value="after_end">After Test Ends</option>
                  <option value="manual">Manual (Admin)</option>
                  <option value="never">Never (Admin Only)</option>
                </Select>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="mt-5 flex items-center gap-2 text-xs font-medium text-annotation/70 hover:text-ink transition-colors w-full text-left"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" d="M9 18l6-6-6-6" />
                </svg>
                Advanced Settings
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4 animate-fade-up">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label={
                        <span className="flex items-center gap-1.5">
                          Allowed Branches <HelpTip text="Comma-separated branch codes. Leave blank for all branches. Example: CSE, IT, ECE" />
                        </span>
                      }
                      value={form.settings.allowedBranches}
                      onChange={e => updSettings('allowedBranches', e.target.value)}
                      placeholder="CSE, IT, ECE"
                    />
                  </div>
                  <div className="flex gap-5 flex-wrap">
                    {[
                      ['shuffleQuestions', 'Shuffle Questions'],
                      ['shuffleOptions', 'Shuffle Options'],
                      ['negativeMarking', <span className="flex items-center gap-1.5">Negative Marking <HelpTip text="Deducts a fraction of the marks for each wrong answer. Only applies to MCQ questions. The fraction is multiplied by the question's marks." /></span>],
                    ].map(([f, l]) => (
                      <label
                        key={f}
                        className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.settings[f]}
                          onChange={e => updSettings(f, e.target.checked)}
                          className="accent-accent w-4 h-4"
                        />
                        {l}
                      </label>
                    ))}
                    {form.settings.negativeMarking && (
                      <Input
                        label={
                          <span className="flex items-center gap-1.5">
                            Deduction (fraction) <HelpTip text="Portion of the question's marks deducted per wrong answer. E.g. 0.25 on a 2-mark question deducts 0.5 marks. Typical range: 0.25–0.50" />
                          </span>
                        }
                        type="number"
                        step={0.25}
                        min={0}
                        max={1}
                        value={form.settings.negativeFraction}
                        onChange={e => updSettings('negativeFraction', +e.target.value)}
                        className="w-28"
                      />
                    )}
                  </div>
                </div>
              )}
              <div className="mt-4">
                <p className="text-2xs text-annotation/70 font-mono uppercase tracking-wider mb-2">
                  Allowed Coding Languages
                </p>
                <div className="flex gap-4">
                  {['python', 'javascript', 'java', 'cpp'].map(lang => (
                    <label
                      key={lang}
                      className="flex items-center gap-1.5 text-sm text-ink cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.settings.allowedLanguages?.includes(lang)}
                        onChange={e => {
                          const al = form.settings.allowedLanguages || [];
                          updSettings(
                            'allowedLanguages',
                            e.target.checked
                              ? [...al, lang]
                              : al.filter(l => l !== lang),
                          );
                        }}
                        className="accent-accent"
                      />
                      {lang}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Btn variant="primary" onClick={() => setStep(1)}>
                Next: Add Questions →
              </Btn>
            </div>
          </div>
        )}

        {/* Step 1: Questions */}
        {step === 1 && (
          <div>
            {/* Section tabs */}
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              {form.sections.map((s, i) => (
                <div key={s._id || s.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveSection(i)}
                    className={`tab-btn ${
                      activeSection === i
                        ? 'tab-btn--active'
                        : 'tab-btn--inactive border border-rim'
                    }`}
                  >
                    {s.name} ({s.questions.length})
                  </button>
                  <button
                    onClick={() => removeSection(i)}
                    className="btn-ghost-icon text-annotation hover:text-alert"
                    aria-label={`Remove ${s.name}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="flex gap-1 ml-1">
                <Btn variant="ghost" size="sm" onClick={() => addSection('aptitude')}>
                  + Aptitude
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => addSection('coding')}>
                  + Coding
                </Btn>
              </div>
            </div>

            {form.sections.length === 0 && (
              <div className="panel-muted border-dashed border-2 p-12 text-center">
                <p className="text-sm text-annotation/70 mb-4">
                  No sections yet. Add an Aptitude or Coding section to begin.
                </p>
                <div className="flex gap-3 justify-center">
                  <Btn variant="outline" onClick={() => addSection('aptitude')}>
                    + Aptitude Section
                  </Btn>
                  <Btn variant="outline" onClick={() => addSection('coding')}>
                    + Coding Section
                  </Btn>
                </div>
              </div>
            )}

            {sec && (
              <div className="panel p-4">
                <div className="flex gap-3 mb-4 items-center">
                  <Input
                    value={sec.name}
                    onChange={e => updateSection(activeSection, 'name', e.target.value)}
                    placeholder="Section name"
                    className="w-40 text-sm"
                  />
                  <Select
                    value={sec.type}
                    onChange={e => updateSection(activeSection, 'type', e.target.value)}
                    className="w-32 text-sm"
                  >
                    <option value="aptitude">Aptitude</option>
                    <option value="coding">Coding</option>
                  </Select>
                  <span className="text-xs text-annotation/60 font-mono">
                    {sec.questions.length} questions ·{' '}
                    {sec.questions.reduce((m, q) => m + (q.marks || 0), 0)} marks
                  </span>
                </div>

                {sec.questions.map((q, qi) => (
                  <div key={q._id || q.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-annotation/60">
                        Q{qi + 1}
                      </span>
                    </div>
                    {sec.type === 'aptitude' ? (
                      <AptQEditor
                        q={q}
                        onChange={nq => updateQuestion(activeSection, qi, nq)}
                        onRemove={() => removeQuestion(activeSection, qi)}
                      />
                    ) : (
                      <CodeQEditor
                        q={q}
                        onChange={nq => updateQuestion(activeSection, qi, nq)}
                        onRemove={() => removeQuestion(activeSection, qi)}
                      />
                    )}
                  </div>
                ))}

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => addQuestion(activeSection)}
                    className="flex-1 border-2 border-dashed border-rim rounded-xl py-3.5 text-sm text-annotation/60 hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add{' '}
                    {sec.type === 'aptitude' ? 'Aptitude Question' : 'Coding Problem'}
                  </button>
                  <button
                    onClick={() => setBankOpen(true)}
                    className="border-2 border-dashed border-rim rounded-xl py-3.5 px-4 text-sm text-annotation/60 hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s4.332.477 5.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Add from Bank
                  </button>
                </div>

                <BankPickerModal
                  open={bankOpen}
                  onClose={() => setBankOpen(false)}
                  type={sec.type === 'aptitude' ? 'mcq' : 'coding'}
                  onPick={(bankQ) => addQuestionFromBank(activeSection, bankQ)}
                />
              </div>
            )}

            <div className="flex justify-between mt-4">
              <Btn variant="ghost" onClick={() => setStep(0)}>
                ← Back
              </Btn>
              <Btn variant="primary" onClick={() => setStep(2)}>
                Review & Publish →
              </Btn>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="panel p-5">
            <h2 className="text-sm font-display font-bold text-ink mb-5">
              Review & Publish
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                ['Title', form.title || 'Untitled'],
                ['Duration', `${form.durationMinutes} min`],
                ['Questions', totalQ],
                ['Total Marks', totalM],
              ].map(([k, v]) => (
                <div key={k} className="panel-muted p-3 text-center">
                  <div className="text-2xs text-annotation/60 font-mono uppercase tracking-wider mb-0.5">
                    {k}
                  </div>
                  <div className="text-base font-display font-bold text-ink score-digit">
                    {v}
                  </div>
                </div>
              ))}
            </div>

            {form.sections.map(s => (
              <div key={s._id || s.id} className="mb-3 panel-muted overflow-hidden">
                <div className="bg-panel px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{s.name}</span>
                  <span className="text-xs text-annotation/60 font-mono">
                    {s.questions.length} questions ·{' '}
                    {s.questions.reduce((m, q) => m + (q.marks || 0), 0)} marks
                  </span>
                </div>
                {s.questions.map((q, i) => (
                  <div
                    key={q._id || q.id}
                    className="flex items-center gap-3 px-4 py-2 border-t border-rim/30 text-sm"
                  >
                    <span className="font-mono text-xs text-annotation/40 w-6">
                      Q{i + 1}
                    </span>
                    <span className="flex-1 text-ink truncate">
                      {s.type === 'coding' ? q.title : q.text || '(empty)'}
                    </span>
                    <span className="text-xs text-annotation/60 font-mono">
                      {q.marks}m
                    </span>
                    <span
                      className={`text-2xs font-semibold px-2 py-0.5 rounded-md font-mono ${
                        q.difficulty === 'easy'
                          ? 'bg-verify/10 text-verify'
                          : q.difficulty === 'hard'
                          ? 'bg-alert/10 text-alert'
                          : 'bg-accent/10 text-accent'
                      }`}
                    >
                      {q.difficulty}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            <div className="flex gap-3 justify-end mt-5 border-t border-rim pt-4">
              <Btn variant="ghost" onClick={() => setStep(1)}>
                ← Edit Questions
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => handleSave('draft')}
                disabled={saveMut.isLoading}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save as Draft
              </Btn>
              <Btn
                variant="primary"
                onClick={() => handleSave('published')}
                disabled={saveMut.isLoading}
              >
                {saveMut.isLoading ? 'Publishing…' : 'Publish Test'}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
