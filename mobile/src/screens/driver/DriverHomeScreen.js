import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Switch, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { getCurrentCoords } from '../../utils/location';

const LOCATION_REFRESH_MS = 20000; // push a fresh GPS fix to the backend every 20s while online

export default function DriverHomeScreen({ navigation }) {
  const { profile, reloadProfile, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(profile?.is_online || false);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [locationError, setLocationError] = useState('');
  const pollRef = useRef(null);
  const locationIntervalRef = useRef(null);

  const loadOrders = useCallback(() => {
    if (!isOnline) { setOrders([]); return; }
    api.get('/drivers/me/available-orders')
      .then((res) => setOrders(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load orders'));
  }, [isOnline]);

  const pushLocation = useCallback(async () => {
    try {
      const { lat, lng } = await getCurrentCoords();
      await api.patch('/drivers/me/location', { lat, lng });
      setLocationError('');
    } catch (err) {
      setLocationError(err.message || 'Could not read your location');
    }
  }, []);

  useEffect(() => {
    loadOrders();
    pollRef.current = setInterval(loadOrders, 6000);
    return () => clearInterval(pollRef.current);
  }, [loadOrders]);

  // Keep the driver's location fresh on the backend for the whole time they're online,
  // not just at the moment they flip the switch — matching engine relies on recent coords.
  useEffect(() => {
    if (isOnline) {
      locationIntervalRef.current = setInterval(pushLocation, LOCATION_REFRESH_MS);
    } else if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    return () => clearInterval(locationIntervalRef.current);
  }, [isOnline, pushLocation]);

  const toggleOnline = async (value) => {
    setToggling(true);
    setError('');
    setLocationError('');
    try {
      if (value) {
        // Get a real GPS fix before announcing we're online, so the first
        // matching pass already has an accurate position to work with.
        const { lat, lng } = await getCurrentCoords();
        await api.patch('/drivers/me/location', { lat, lng });
      }
      await api.patch('/drivers/me/status', { is_online: value });
      setIsOnline(value);
      await reloadProfile();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  const accept = async (orderId) => {
    setAccepting(orderId);
    try {
      await api.post(`/drivers/me/orders/${orderId}/accept`);
      navigation.navigate('DriverOrder', { orderId });
    } catch (err) {
      Alert.alert('Could not accept', err.response?.data?.error || 'This order may have just been taken by another driver.');
      loadOrders();
    } finally {
      setAccepting(null);
    }
  };

  const reject = async (orderId) => {
    try {
      await api.post(`/drivers/me/orders/${orderId}/reject`);
      loadOrders();
    } catch (err) {
      // fail quietly, list will refresh on next poll
    }
  };

  if (profile?.verification_status !== 'approved') {
    return (
      <View style={styles.container}>
        <View style={{ padding: 20, paddingTop: 60 }}>
          <Text style={styles.title}>Verification pending</Text>
          <Text style={{ color: colors.textDim, marginTop: 8 }}>
            Your documents are being reviewed. You'll be able to go online once approved.
          </Text>
          <TouchableOpacity onPress={logout} style={{ marginTop: 24 }}>
            <Text style={{ color: colors.live }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Delivery requests</Text>
          <Text style={{ color: colors.textDim, textTransform: 'capitalize' }}>{profile?.vehicle_type} driver</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: isOnline ? colors.live : colors.textDim, marginBottom: 4, fontSize: 12 }}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={toggleOnline}
            disabled={toggling}
            trackColor={{ false: colors.border, true: colors.liveDim }}
            thumbColor={isOnline ? colors.live : colors.textDim}
          />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {locationError ? <Text style={styles.error}>{locationError}</Text> : null}

      {!isOnline ? (
        <Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 60 }}>
          Go online to start receiving delivery requests.
        </Text>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>No requests nearby right now.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.business_name}</Text>
              <Text style={styles.cardSub}>{item.distance_to_pickup_mi} mi to pickup</Text>
              <Text style={styles.cardSub}>Est. earning: ${Number(item.driver_earnings).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity style={styles.acceptButton} onPress={() => accept(item.id)} disabled={accepting === item.id}>
                  {accepting === item.id ? <ActivityIndicator color={colors.liveText} /> : <Text style={{ color: colors.liveText, fontWeight: '700' }}>Accept</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectButton} onPress={() => reject(item.id)}>
                  <Text style={{ color: colors.danger, fontWeight: '600' }}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity onPress={logout} style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: colors.textDim }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardSub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  acceptButton: { backgroundColor: colors.live, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  rejectButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  error: { color: colors.danger, padding: 12 },
});
