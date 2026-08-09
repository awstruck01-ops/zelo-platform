import { useEffect, useRef, useState } from 'react';
import api from '../api';

const POLL_INTERVAL_MS = 5000;

export default function Messages() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const loadMessages = async (conversationId) => {
    try {
      const res = await api.get(`/chat/conversations/${conversationId}/messages`);
      setMessages(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load messages');
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const startRes = await api.post('/chat/conversations/start');
        if (!mounted) return;
        const conv = startRes.data.data;
        setConversation(conv);
        await loadMessages(conv.id);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to start conversation');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!conversation) return;
    pollRef.current = setInterval(() => loadMessages(conversation.id), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [conversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !conversation) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/chat/conversations/${conversation.id}/messages`, { body: draft.trim() });
      setDraft('');
      await loadMessages(conversation.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Messages</h1>
          <p>Chat directly with the Zelo team</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
        <div className="panel-header"><h2>Support</h2></div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</p>
          ) : messages.length === 0 ? (
            <div className="empty-state">No messages yet. Say hello!</div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_role !== 'admin';
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '70%',
                    background: isMe ? 'var(--accent-live, #2e7d32)' : 'var(--panel-alt, #1c1c1c)',
                    color: isMe ? '#fff' : 'inherit',
                    borderRadius: 12,
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2, textTransform: 'capitalize' }}>
                    {isMe ? 'You' : 'Zelo team'}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                    {new Date(m.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--border, #2a2a2a)' }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message..."
            disabled={!conversation || sending}
            style={{ flex: 1 }}
          />
          <button type="submit" className="primary" disabled={!conversation || sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>
    </>
  );
}
