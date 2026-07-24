import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Requests permission and returns the device's current { lat, lng }.
 * Throws a friendly Error if permission is denied or location can't be read.
 */
export async function getCurrentCoords() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied. Enable it in your device settings to continue.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

/**
 * Attempts to turn coordinates into a human-readable address string.
 * Reverse geocoding isn't available on Expo web, so this degrades gracefully
 * there and lets the caller fall back to a manually-typed label instead.
 */
export async function reverseGeocode(lat, lng) {
  if (Platform.OS === 'web') return null;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results || results.length === 0) return null;
    const r = results[0];
    return [r.street, r.district || r.subregion, r.city, r.region].filter(Boolean).join(', ');
  } catch (err) {
    return null;
  }
}
