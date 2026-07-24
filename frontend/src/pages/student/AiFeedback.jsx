import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiAPI } from '../../services/ai';
import { Btn, Spinner, Badge } from '../../components/shared/UI';
import { Sparkles, TrendingUp, TrendingDown, BookOpen, Target } from 'lucide-react';

export default function AiFeedback({ testId, userId, autoShow = false }) {
  const [feedback, setFeedback] = useState(null);

  const feedbackMut = useMutation({
    mutationFn: () => aiAPI.getFeedback(testId, userId),
    onSuccess: (data) => setFeedback(data.feedback),
  });

  if (autoShow && !feedback && !feedbackMut.isLoading) {
    feedbackMut.mutate();
  }

  return (
    <div className="space-y-3">
      {!feedback && !autoShow && (
        <Btn variant="clarify" onClick={() => feedbackMut.mutate()} disabled={feedbackMut.isLoading}>
          {feedbackMut.isLoading ? <Spinner size={14} className="mr-1" /> : <Sparkles size={14} className="mr-1" />}
          Get AI Feedback
        </Btn>
      )}

      {feedbackMut.isLoading && (
        <div className="panel p-6 text-center">
          <Spinner size={24} className="text-accent mx-auto mb-2" />
          <p className="text-xs text-annotation">Analyzing your performance...</p>
        </div>
      )}

      {feedback && (
        <div className="panel overflow-hidden animate-fade-up">
          <div className="bg-accent/5 px-5 py-3 border-b border-rim/30">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h3 className="text-sm font-display font-bold text-ink">AI Performance Feedback</h3>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {feedback.overall_assessment && (
              <div>
                <label className="input-label">Overall Assessment</label>
                <p className="text-sm text-ink/80 leading-relaxed mt-1">{feedback.overall_assessment}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {feedback.strengths?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={14} className="text-verify" />
                    <label className="input-label mb-0">Strengths</label>
                  </div>
                  <ul className="space-y-1">
                    {feedback.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-ink/80">
                        <span className="text-verify mt-0.5 shrink-0">&#10003;</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.weaknesses?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={14} className="text-alert" />
                    <label className="input-label mb-0">Areas to Improve</label>
                  </div>
                  <ul className="space-y-1">
                    {feedback.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-ink/80">
                        <span className="text-alert mt-0.5 shrink-0">&#10007;</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {feedback.recommended_topics?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Target size={14} className="text-accent" />
                  <label className="input-label mb-0">Recommended Topics</label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {feedback.recommended_topics.map((t, i) => (
                    <Badge key={i} color="blue">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            {feedback.suggested_resources?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen size={14} className="text-clarify" />
                  <label className="input-label mb-0">Suggested Resources</label>
                </div>
                <ul className="space-y-1">
                  {feedback.suggested_resources.map((r, i) => (
                    <li key={i} className="text-xs text-ink/80 flex items-start gap-1.5">
                      <span className="text-clarify mt-0.5">&#8594;</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
