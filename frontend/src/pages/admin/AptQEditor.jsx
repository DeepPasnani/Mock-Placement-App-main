import { useState } from 'react';
import { Btn, Input, Select, Textarea, ImageUpload } from '../../components/shared/UI';
import { uploadAPI } from '../../services/api';

export default function AptQEditor({ q, onChange, onRemove }) {
  const [uploading, setUploading] = useState(false);
  const update = (f, v) => onChange({ ...q, [f]: v });
  const updateOption = (i, v) => {
    const o = [...q.options];
    o[i] = v;
    update('options', o);
  };

  const insertCodeBlock = () => {
    const newText = (q.text || '') + '\n```\n// code here\n```\n';
    update('text', newText);
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
        <Btn variant="danger" size="sm" onClick={onRemove} className="shrink-0" aria-label="Remove question">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </Btn>
      </div>

      <div className="flex items-center gap-1 mb-1.5">
        <Btn variant="ghost" size="sm" onClick={insertCodeBlock} title="Insert code block" className="text-xs">
          {'</>'} Code
        </Btn>
        <span className="text-2xs text-annotation/50">Wrap code in ``` blocks for syntax-highlighted rendering</span>
      </div>
      <Textarea
        value={q.text}
        onChange={e => update('text', e.target.value)}
        placeholder="Enter question text... Use ```language&#10;code&#10;``` for code blocks"
        rows={3}
        className="mb-3 text-sm"
      />

      <ImageUpload
        value={q.imageUrl}
        uploading={uploading}
        onChange={async (file) => {
          if (typeof file === 'string') { update('imageUrl', file); return; }
          setUploading(true);
          try { const r = await uploadAPI.image(file); update('imageUrl', r.url); } catch {} finally { setUploading(false); }
        }}
        label="Attach Image"
      />

      {(q.type === 'mcq' || q.type === 'msq') && (
        <div className="mt-3 space-y-2">
          <p className="text-2xs text-annotation/70 mb-2">
            Options — {q.type === 'msq' ? 'check all correct' : 'select correct'}
          </p>
          {q.options.map((opt, i) => (
            <div key={i} className="panel p-2.5">
              <div className="flex items-center gap-2">
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
                  className="input-field text-sm py-1.5 flex-1"
                />
              </div>
              <div className="flex items-center gap-2 mt-2 ml-9">
                <ImageUpload
                  value={(q.optionImages || [])[i]}
                  uploading={uploading}
                  onChange={async (file) => {
                    const imgs = [...(q.optionImages || Array(q.options.length).fill(''))];
                    if (typeof file === 'string') { imgs[i] = ''; update('optionImages', imgs); return; }
                    setUploading(true);
                    try { const r = await uploadAPI.image(file); imgs[i] = r.url; update('optionImages', imgs); } catch {} finally { setUploading(false); }
                  }}
                  label={q.optionImages?.[i] ? 'Change' : 'Image'}
                />
                {q.optionImages?.[i] && (
                  <span className="text-[10px] text-annotation/50 truncate max-w-[120px]">Uploaded</span>
                )}
              </div>
            </div>
          ))}
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...q, options: [...q.options, ''], optionImages: [...(q.optionImages || Array(q.options.length).fill('')), ''] })}
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
