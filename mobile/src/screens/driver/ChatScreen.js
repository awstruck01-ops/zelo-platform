import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, title } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: title || 'Chat' });
  }, [title, navigation]);

  const load = useCallback((silent) => {
    api.get(`/chat/conversations/${conversationId}/messages`)
      .then((res) => setMessages(res.data.data))
      .catch((err) => { if (!silent) setError(err.response?.data?.error || 'Failed to load messages'); })
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    load(false);
    api.patch(`/chat/conversations/${conversationId}/read`).catch(() => {});
    pollRef.current = setInterval(() => load(true), 4000);
    return () => clearInterval(pollRef.current);
  }, [conversationId, load]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    const outgoing = body.trim();
    setBody('');
    try {
      await api.post(`/chat/conversations/${conversationId}/messages`, { body: outgoing });
      load(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message');
      setBody(outgoing);
    } finally {
      setSending(false);
    }
  };

  const mySenderType = user?.role === 'driver' ? 'driver' : user?.role === 'customer' ? 'customer' : 'support';

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>Say hello 👋</Text>}
        renderItem={({ item }) => {
          const isMine = item.sender_type === mySenderType;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={{ color: isMine ? colors.liveText : colors.text }}>{item.body}</Text>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder="Type a message…"
          placeholderTextColor={colors.textDim}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={send} disabled={sending || !body.trim()}>
          {sending ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.sendButtonText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12 },
  bubbleMine: { backgroundColor: colors.live, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
  input: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontSize: 15, maxHeight: 100,
  },
  sendButton: { backgroundColor: colors.live, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18 },
  sendButtonText: { color: colors.liveText, fontWeight: '700' },
  error: { color: colors.danger, padding: 12 },
});
