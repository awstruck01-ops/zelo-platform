import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import api from '../api/client';
import { navigate } from '../navigation/navigationRef';
import { activeConversation } from '../utils/activeConversation';

const POLL_MS = 5000;
const TOAST_DURATION_MS = 4500;

function labelFor(c) {
  if (c.type === 'admin_support') return 'Zelo Support';
  if (c.type === 'order_support') return 'Customer';
  return 'Message';
}

// Self-contained: polls conversations on its own, so it can be mounted once
// at the stack level (alongside DriverHome/DriverOrder/DriverMap) and keep
// working no matter which of those screens is currently on top — including
// while the driver is navigating on the map.
export default function MessageToastOverlay() {
  const [toasts, setToasts] = useState([]);
  const prevRef = useRef({}); // conversationId -> { unread_count }
  const pollRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const poll = () => {
      api.get('/chat/conversations')
        .then((res) => {
          const list = res.data.data || [];
          const prev = prevRef.current;
          const next = {};
          const newToasts = [];

          list.forEach((c) => {
            const unread = Number(c.unread_count) || 0;
            next[c.id] = { unread_count: unread };
            const before = prev[c.id];
            const unreadIncreased = before && unread > before.unread_count;
            const isNewConversation = !before && unread > 0;

            // Skip toasts on the very first poll after mount — that would
            // surface every existing unread thread as a toast on launch,
            // not just genuinely new messages. Also skip whichever
            // conversation the driver currently has open.
            if (
              initializedRef.current &&
              (unreadIncreased || isNewConversation) &&
              activeConversation.current !== c.id
            ) {
              newToasts.push({
                key: `${c.id}-${Date.now()}`,
                conversationId: c.id,
                title: labelFor(c),
                body: c.last_message || 'New message',
              });
            }
          });

          prevRef.current = next;
          initializedRef.current = true;

          if (newToasts.length > 0) {
            setToasts((cur) => [...cur, ...newToasts]);
            newToasts.forEach((t) => {
              setTimeout(() => {
                setToasts((cur) => cur.filter((x) => x.key !== t.key));
              }, TOAST_DURATION_MS);
            });
          }
        })
        .catch(() => {});
    };

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  const openToast = (t) => {
    setToasts((cur) => cur.filter((x) => x.key !== t.key));
    navigate('Chat', { conversationId: t.conversationId, title: t.title });
  };

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((t) => (
        <TouchableOpacity key={t.key} style={styles.toast} onPress={() => openToast(t)} activeOpacity={0.9}>
          <Text style={styles.toastTitle}>{t.title}</Text>
          <Text style={styles.toastBody} numberOfLines={1}>{t.body}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 50, left: 12, right: 12, gap: 8, zIndex: 9999 },
  toast: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.live,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastTitle: { color: colors.live, fontWeight: '700', fontSize: 13 },
  toastBody: { color: colors.text, fontSize: 14, marginTop: 2 },
});
