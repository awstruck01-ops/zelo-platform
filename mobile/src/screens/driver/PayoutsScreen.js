import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Linking, Alert } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayoutsScreen() {
  const [earnings, setEarnings] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [stripeStatus, setStripeStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([
      api.get('/drivers/me/earnings'),
      api.get('/drivers/me/stripe/status'),
    ])
      .then(([earningsRes, statusRes]) => {
        setWallet(earningsRes.data.data.wallet);
        setEarnings(earningsRes.data.data);
        setStripeStatus(statusRes.data.data);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load payout info'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const connectBank = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await api.post('/drivers/me/stripe/onboard');
      const url = res.data.data.onboarding_url;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Could not open link', 'Try again in a moment.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start bank account setup');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={styles.title}>Payouts</Text>
      <Text style={styles.sub}>
        Zelo pays out automatically as soon as each delivery is complete — your bank
        details go directly to Stripe and are never stored by Zelo.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Total paid out</Text>
        <Text style={styles.cardValue}>{formatUSD(wallet?.balance)}</Text>
      </View>

      <View style={[styles.card, { flexDirection: 'row', gap: 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>This week</Text>
          <Text style={styles.cardValueSmall}>{formatUSD(earnings?.last_7_days)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>Completed deliveries</Text>
          <Text style={styles.cardValueSmall}>{earnings?.completed_deliveries ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>Bank account</Text>

      {!stripeStatus ? (
        <ActivityIndicator color={colors.live} />
      ) : stripeStatus.payouts_enabled ? (
        <View style={styles.statusCardLive}>
          <Text style={{ color: colors.live, fontWeight: '700' }}>✅ Connected — payouts active</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusCardPending}>
            <Text style={{ color: colors.text }}>
              {stripeStatus.connected ? 'Setup started but not finished yet.' : 'No bank account connected yet.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={connectBank} disabled={connecting}>
            {connecting ? (
              <ActivityIndicator color={colors.liveText} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {stripeStatus.connected ? 'Finish bank account setup' : 'Connect bank account'}
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sub: { color: colors.textDim, fontSize: 13, marginBottom: 20, lineHeight: 18 },
  sectionHeader: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  cardLabel: { color: colors.textDim, fontSize: 12, marginBottom: 4 },
  cardValue: { color: colors.text, fontSize: 24, fontWeight: '700' },
  cardValueSmall: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statusCardLive: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.live,
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  statusCardPending: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerDim, padding: 12, borderRadius: 8, marginBottom: 12 },
});
