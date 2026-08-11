import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Replace with your actual key or pull from app config / env
const GOOGLE_MAPS_API_KEY = 'AIzaSyD77HMg1Nyo_fjnkjKcg6k4D1--OpUQAOs';

/**
 * Navigated to like:
 * navigation.navigate('DriverMap', {
 *   pickup: { latitude, longitude, label },
 *   dropoff: { latitude, longitude, label },
 *   phase: 'to_pickup' | 'to_dropoff',
 * });
 */
export default function DriverMapScreen({ route, navigation }) {
  const { orderId, pickup, dropoff, phase = 'to_pickup' } = route.params || {};
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [abandonModalVisible, setAbandonModalVisible] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
  const [abandoning, setAbandoning] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const mapRef = useRef(null);
  const { logout } = useAuth();

  const destination = phase === 'to_pickup' ? pickup : dropoff;

  // Watch driver's live location
  useEffect(() => {
    let subscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location permission is required to navigate.');
        setLoading(false);
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 15,
        },
        (loc) => {
          setDriverLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // Fetch route from Directions API whenever driver location or destination changes
  useEffect(() => {
    if (!driverLocation || !destination) return;

    const fetchRoute = async () => {
      try {
        const origin = `${driverLocation.latitude},${driverLocation.longitude}`;
        const dest = `${destination.latitude},${destination.longitude}`;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&key=${GOOGLE_MAPS_API_KEY}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.status === 'OK' && data.routes.length > 0) {
          const points = decodePolyline(data.routes[0].overview_polyline.points);
          setRouteCoords(points);
        }
      } catch (err) {
        console.warn('Failed to fetch route:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoute();
  }, [driverLocation, destination]);

  // Fit map to show driver + destination whenever route updates
  useEffect(() => {
    if (mapRef.current && driverLocation && destination) {
      mapRef.current.fitToCoordinates([driverLocation, destination], {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  }, [driverLocation, destination]);

  // Poll for unread messages (both the customer thread for this delivery and
  // the driver's admin support thread) so the badge stays current while the
  // driver is heads-down on the map.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api.get('/chat/conversations')
        .then((res) => {
          if (cancelled) return;
          const total = res.data.data.reduce((sum, c) => sum + Number(c.unread_count || 0), 0);
          setUnreadCount(total);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const openNativeNavigation = () => {
    if (!destination) return;
    const { latitude, longitude, label } = destination;
    const query = encodeURIComponent(label || `${latitude},${longitude}`);

    const url = Platform.select({
      ios: `maps://app?daddr=${latitude},${longitude}&q=${query}`,
      android: `google.navigation:q=${latitude},${longitude}`,
    });

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to browser-based Google Maps directions
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`
        );
      }
    });
  };

  // Cancels the in-progress order with the driver's reason, frees the driver
  // back up, and returns them to the home screen. This is for genuine
  // emergencies (car trouble, illness, etc.) — not a casual "change my
  // mind," which is why it requires typing a reason.
  const abandonDelivery = async () => {
    if (!orderId) {
      setAbandonModalVisible(false);
      return;
    }
    if (!abandonReason.trim()) return;

    setAbandoning(true);
    try {
      await api.post(`/drivers/me/orders/${orderId}/abandon`, { reason: abandonReason.trim() });
      setAbandonModalVisible(false);
      Alert.alert('Delivery abandoned', 'This order has been cancelled and flagged for support to follow up with the customer.');
      navigation.popToTop();
    } catch (err) {
      Alert.alert('Failed to abandon delivery', err.response?.data?.error || 'Please try again.');
    } finally {
      setAbandoning(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log out?',
      orderId
        ? 'You have a delivery in progress. Logging out will not cancel it — you can resume it next time you log in.'
        : 'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => logout() },
      ]
    );
  };

  if (errorMsg) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (loading || !driverLocation) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#A3E635" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        showsUserLocation
        followsUserLocation
        initialRegion={{
          ...driverLocation,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {pickup && (
          <Marker
            coordinate={pickup}
            title="Pickup"
            description={pickup.label}
            pinColor={phase === 'to_pickup' ? '#A3E635' : '#9CA3AF'}
          />
        )}

        {dropoff && (
          <Marker
            coordinate={dropoff}
            title="Drop-off"
            description={dropoff.label}
            pinColor={phase === 'to_dropoff' ? '#A3E635' : '#9CA3AF'}
          />
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="#111827"
          />
        )}
      </MapView>

      {/* Toggle to the message list and back — navigating to ChatList pushes
          on top of this screen, so backing out returns here with the map's
          state (position, tracked location, route) fully intact. */}
      <TouchableOpacity
        style={styles.messagesButton}
        onPress={() => navigation.navigate('ChatList')}
      >
        <Text style={styles.messagesButtonText}>💬</Text>
        {unreadCount > 0 && (
          <View style={styles.messagesBadge}>
            <Text style={styles.messagesBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Bottom card with destination info + Navigate button */}
      <View style={styles.bottomCard}>
        <Text style={styles.phaseLabel}>
          {phase === 'to_pickup' ? 'Heading to pickup' : 'Heading to drop-off'}
        </Text>
        <Text style={styles.destinationLabel} numberOfLines={1}>
          {destination?.label || 'Destination'}
        </Text>

        <TouchableOpacity style={styles.navigateButton} onPress={openNativeNavigation}>
          <Text style={styles.navigateButtonText}>Navigate</Text>
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          {orderId ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setAbandonModalVisible(true)}>
              <Text style={styles.abandonButtonText}>Abandon Delivery</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout}>
            <Text style={styles.secondaryButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={abandonModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAbandonModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Abandon this delivery?</Text>
            <Text style={styles.modalSubtitle}>
              This cancels the order and notifies support to follow up with the customer.
              Please explain what happened.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={abandonReason}
              onChangeText={setAbandonReason}
              placeholder="e.g. car broke down, medical emergency..."
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => { setAbandonModalVisible(false); setAbandonReason(''); }}
                disabled={abandoning}
              >
                <Text style={styles.modalCancelButtonText}>Never mind</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, !abandonReason.trim() && styles.modalConfirmButtonDisabled]}
                onPress={abandonDelivery}
                disabled={abandoning || !abandonReason.trim()}
              >
                {abandoning ? (
                  <ActivityIndicator color="#0B0F12" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Confirm Abandon</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Decodes Google's encoded polyline format into lat/lng points
function decodePolyline(encoded) {
  let points = [];
  let index = 0,
    lat = 0,
    lng = 0;

  while (index < encoded.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F12',
    padding: 24,
  },
  loadingText: { color: '#fff', marginTop: 12 },
  errorText: { color: '#F87171', textAlign: 'center' },
  bottomCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  phaseLabel: { color: '#A3E635', fontSize: 13, fontWeight: '600' },
  destinationLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 14,
  },
  navigateButton: {
    backgroundColor: '#A3E635',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  navigateButtonText: {
    color: '#0B0F12',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#D1D5DB',
    fontWeight: '600',
    fontSize: 14,
  },
  abandonButtonText: {
    color: '#F87171',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalCancelButtonText: {
    color: '#D1D5DB',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F87171',
  },
  modalConfirmButtonDisabled: {
    opacity: 0.5,
  },
  modalConfirmButtonText: {
    color: '#0B0F12',
    fontWeight: '700',
  },
  messagesButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  messagesButtonText: {
    fontSize: 22,
  },
  messagesBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F87171',
    borderRadius: 100,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#0B0F12',
  },
  messagesBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
