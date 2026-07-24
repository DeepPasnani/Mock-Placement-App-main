import { useQuery } from '@tanstack/react-query';
import { Btn, Modal, Spinner, Badge } from '../../components/shared/UI';
import { questionBankAPI } from '../../services/api';

export default function BankPickerModal({ open, onClose, type, onPick }) {
  const { data, isLoading } = useQuery({
    queryKey: ['question-bank', type],
    queryFn: () => questionBankAPI.list({ type }),
    enabled: open,
  });
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
