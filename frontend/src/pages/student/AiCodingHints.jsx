import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiAPI } from '../../services/ai';
import { Btn, Spinner } from '../../components/shared/UI';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';

export default function AiCodingHints({ problemId, studentCode, onHintUsed }) {
  const [expanded, setExpanded] = useState(false);
  const [hints, setHints] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(1);

  const hintMut = useMutation({
    mutationFn: (level) => aiAPI.getCodingHint(problemId, studentCode, level),
    onSuccess: (data) => {
      setHints(prev => [...prev, data]);
      setCurrentLevel(prev => Math.min(prev + 1, 3));
      if (currentLevel <= 3 && onHintUsed) onHintUsed(data.level);
    },
  });

  const getHint = () => {
    hintMut.mutate(currentLevel);
  };

  const hintLabels = { 1: 'Subtle Nudge', 2: 'Approach', 3: 'Pseudo-code' };

  return (
    <div className="panel-muted overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-ink hover:bg-rim/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb size={15} className="text-accent" />
          <span>AI Hints</span>
          {hints.length > 0 && (
            <span className="text-2xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-mono">{hints.length}/3</span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {hints.map((hint, i) => (
            <div key={i} className="text-xs space-y-1 p-2.5 rounded-lg bg-deck border border-rim/30">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-2xs font-semibold uppercase tracking-wider text-accent">
                  Level {hint.level} — {hintLabels[hint.level] || ''}
                </span>
              </div>
              <p className="text-ink/80 leading-relaxed">{hint.hint}</p>
              {hint.codeSnippet && (
                <pre className="text-xs font-mono bg-panel p-2 rounded mt-1 overflow-x-auto text-annotation">{hint.codeSnippet}</pre>
              )}
            </div>
          ))}

          {currentLevel <= 3 && (
            <Btn
              variant="ghost"
              size="sm"
              onClick={getHint}
              disabled={hintMut.isLoading}
              className="w-full"
            >
              {hintMut.isLoading ? (
                <Spinner size={12} />
              ) : (
                `Reveal ${hintLabels[currentLevel]} (Level ${currentLevel})`
              )}
            </Btn>
          )}

          {currentLevel > 3 && (
            <p className="text-2xs text-annotation/50 text-center pt-1">All hints revealed</p>
          )}
        </div>
      )}
    </div>
  );
}
