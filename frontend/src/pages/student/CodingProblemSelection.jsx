import { Btn } from '../../components/shared/UI';
import toast from 'react-hot-toast';

function DifficultyBadge({ level }) {
  const map = {
    easy:   'badge-verify',
    medium: 'badge-accent',
    hard:   'badge-alert',
  };
  const cls = map[level] || 'badge-annotation';
  return <span className={cls}>{level}</span>;
}

function CodingProblemSelection({ section, selectedProblems, setSelectedProblems, codeSolutions, onConfirm }) {
  const problems = section.questions;
  const easyCount = problems.filter(p => p.difficulty === 'easy').length;
  const hardCount = problems.filter(p => p.difficulty === 'hard').length;

  const toggleProblem = (id, difficulty) => {
    setSelectedProblems(prev => {
      if (prev.includes(id)) {
        return prev.filter(pid => pid !== id);
      }
      if (prev.length >= 3) return prev; // max 3

      // Constraint: max 2 easy
      if (difficulty === 'easy') {
        const selectedEasy = problems.filter(p => prev.includes(p.id) && p.difficulty === 'easy').length;
        if (selectedEasy >= 2) {
          toast.error('You cannot select more than 2 easy problems.');
          return prev;
        }
      }
      // Constraint: max 1 hard
      if (difficulty === 'hard') {
        const selectedHard = problems.filter(p => prev.includes(p.id) && p.difficulty === 'hard').length;
        if (selectedHard >= 1) {
          toast.error('You can only select at most 1 hard problem.');
          return prev;
        }
      }

      return [...prev, id];
    });
  };

  const alreadyHasCode = (id) =>
    Object.values(codeSolutions[id] || {}).some(c => c?.trim());

  const canConfirm = selectedProblems.length >= 1 && selectedProblems.length <= 3;

  return (
    <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
      <div className="max-w-2xl w-full animate-fade-up">
        <div className="mb-6">
          <h2 className="text-lg font-display font-bold text-ink mb-1">
            Select Your Coding Problems
          </h2>
          <p className="text-sm text-annotation">
            Choose <strong className="text-ink">up to 3</strong> out of {problems.length} problems.
            You may select at most 2 easy and at most 1 hard problem.
          </p>
        </div>

        <div className="space-y-2.5 mb-6">
          {problems.map((p, i) => {
            const selected = selectedProblems.includes(p.id);
            const hasCode = alreadyHasCode(p.id);
            const difficultyBadge = p.difficulty === 'easy' ? (
              <span className="badge-verify text-2xs">EASY</span>
            ) : p.difficulty === 'hard' ? (
              <span className="badge-alert text-2xs">HARD</span>
            ) : (
              <span className="badge-accent text-2xs">MED</span>
            );

            return (
              <label
                key={p.id}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all $
                  selected
                    ? 'border-accent bg-accent/8'
                    : 'border-rim bg-panel hover:border-annotation/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleProblem(p.id, p.difficulty)}
                  className="mt-1 accent-accent w-4 h-4 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-ink">
                      {difficultyBadge} {p.title || `Problem ${i + 1}`}
                    </span>
                    {hasCode && (
                      <span className="badge-accent text-2xs">Has code</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-annotation/70">
                    {difficultyBadge}
                    <span className="font-mono">{p.marks} marks</span>
                    {p.tags && (
                      <span>{p.tags.split(',').slice(0, 2).join(', ')}</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-rim pt-4">
          <div className="text-sm text-annotation">
            <span className="font-bold text-ink font-mono">{selectedProblems.length}</span>
            {' '}of{' '}
            <span className="font-mono">3</span>
            {' '}selected
          </div>
          <div className="flex gap-2">
            {selectedProblems.length > 0 && (
              <Btn variant="ghost" size="sm" onClick={() => setSelectedProblems([])}>
                Clear All
              </Btn>
            )}
            <Btn
              variant="primary"
              size="sm"
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M5 13l4 4L19 7" />
              </svg>
              Confirm & Start Coding
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodingProblemSelection;
