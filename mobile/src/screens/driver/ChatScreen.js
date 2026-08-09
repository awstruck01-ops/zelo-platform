import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';

export default function ChatListScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingSupport, setStartingSupport] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/chat/conversations')
      .then((res) => setConversations(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load conversations'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const contactSupport = async () => {
    setStartingSupport(true);
    try {
      const res = await api.post('/chat/conversations/start');
      navigation.navigate('Chat', { conversationId: res.data.data.id, title: 'Zelo Support' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start support chat');
    } finally {
      setStartingSupport(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.supportButton} onPress={contactSupport} disabled={startingSupport}>
        {startingSupport ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.supportButtonText}>Contact Zelo Support</Text>}
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.live} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 20 }}>No conversations yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Chat', {
              conversationId: item.id,
              title: 'Zelo Support',
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardTitle}>Zelo Support</Text>
              {Number(item.unread_count) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread_count}</Text>
                </View>
              )}
            </View>
            {item.last_message ? (
              <Text style={styles.cardPreview} numberOfLines={1}>{item.last_message}</Text>
            ) : (
              <Text style={styles.cardPreview}>No messages yet</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  supportButton: { backgroundColor: colors.live, borderRadius: 10, padding: 14, alignItems: 'center', margin: 16, marginBottom: 4 },
  supportButtonText: { color: colors.liveText, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  cardPreview: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  badge: { backgroundColor: colors.live, borderRadius: 100, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.liveText, fontSize: 11, fontWeight: '700' },
  error: { color: colors.danger, padding: 12, marginHorizontal: 16 },
});
