import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { getCurrentCoords, reverseGeocode } from '../utils/location';

export default function AddressPicker({ deliveryLat, deliveryLng, deliveryAddress, onLocationSet }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [labelDraft, setLabelDraft] = useState(deliveryAddress?.text || '');

  const useMyLocation = async () => {
    setLocating(true);
    setError('');
    try {
      const { lat, lng } = await getCurrentCoords();
      const readable = await reverseGeocode(lat, lng);
      const text = readable || `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      setLabelDraft(text);
      onLocationSet(lat, lng, { label: 'Current location', text });
    } catch (err) {
      setError(err.message || 'Could not get your location');
    } finally {
      setLocating(false);
    }
  };

  const applyManualLabel = () => {
    if (deliveryLat == null || deliveryLng == null) {
      setError('Set your location first, then you can edit the address text');
      return;
    }
    onLocationSet(deliveryLat, deliveryLng, { label: deliveryAddress?.label || 'Delivery address', text: labelDraft });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Delivery address</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.locateButton} onPress={useMyLocation} disabled={locating}>
        {locating ? (
          <ActivityIndicator color={colors.live} />
        ) : (
          <Text style={{ color: colors.live, fontWeight: '600' }}>📍 Use my current location</Text>
        )}
      </TouchableOpacity>

      {deliveryLat != null && (
        <>
          <Text style={styles.label}>Address details (edit if needed)</Text>
          <TextInput
            style={styles.input}
            value={labelDraft}
            onChangeText={setLabelDraft}
            onEndEditing={applyManualLabel}
            placeholder="e.g. 512 S Congress Ave, Austin, TX 78704"
            placeholderTextColor={colors.textDim}
            multiline
          />
          <Text style={styles.coords}>{deliveryLat.toFixed(5)}, {deliveryLng.toFixed(5)}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  heading: { color: colors.text, fontWeight: '700', marginBottom: 10, fontSize: 15 },
  locateButton: {
    borderWidth: 1, borderColor: colors.live, borderRadius: 10, padding: 12, alignItems: 'center',
    backgroundColor: colors.liveDim,
  },
  label: { color: colors.textDim, fontSize: 12, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, color: colors.text, fontSize: 14, minHeight: 44,
  },
  coords: { color: colors.textDim, fontSize: 11, marginTop: 6, fontFamily: 'monospace' },
  error: { color: colors.danger, marginBottom: 10 },
});
