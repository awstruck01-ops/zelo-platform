import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import OrderRail from '../../components/OrderRail';

const STAGE_FLOW = [
  { stage: 'arrived_at_seller', label: "I've arrived at the seller" },
  { stage: 'picked_up', label: 'Picked up the order' },
  { stage: 'en_route_to_customer', label: 'On the way to customer' },
  { stage: 'arrived_at_customer', label: "I've arrived at the customer" },
  { stage: 'delivered', label: 'Mark as delivered' },
];

const NEXT_STAGE_FOR_STATUS = {
  driver_assigned: 0,
  driver_arrived_at_seller: 1,
  picked_up: 2,
  en_route_to_customer: 3,
  arrived_at_customer: 4,
};

export default function DriverOrderScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/orders/${orderId}`).then((res) => setOrder(res.data.data)).catch(() => {});
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const advance = async (stage) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/drivers/me/orders/${orderId}/progress`, { stage });
      if (stage === 'delivered') {
        Alert.alert('Delivered!', 'Payout has been released to your wallet.');
        navigation.popToTop();
        return;
      }
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update progress');
    } finally {
      setBusy(false);
    }
  };

  if (!order) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  const nextStageIndex = NEXT_STAGE_FOR_STATUS[order.status];
  const nextStep = nextStageIndex !== undefined ? STAGE_FLOW[nextStageIndex] : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{order.business_name}</Text>
      <Text style={styles.sub}>Pickup: {order.seller_address}</Text>

      <View style={styles.card}>
        <OrderRail status={order.status} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {nextStep ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => advance(nextStep.stage)} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.primaryButtonText}>{nextStep.label}</Text>}
        </TouchableOpacity>
      ) : (
        <Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 20 }}>
          Waiting for the seller to hand off, or this order is already complete.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  sub: { color: colors.textDim, marginTop: 4, marginBottom: 20 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 20 },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginBottom: 12 },
});
