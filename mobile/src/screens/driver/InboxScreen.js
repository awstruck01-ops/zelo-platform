import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';

export default function InboxScreen() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/drivers/me/inbox')
      .then((res) => setMessages(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load inbox'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (message) => {
    const nowExpanded = expandedId === message.id ? null : message.id;
    setExpandedId(nowExpanded);
    if (nowExpanded && !message.is_read) {
      try {
        await api.patch(`/drivers/me/inbox/${message.id}/read`);
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, is_read: true } : m)));
      } catch (err) {
        // fail quietly, list will show correct state on next load
      }
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.live} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>Nothing here yet.</Text>}
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.id;
          return (
            <TouchableOpacity style={styles.card} onPress={() => toggleExpand(item)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!item.is_read && <View style={styles.unreadDot} />}
                <Text style={[styles.cardTitle, !item.is_read && { fontWeight: '700' }]}>{item.title}</Text>
              </View>
              <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
              {isExpanded ? (
                <Text style={styles.cardBody}>{item.body}</Text>
              ) : (
                <Text style={styles.cardPreview} numberOfLines={1}>{item.body}</Text>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16 },
  cardTitle: { color: colors.text, fontSize: 15 },
  cardDate: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  cardPreview: { color: colors.textDim, fontSize: 13, marginTop: 8 },
  cardBody: { color: colors.text, fontSize: 13, marginTop: 8, lineHeight: 19 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  error: { color: colors.danger, padding: 12, marginHorizontal: 16, marginTop: 12 },
});
