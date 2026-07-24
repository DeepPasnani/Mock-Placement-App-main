import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testMessagesAPI, submissionsAPI } from '../../services/api';
import { Btn, Spinner } from '../../components/shared/UI';
import toast from 'react-hot-toast';
import { useStore } from '../../store';

export default function TestMonitor() {
  const { testId } = useParams();
  const { token } = useStore();
  const queryClient = useQueryClient();
  const [ws, setWs] = useState(null);
  const [replyText, setReplyText] = useState({});
  const messagesEndRef = useRef(null);

  const { data: testData } = useQuery({
    queryKey: ['test', testId],
    queryFn: () => import('../../services/api').then(m => m.testsAPI.get(testId)),
  });

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['test-messages', testId],
    queryFn: () => testMessagesAPI.getForTest(testId),
    refetchInterval: 10000,
  });

  const resolveMut = useMutation({
    mutationFn: testMessagesAPI.resolve,
    onSuccess: () => queryClient.invalidateQueries(['test-messages', testId]),
  });

  // WebSocket for live messaging
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const socket = new WebSocket(`${host}/ws?token=${token}`);

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'TEST_MESSAGE' && msg.testId === testId) {
          queryClient.invalidateQueries(['test-messages', testId]);
        }
      } catch {}
    };

    setWs(socket);
    return () => socket.close();
  }, [testId, token, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  const sendReply = (studentId) => {
    const text = replyText[studentId];
    if (!text?.trim()) return;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'ADMIN_REPLY',
        testId,
        studentId,
        message: text,
      }));
    }
    setReplyText(r => ({ ...r, [studentId]: '' }));
  };

  const messages = messagesData?.messages || [];
  const test = testData?.test;

  // Group messages by user
  const grouped = {};
  for (const msg of messages) {
    if (!grouped[msg.user_id]) grouped[msg.user_id] = { userName: msg.user_name, userEmail: msg.user_email, messages: [] };
    grouped[msg.user_id].messages.push(msg);
  }

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size={28} className="text-accent" /></div>;
  }

  return (
    <div className="page-enter">
      <div className="section-header">
        <div>
          <h1 className="section-title">Test Monitor: {test?.title || 'Loading...'}</h1>
          <p className="section-subtitle">{Object.keys(grouped).length} student(s) have sent messages</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.entries(grouped).length === 0 ? (
          <div className="lg:col-span-2 empty-state">
            <p className="empty-state-title">No messages yet</p>
            <p className="empty-state-desc">Students' messages during the test will appear here.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([userId, group]) => (
            <div key={userId} className="panel p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-ink">{group.userName}</h3>
                  <p className="text-2xs text-annotation/60">{group.userEmail}</p>
                </div>
                <span className="text-2xs text-annotation/50">{group.messages.length} message(s)</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                {group.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.is_from_student ? '' : 'justify-end'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-lg text-xs ${
                      m.is_from_student
                        ? 'bg-sunken text-ink'
                        : 'bg-accent/10 text-accent'
                    }`}>
                      <p>{m.message}</p>
                      <p className="text-2xs text-annotation/40 mt-1">
                        {new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {!m.is_from_student && ' (Admin)'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  className="input-field text-sm flex-1"
                  value={replyText[userId] || ''}
                  onChange={e => setReplyText(r => ({ ...r, [userId]: e.target.value }))}
                  placeholder="Type a reply..."
                  onKeyDown={e => { if (e.key === 'Enter') sendReply(userId); }}
                />
                <Btn variant="primary" size="sm" onClick={() => sendReply(userId)}>Send</Btn>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
