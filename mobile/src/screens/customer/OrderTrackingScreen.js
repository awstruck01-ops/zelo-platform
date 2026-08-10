import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import OrderRail from '../../components/OrderRail';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OrderTrackingScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const load = useCallback(() => {
    api.get(`/orders/${orderId}`)
      .then((res) => setOrder(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load order'));
  }, [orderId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const submitRating = async (score) => {
    setRating(score);
    try {
      await api.post('/ratings', { order_id: orderId, rated_type: 'driver', score });
      setRatingSubmitted(true);
    } catch (err) {
      // rating already submitted or order not yet completed - fail quietly in UI
    }
  };

  // Only available once a driver has actually been assigned — before that
  // there's no one on the other end of the thread.
  const messageDriver = async () => {
    setStartingChat(true);
    setError('');
    try {
      const res = await api.post(`/chat/conversations/order/${orderId}/start`);
      navigation.navigate('Chat', { conversationId: res.data.data.id, title: 'Message driver' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  };

  if (!order) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{order.business_name}</Text>
      <Text style={styles.sub}>Order #{order.id.slice(0, 8)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <OrderRail status={order.status} />
      </View>

      {order.driver_id ? (
        <TouchableOpacity style={styles.messageButton} onPress={messageDriver} disabled={startingChat}>
          {startingChat ? (
            <ActivityIndicator color={colors.liveText} />
          ) : (
            <Text style={styles.messageButtonText}>Message driver</Text>
          )}
        </TouchableOpacity>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.rowLabel}>Total</Text>
        <Text style={styles.rowValue}>{formatUSD(order.total_amount)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Delivery fee</Text>
        <Text style={styles.rowValue}>{formatUSD(order.delivery_fee)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Sales tax</Text>
        <Text style={styles.rowValue}>{formatUSD(order.tax_amount)}</Text>
      </View>
      {order.estimated_delivery_minutes && (
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Estimated delivery time</Text>
          <Text style={styles.rowValue}>~{order.estimated_delivery_minutes} min</Text>
        </View>
      )}

      {order.status === 'completed' && (
        <View style={styles.card}>
          <Text style={{ color: colors.text, marginBottom: 8 }}>Rate your driver</Text>
          {ratingSubmitted ? (
            <Text style={{ color: colors.live }}>Thanks for your feedback!</Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => submitRating(n)}>
                  <Text style={{ fontSize: 22, color: n <= rating ? colors.pending : colors.border }}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.popToTop()}>
        <Text style={{ color: colors.live, fontWeight: '600' }}>Back to browsing</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { color: colors.textDim, marginTop: 4, marginBottom: 20, fontFamily: 'monospace' },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  rowLabel: { color: colors.textDim },
  rowValue: { color: colors.text, fontWeight: '600', fontFamily: 'monospace' },
  error: { color: colors.danger, marginBottom: 12 },
  backButton: { marginTop: 12, alignItems: 'center', padding: 12 },
  messageButton: {
    backgroundColor: colors.live, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12,
  },
  messageButtonText: { color: colors.liveText, fontWeight: '700' },
});
