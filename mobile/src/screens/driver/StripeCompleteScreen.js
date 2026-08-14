import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export default function StripeCompleteScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bank account setup complete</Text>
      <Text style={styles.sub}>
        Stripe is verifying your details now — this usually takes a few minutes.
        Once it's done, payouts will happen automatically after each completed delivery.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Payouts')}>
        <Text style={styles.buttonText}>Back to Payouts</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  sub: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  button: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
});
