import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../theme';
import { getCurrentCoords, reverseGeocode } from '../../utils/location';

export default function PinLocationScreen({ route, navigation }) {
  const { initialLat, initialLng, onConfirm } = route.params || {};
  const [region, setRegion] = useState({
    latitude: initialLat || 37.78,
    longitude: initialLng || -122.41,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [confirming, setConfirming] = useState(false);
  const mapRef = useRef(null);

  const centerOnMe = async () => {
    try {
      const { lat, lng } = await getCurrentCoords();
      const next = { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 400);
    } catch {
      // ignore — user can still drag the map manually
    }
  };

  const confirmPin = async () => {
    setConfirming(true);
    try {
      const readable = await reverseGeocode(region.latitude, region.longitude);
      const text = readable || `Pinned location (${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)})`;
      onConfirm?.(region.latitude, region.longitude, { label: 'Pinned location', text });
      navigation.goBack();
    } catch {
      onConfirm?.(region.latitude, region.longitude, {
        label: 'Pinned location',
        text: `Pinned location (${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)})`,
      });
      navigation.goBack();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
      />
      {/* Fixed center pin — the map moves under it, so the pin always represents the center coordinate */}
      <View pointerEvents="none" style={styles.centerPin}>
        <Text style={{ fontSize: 36 }}>📍</Text>
      </View>

      <TouchableOpacity style={styles.myLocationButton} onPress={centerOnMe}>
        <Text style={{ color: colors.live, fontWeight: '600' }}>Center on me</Text>
      </TouchableOpacity>

      <View style={styles.bottomBar}>
        <Text style={styles.hint}>Move the map so the pin marks your delivery spot</Text>
        <TouchableOpacity style={styles.confirmButton} onPress={confirmPin} disabled={confirming}>
          {confirming ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.confirmButtonText}>Confirm this location</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerPin: {
    position: 'absolute', top: '50%', left: '50%',
    marginLeft: -18, marginTop: -36,
  },
  myLocationButton: {
    position: 'absolute', top: 60, right: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
  },
  bottomBar: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 16,
  },
  hint: { color: colors.textDim, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  confirmButton: { backgroundColor: colors.live, borderRadius: 10, padding: 14, alignItems: 'center' },
  confirmButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
});