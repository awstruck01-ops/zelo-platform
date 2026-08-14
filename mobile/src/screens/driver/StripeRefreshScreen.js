import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export default function StripeRefreshScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>That link expired</Text>
      <Text style={styles.sub}>
        Your bank account setup link timed out before you finished. No problem —
        head back to Payouts and tap "Connect bank account" again for a fresh link.
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
