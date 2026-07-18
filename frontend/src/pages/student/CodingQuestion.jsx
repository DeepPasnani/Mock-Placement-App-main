import { Btn, Spinner } from '../../components/shared/UI';
import Editor from '@monaco-editor/react';

const LANG_MAP = {
  python: 'python',
  javascript: 'javascript',
  java: 'java',
  cpp: 'cpp',
};

function DifficultyBadge({ level }) {
  const map = {
    easy:   'badge-verify',
    medium: 'badge-accent',
    hard:   'badge-alert',
  };
  const cls = map[level] || 'badge-annotation';
  return <span className={cls}>{level}</span>;
}

function CodingQuestion({
  q, qi, section, codeSolutions, setCode, activeLang, setActiveLang,
  allowedLangs, flagged, toggleFlag, runResult, runLoading, onRunCode, testResults, testLoading, onRunAllTests,
  onPrev, onNext, isLast, onConfirmSubmit,
}) {
  const code = codeSolutions[q.id]?.[activeLang] || q.starter_code?.[activeLang] || '';

  const handleChange = (value) => setCode(q.id, activeLang, value);

  return (
    <div className="max-w-5xl mx-auto flex flex-col flex-1 p-4 sm:p-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-annotation">Q{qi + 1}</span>
          <DifficultyBadge level={q.difficulty} />
          <span className="badge-clarify">{q.marks} marks</span>
        </div>
        <button
          onClick={() => toggleFlag(q.id)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors font-medium ${
            flagged.has(q.id)
              ? 'bg-accent/15 text-accent'
              : 'text-annotation hover:bg-panel hover:text-ink'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={flagged.has(q.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M3 21V4a1 1 0 011-1h12a1 1 0 01.8.4l2 2.6a1 1 0 010 1.2l-2 2.6A1 1 0 0116 10H4m7 11l-3-3m0 0l3-3m-3 3h10" />
          </svg>
          {flagged.has(q.id) ? 'Flagged' : 'Flag'}
        </button>
      </div>

      {/* Problem statement */}
      <div className="panel p-4 mb-4">
        <h3 className="font-display font-bold text-base text-ink mb-2">
          {q.title || `Problem ${qi + 1}`}
        </h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink mb-3">{q.description}</p>
        {q.input_format && (
          <div className="space-y-1 text-xs">
            <p className="font-mono text-annotation font-semibold">Input Format</p>
            <p className="font-mono text-ink bg-deck p-2 rounded">{q.input_format}</p>
          </div>
        )}
        {q.output_format && (
          <div className="space-y-1 text-xs mt-2">
            <p className="font-mono text-annotation font-semibold">Output Format</p>
            <p className="font-mono text-ink bg-deck p-2 rounded">{q.output_format}</p>
          </div>
        )}
        {q.constraints && (
          <div className="space-y-1 text-xs mt-2">
            <p className="font-mono text-annotation font-semibold">Constraints</p>
            <p className="font-mono text-ink bg-deck p-2 rounded">{q.constraints}</p>
          </div>
        )}
        {q.sample_input && q.sample_output && (
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div>
              <p className="font-mono text-annotation font-semibold mb-1">Sample Input</p>
              <pre className="font-mono text-ink bg-deck p-2 rounded whitespace-pre-wrap">{q.sample_input}</pre>
            </div>
            <div>
              <p className="font-mono text-annotation font-semibold mb-1">Sample Output</p>
              <pre className="font-mono text-verify bg-deck p-2 rounded whitespace-pre-wrap">{q.sample_output}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Language selector */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs font-medium text-annotation">Language</label>
        <select
          value={activeLang}
          onChange={e => setActiveLang(e.target.value)}
          className="select-field w-auto min-w-[160px] text-sm"
        >
          {allowedLangs.map(l => (
            <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <Editor
          height="100%"
          language={LANG_MAP[activeLang] || 'text'}
          theme="light"
          value={code}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            folding: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            cursorBlinking: 'phase',
            renderLineHighlight: 'line',
          }}
        />

        {/* Run result */}
        {/* Run All Tests button */}
      <div className="flex items-center gap-3 mb-3">
        <Btn variant="primary" size="sm" onClick={onRunAllTests} disabled={testLoading || runLoading}>
          {testLoading ? <Spinner size={14} /> : '▶ Run All Visible Tests'}
        </Btn>
        {testResults && testResults.length > 0 && (
          <span className="text-xs font-mono text-annotation">
            {testResults.filter(r => r.passed).length}/{testResults.length} passed
          </span>
        )}
      </div>

      {/* Per-test-case results */}
      {testResults && testResults.length > 0 && (
        <div className="panel p-3 rounded-lg mb-3 animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-annotation/60 border-b border-rim">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Input</th>
                  <th className="text-left py-1 pr-2">Expected</th>
                  <th className="text-left py-1 pr-2">Got</th>
                  <th className="text-right py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((tr, i) => (
                  <tr key={i} className="border-b border-rim/50 transition-colors hover:bg-sunken">
                    <td className="py-1.5 pr-2 text-annotation">{i + 1}</td>
                    <td className="py-1.5 pr-2 text-ink max-w-24 truncate font-medium">{tr.input}</td>
                    <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.expected}</td>
                    <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.actual}</td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wider ${
                          tr.passed
                            ? 'bg-verify/12 text-verify'
                            : 'bg-alert/12 text-alert'
                        }`}
                      >
                        {tr.passed ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {runResult && (
          <div className={`panel mt-3 p-3 rounded-lg border animate-fade-in ${
            runResult.output?.includes('error') || runResult.stderr
              ? 'border-alert/30 bg-alert/5'
              : 'border-verify/30 bg-verify/5'
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono font-bold text-annotation">Output</span>
              <span className={`text-2xs font-mono ${
                runResult.output?.includes('error') || runResult.stderr ? 'text-alert' : 'text-verify'
              }`}>
                {runResult.output?.includes('error') || runResult.stderr ? 'Error' : 'Success'}
              </span>
            </div>
            <pre className="font-mono text-xs text-ink/90 bg-deck p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
              {runResult.stdout || runResult.output || runResult.stderr || 'No output'}
            </pre>
            {runResult.time_ms && (
              <p className="text-2xs text-annotation/60 mt-1 font-mono">
                Time: {runResult.time_ms}ms · Memory: {runResult.memory_mb || 0} MB
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-rim">
        <button
          onClick={() => setCode(q.id, activeLang, '')}
          className="text-xs text-annotation/60 hover:text-alert transition-colors"
        >
          Clear code
        </button>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={onPrev}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </Btn>
          {isLast ? (
            <Btn variant="success" size="sm" onClick={onConfirmSubmit}>
              Submit
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7" />
              </svg>
            </Btn>
          ) : (
            <Btn variant="primary" size="sm" onClick={onNext}>
              Next
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7" />
              </svg>
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodingQuestion;
