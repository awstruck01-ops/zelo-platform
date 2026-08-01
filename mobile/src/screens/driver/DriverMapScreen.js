import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

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
export default function DriverMapScreen({ route }) {
  const { pickup, dropoff, phase = 'to_pickup' } = route.params || {};
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const mapRef = useRef(null);

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
      </View>
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
});
