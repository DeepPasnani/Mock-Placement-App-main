import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { questionBankAPI } from '../../services/api';
import { Btn, Input, Select, Textarea, Badge, Table, Modal, ConfirmModal, Tabs, Spinner, Alert } from '../../components/shared/UI';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 * Question Bank — reusable MCQ + coding questions that admins
 * build up over time and pull straight into any test, instead
 * of retyping the same aptitude/DSA questions every drive.
 *
 * Feature ported over from the Next.js UI-redesign prototype
 * and wired to a real Postgres-backed endpoint here.
 * ═══════════════════════════════════════════════════════════ */

const GENRES = [
  { value: 'general', label: 'General' },
  { value: 'quantitative', label: 'Quantitative' },
  { value: 'aptitude', label: 'General Aptitude' },
  { value: 'technical', label: 'Technical' },
  { value: 'verbal', label: 'Verbal Reasoning' },
  { value: 'logical', label: 'Logical' },
  { value: 'data_interpretation', label: 'Data Interpretation' },
];

const SAMPLE_JSON = `[
  {
    "text": "What is the time complexity of inserting into a min-heap?",
    "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
    "correctAnswer": 1,
    "genre": "technical",
    "difficulty": "medium",
    "marks": 2
  }
]`;

export default function QuestionBank() {
  const [tab, setTab] = useState('mcq');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-display font-bold text-ink">Question Bank</h1>
          <p className="text-xs text-annotation mt-0.5">Reusable MCQ and coding questions — pull them into any test from the Test Creator.</p>
        </div>
      </div>
      <Tabs
        tabs={[{ id: 'mcq', label: 'MCQ Questions' }, { id: 'coding', label: 'Coding Questions' }]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        {tab === 'mcq' ? <McqBankTab /> : <CodingBankTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MCQ Tab
// ═══════════════════════════════════════════════════════════
function McqBankTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const { data, isLoading } = useQuery(
    ['question-bank', 'mcq', genre, search],
    () => questionBankAPI.list({ type: 'mcq', genre: genre === 'all' ? undefined : genre, search: search || undefined })
  );

  const deleteMut = useMutation(questionBankAPI.delete, {
    onSuccess: () => { toast.success('Question removed'); qc.invalidateQueries(['question-bank', 'mcq']); },
  });

  const questions = data?.questions || [];

  const columns = [
    { key: 'idx', label: '#', render: (_, i) => <span className="text-annotation">{i + 1}</span> },
    { key: 'text', label: 'Question', render: (r) => <span className="line-clamp-2 max-w-md block">{r.data?.text}</span> },
    { key: 'genre', label: 'Genre', render: (r) => <Badge color="blue">{GENRES.find(g => g.value === r.genre)?.label || r.genre}</Badge> },
    { key: 'difficulty', label: 'Difficulty', render: (r) => <Badge color={r.difficulty === 'hard' ? 'red' : r.difficulty === 'easy' ? 'green' : 'yellow'}>{r.difficulty}</Badge> },
    { key: 'marks', label: 'Marks' },
    { key: 'actions', label: '', align: 'text-right', render: (r) => (
      <button className="text-alert text-xs hover:underline" onClick={() => setDeleteId(r.id)}>Delete</button>
    ) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search questions..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={genre} onChange={e => setGenre(e.target.value)} className="w-48">
          <option value="all">All genres</option>
          {GENRES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </Select>
        <div className="ml-auto flex gap-2">
          <Btn variant="ghost" onClick={() => setImportOpen(true)}>Import JSON</Btn>
          <Btn onClick={() => setCreateOpen(true)}>New Question</Btn>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <Table columns={columns} data={questions} emptyMessage="No MCQ questions in the bank yet." />
      )}

      <McqCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <McqImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMut.mutate(deleteId)}
        title="Delete question"
        message="Remove this question from the bank? Tests that already used it are unaffected."
      />
    </div>
  );
}

function McqCreateModal({ open, onClose }) {
  const qc = useQueryClient();
  const [genre, setGenre] = useState('general');
  const [difficulty, setDifficulty] = useState('medium');
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [marks, setMarks] = useState(2);

  const reset = () => { setGenre('general'); setDifficulty('medium'); setText(''); setOptions(['', '', '', '']); setCorrect(0); setMarks(2); };

  const createMut = useMutation(questionBankAPI.create, {
    onSuccess: () => {
      toast.success('Question added to bank');
      qc.invalidateQueries(['question-bank', 'mcq']);
      reset();
      onClose();
    },
  });

  const save = () => {
    if (!text.trim()) return toast.error('Question text is required');
    if (options.some(o => !o.trim())) return toast.error('All four options are required');
    createMut.mutate({
      type: 'mcq',
      genre, difficulty, marks,
      data: { text: text.trim(), options: options.map(o => o.trim()), correctAnswer: correct },
    });
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="New MCQ Question" width="max-w-xl"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={createMut.isLoading}>{createMut.isLoading ? <Spinner size={14} /> : 'Add to Bank'}</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Select label="Genre" value={genre} onChange={e => setGenre(e.target.value)}>
            {GENRES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
          <Select label="Difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Input label="Marks" type="number" min={1} max={20} value={marks} onChange={e => setMarks(+e.target.value)} />
        </div>
        <Textarea label="Question Text" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Enter question..." />
        <div>
          <label className="input-label">Options (select the correct one)</label>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Btn size="sm" variant={correct === i ? 'primary' : 'ghost'} className="w-9 shrink-0" onClick={() => setCorrect(i)}>{'ABCD'[i]}</Btn>
                <Input value={o} onChange={e => setOptions(options.map((x, j) => j === i ? e.target.value : x))} placeholder={`Option ${'ABCD'[i]}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const SAMPLE_CSV = `type,text,optionA,optionB,optionC,optionD,correctAnswer,title,description,sampleInput,sampleOutput,testCases,genre,difficulty,marks
mcq,"What is 2+2?",3,4,5,6,1,,,,,,quantitative,easy,2
mcq,"Capital of India?",Delhi,Mumbai,Kolkata,Chennai,0,,,,,,general,easy,2
coding,,,,,,"Two Sum","Find indices summing to target","9\n[2,7,11,15]","[0,1]","[{ \"input\": \"9\", \"output\": \"0 1\" }]",,hard,10`;

function McqImportModal({ open, onClose }) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState(null);
  const [importMode, setImportMode] = useState('json');

  const jsonMut = useMutation(questionBankAPI.import, {
    onSuccess: (data) => {
      toast.success(data.message || 'Questions imported');
      qc.invalidateQueries(['question-bank', 'mcq']);
      setRaw(''); setError(null);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Import failed'),
  });

  const csvMut = useMutation(questionBankAPI.importCsv, {
    onSuccess: (data) => {
      toast.success(`${data.created || 0} question(s) imported`);
      qc.invalidateQueries(['question-bank', 'mcq']);
      qc.invalidateQueries(['question-bank', 'coding']);
      setRaw(''); setError(null);
      onClose();
    },
    onError: (e) => {
      const err = e.response?.data;
      const msg = err?.error || 'Import failed';
      const details = err?.errors?.length ? ': ' + err.errors.slice(0, 3).map(e => e.message).join('; ') : '';
      toast.error(msg + details);
    },
  });

  const submitJson = () => {
    setError(null);
    try {
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) throw new Error('JSON must be an array');
      items.forEach((it, i) => {
        if (!it.text || !Array.isArray(it.options) || typeof it.correctAnswer !== 'number') {
          throw new Error(`Item ${i + 1}: requires "text", "options" array, and numeric "correctAnswer"`);
        }
      });
      jsonMut.mutate({ type: 'mcq', items });
    } catch (e) {
      setError(e.message);
    }
  };

  const submitCsv = () => {
    setError(null);
    csvMut.mutate({ csv: raw });
  };

  const isJson = importMode === 'json';
  const loading = jsonMut.isLoading || csvMut.isLoading;

  return (
    <Modal isOpen={open} onClose={onClose} title="Import Questions" width="max-w-2xl"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={isJson ? submitJson : submitCsv} disabled={!raw.trim() || loading}>{loading ? <Spinner size={14} /> : 'Import'}</Btn></>}>
      <div className="space-y-4">
        {/* Format toggle using shared Tabs component */}
        <Tabs
          tabs={[
            { id: 'json', label: 'JSON' },
            { id: 'csv', label: 'CSV' },
          ]}
          active={importMode}
          onChange={setImportMode}
        />

        {isJson ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="input-label">JSON data — array of question objects</label>
              <button className="text-xs text-accent hover:underline focus-ring rounded px-1" onClick={() => setRaw(SAMPLE_JSON)}>Load sample</button>
            </div>
            <Textarea rows={10} value={raw} onChange={e => setRaw(e.target.value)} placeholder={SAMPLE_JSON} className="font-mono text-xs" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="input-label">CSV data — paste or upload a file</label>
              <button className="text-xs text-accent hover:underline focus-ring rounded px-1" onClick={() => setRaw(SAMPLE_CSV)}>Load sample</button>
            </div>
            <Textarea rows={8} value={raw} onChange={e => setRaw(e.target.value)} placeholder="Paste CSV with type column (mcq/coding)..." className="font-mono text-xs" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-annotation">Or upload a .csv file:</span>
              <label className="focus-ring">
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setRaw(ev.target.result);
                      reader.readAsText(file);
                    }
                  }}
                  className="text-xs text-annotation file:mr-2 file:py-0.5 file:px-2 file:rounded file:border file:border-rim file:text-xs file:bg-panel file:text-ink hover:file:bg-sunken transition-colors"
                />
              </label>
            </div>
          </div>
        )}

        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Coding Tab
// ═══════════════════════════════════════════════════════════
function CodingBankTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const { data, isLoading } = useQuery(['question-bank', 'coding'], () => questionBankAPI.list({ type: 'coding' }));
  const deleteMut = useMutation(questionBankAPI.delete, {
    onSuccess: () => { toast.success('Question removed'); qc.invalidateQueries(['question-bank', 'coding']); },
  });

  const questions = data?.questions || [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={() => setImportOpen(true)}>Import CSV</Btn>
        <Btn onClick={() => setCreateOpen(true)}>New Coding Question</Btn>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : questions.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No coding questions in the bank yet.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {questions.map(q => (
            <div key={q.id} className="panel p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h4 className="font-display font-bold text-sm text-ink">{q.data?.title}</h4>
                <Badge color={q.difficulty === 'hard' ? 'red' : q.difficulty === 'easy' ? 'green' : 'yellow'}>{q.difficulty}</Badge>
              </div>
              <p className="text-xs text-annotation line-clamp-2 mb-2">{q.data?.description}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge color="gray">{q.marks} marks</Badge>
                {(q.data?.testCases || []).length > 0 && <Badge color="gray">{q.data.testCases.length} test case(s)</Badge>}
                <button className="ml-auto text-alert text-xs hover:underline" onClick={() => setDeleteId(q.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CodingCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <McqImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMut.mutate(deleteId)}
        title="Delete question"
        message="Remove this coding question from the bank? Tests that already used it are unaffected."
      />
    </div>
  );
}

function CodingCreateModal({ open, onClose }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [marks, setMarks] = useState(4);
  const [sampleInput, setSampleInput] = useState('');
  const [sampleOutput, setSampleOutput] = useState('');

  const reset = () => { setTitle(''); setDescription(''); setDifficulty('easy'); setMarks(4); setSampleInput(''); setSampleOutput(''); };

  const createMut = useMutation(questionBankAPI.create, {
    onSuccess: () => {
      toast.success('Coding question added to bank');
      qc.invalidateQueries(['question-bank', 'coding']);
      reset();
      onClose();
    },
  });

  const save = () => {
    if (!title.trim() || !description.trim()) return toast.error('Title and description are required');
    if (!sampleInput.trim() || !sampleOutput.trim()) return toast.error('At least one sample test case is required');
    createMut.mutate({
      type: 'coding',
      genre: 'technical', difficulty, marks,
      data: {
        title: title.trim(),
        description: description.trim(),
        testCases: [{ input: sampleInput, output: sampleOutput, isHidden: false }],
      },
    });
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="New Coding Question" width="max-w-xl"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={createMut.isLoading}>{createMut.isLoading ? <Spinner size={14} /> : 'Add to Bank'}</Btn></>}>
      <div className="space-y-3">
        <Input label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Two Sum" />
        <Textarea label="Description" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Problem statement..." />
        <div className="grid grid-cols-2 gap-2">
          <Select label="Difficulty" value={difficulty} onChange={e => { setDifficulty(e.target.value); setMarks(e.target.value === 'easy' ? 4 : 7); }}>
            <option value="easy">Easy</option>
            <option value="hard">Hard</option>
          </Select>
          <Input label="Marks" type="number" value={marks} disabled />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Textarea label="Sample Input" rows={2} value={sampleInput} onChange={e => setSampleInput(e.target.value)} className="font-mono text-xs" />
          <Textarea label="Expected Output" rows={2} value={sampleOutput} onChange={e => setSampleOutput(e.target.value)} className="font-mono text-xs" />
        </div>
      </div>
    </Modal>
  );
}
