import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';

const POLL_LIST_MS = 8000;
const POLL_THREAD_MS = 5000;

function conversationLabel(c) {
  if (c.type === 'order_support') {
    const orderRef = c.order_id ? `Order #${c.order_id.slice(0, 8)}` : 'Order';
    const parts = [orderRef];
    if (c.customer_phone) parts.push(`Customer ${c.customer_phone}`);
    if (c.driver_phone) parts.push(`Driver ${c.driver_phone}`);
    return parts.join(' — ');
  }
  if (c.seller_business_name) return c.seller_business_name;
  if (c.driver_phone) return `Driver ${c.driver_phone}`;
  return 'Unknown';
}

export default function Messages() {
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order_id');

  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const autoSelectedRef = useRef(false);

  const loadConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data.data);

      // Arriving from the Disputes page with ?order_id= — jump straight to
      // that order's thread the first time the list loads. Only do this
      // once per page load so it doesn't fight with the admin manually
      // clicking a different conversation afterward.
      if (orderIdParam && !autoSelectedRef.current) {
        const match = res.data.data.find((c) => c.type === 'order_support' && c.order_id === orderIdParam);
        if (match) {
          setSelectedId(match.id);
          autoSelectedRef.current = true;
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load conversations');
    } finally {
      setLoadingList(false);
    }
  };

  const loadThread = async (id) => {
    try {
      const res = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(res.data.data);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load messages');
    }
  };

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, POLL_LIST_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingThread(true);
    loadThread(selectedId).finally(() => setLoadingThread(false));
    const interval = setInterval(() => loadThread(selectedId), POLL_THREAD_MS);
    return () => clearInterval(interval);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !selectedId) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/chat/conversations/${selectedId}/messages`, { body: draft.trim() });
      setDraft('');
      await loadThread(selectedId);
      loadConversations();
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
          <p>Conversations with sellers and drivers, and customer↔driver order threads</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel" style={{ display: 'flex', height: '70vh', overflow: 'hidden' }}>
        <div style={{ width: 300, borderRight: '1px solid var(--border, #2a2a2a)', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header"><h2>Conversations</h2></div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingList ? (
              <p style={{ color: 'var(--text-dim)', fontSize: 13, padding: 16 }}>Loading...</p>
            ) : conversations.length === 0 ? (
              <div className="empty-state">No conversations yet.</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border, #2a2a2a)',
                    background: selectedId === c.id ? 'var(--panel-alt, #1c1c1c)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{conversationLabel(c)}</div>
                    {Number(c.unread_count) > 0 && (
                      <span style={{
                        background: 'var(--accent-danger, #c62828)', color: '#fff', borderRadius: 999,
                        fontSize: 11, padding: '1px 7px', minWidth: 18, textAlign: 'center',
                      }}>
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.last_message || 'No messages yet'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!selectedId ? (
            <div className="empty-state" style={{ margin: 'auto' }}>Select a conversation to view messages.</div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loadingThread ? (
                  <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</p>
                ) : messages.length === 0 ? (
                  <div className="empty-state">No messages yet.</div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender_role === 'admin';
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
                          {isMe ? 'You (Ops)' : m.sender_role}
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
                  placeholder="Type a reply..."
                  disabled={sending}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="primary" disabled={sending || !draft.trim()}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
