import { useEffect, useState, useCallback, useRef } from 'react';
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

// Statuses at or past pickup mean the driver should be navigating to the customer
const DROPOFF_STATUSES = ['picked_up', 'en_route_to_customer', 'arrived_at_customer'];

export default function DriverOrderScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  // Guards against re-triggering the auto map-open every time `order` is
  // refetched (e.g. after advancing a stage) — it should only fire once per
  // time this screen is freshly pushed onto the stack (a new accept, or a
  // resume-from-launch after the app was closed/crashed mid-delivery).
  const autoOpenedMapRef = useRef(false);

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

  // Starts (or resumes) the customer<->driver thread for this order. The
  // route is registered for the driver by this point since they've been
  // assigned, so there's always a customer to message.
  const messageCustomer = async () => {
    setStartingChat(true);
    setError('');
    try {
      const res = await api.post(`/chat/conversations/order/${orderId}/start`);
      navigation.navigate('Chat', { conversationId: res.data.data.id, title: 'Message customer' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  };

  const openMap = () => {
    if (!order) return;

    const phase = DROPOFF_STATUSES.includes(order.status) ? 'to_dropoff' : 'to_pickup';

    // delivery_address is stored as JSON; fall back gracefully if the shape is unexpected
    let dropoffLabel = 'Customer';
    try {
      const addr = typeof order.delivery_address === 'string'
        ? JSON.parse(order.delivery_address)
        : order.delivery_address;
      dropoffLabel = addr?.line1 || addr?.formatted || addr?.address || dropoffLabel;
    } catch {
      // keep fallback label
    }

    // Postgres NUMERIC/DECIMAL columns come back from the API as strings
    // (e.g. "40.6331000"), but react-native-maps requires actual numbers for
    // marker coordinates — passing strings through crashes with
    // "Value for latitude cannot be cast from String to double". Convert
    // explicitly here rather than relying on the caller.
    const seller_lat = Number(order.seller_lat);
    const seller_lng = Number(order.seller_lng);
    const delivery_lat = Number(order.delivery_lat);
    const delivery_lng = Number(order.delivery_lng);

    if ([seller_lat, seller_lng, delivery_lat, delivery_lng].some((n) => Number.isNaN(n))) {
      setError('Missing or invalid location data for this order — cannot open map');
      return;
    }

    navigation.navigate('DriverMap', {
      pickup: {
        latitude: seller_lat,
        longitude: seller_lng,
        label: order.business_name || order.seller_address,
      },
      dropoff: {
        latitude: delivery_lat,
        longitude: delivery_lng,
        label: dropoffLabel,
      },
      phase,
    });
  };

  // Auto-open the map the first time this order finishes loading — covers
  // both a fresh accept (driver expects to start navigating immediately)
  // and a resume after the app was closed/crashed mid-delivery (driver
  // should land back on the map, not just the order summary). Only fires
  // once per screen mount, not on every `order` refetch (e.g. after
  // advancing a stage), and only for orders that aren't already delivered.
  useEffect(() => {
    if (order && !autoOpenedMapRef.current && order.status !== 'delivered' && order.status !== 'completed') {
      autoOpenedMapRef.current = true;
      openMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

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

      <TouchableOpacity style={styles.navigateButton} onPress={openMap}>
        <Text style={styles.navigateButtonText}>Open Map</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.navigateButton} onPress={messageCustomer} disabled={startingChat}>
        {startingChat ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.navigateButtonText}>Message customer</Text>
        )}
      </TouchableOpacity>

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
  navigateButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  navigateButtonText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginBottom: 12 },
});
