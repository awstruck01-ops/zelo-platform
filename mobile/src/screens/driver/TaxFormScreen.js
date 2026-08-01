import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';

const CLASSIFICATIONS = [
  { key: 'individual', label: 'Individual / Sole Proprietor' },
  { key: 'llc', label: 'LLC' },
  { key: 'c_corp', label: 'C Corporation' },
  { key: 's_corp', label: 'S Corporation' },
  { key: 'partnership', label: 'Partnership' },
];

export default function TaxFormScreen() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [legalName, setLegalName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [taxClassification, setTaxClassification] = useState('individual');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [taxId, setTaxId] = useState('');
  const [signatureName, setSignatureName] = useState('');

  const load = useCallback(() => {
    api.get('/drivers/me/tax-form/current')
      .then((res) => {
        setStatus(res.data.data);
        const sub = res.data.data.submission_for_current_version;
        if (sub) {
          setLegalName(sub.legal_name || '');
          setBusinessName(sub.business_name || '');
          setTaxClassification(sub.tax_classification || 'individual');
          setAddress(sub.address || '');
          setCity(sub.city || '');
          setState(sub.state || '');
          setZip(sub.zip || '');
          setSignatureName(sub.signature_name || '');
        }
        setEditing(res.data.data.needs_submission);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load tax form status'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setError('');
    if (!legalName || !taxClassification || !address || !city || !state || !zip || !taxId || !signatureName) {
      setError('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/drivers/me/tax-form/submit', {
        legal_name: legalName,
        business_name: businessName || undefined,
        tax_classification: taxClassification,
        address, city, state, zip,
        tax_id: taxId,
        signature_name: signatureName,
      });
      setEditing(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit tax form');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  if (!editing && status?.submission_for_current_version) {
    const sub = status.submission_for_current_version;
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 30 }}>
        <View style={styles.upToDateCard}>
          <Text style={styles.upToDateTitle}>You're up to date ✓</Text>
          <Text style={styles.summaryRow}>Legal name: {sub.legal_name}</Text>
          <Text style={styles.summaryRow}>Classification: {CLASSIFICATIONS.find((c) => c.key === sub.tax_classification)?.label || sub.tax_classification}</Text>
          <Text style={styles.summaryRow}>Address: {sub.address}, {sub.city}, {sub.state} {sub.zip}</Text>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditing(true)}>
          <Text style={{ color: colors.live }}>Resubmit / update info</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 30 }}>
      <Text style={styles.title}>Tax information (Form W-9)</Text>
      <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 16 }}>
        As an independent contractor, we need this to report your earnings to the IRS.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Legal name</Text>
      <TextInput style={styles.input} value={legalName} onChangeText={setLegalName} placeholderTextColor={colors.textDim} />

      <Text style={styles.label}>Business name (if applicable)</Text>
      <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholderTextColor={colors.textDim} />

      <Text style={styles.label}>Tax classification</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        {CLASSIFICATIONS.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, taxClassification === c.key && styles.chipActive]}
            onPress={() => setTaxClassification(c.key)}
          >
            <Text style={{ color: taxClassification === c.key ? colors.live : colors.textDim, fontSize: 13 }}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholderTextColor={colors.textDim} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 2 }}>
          <Text style={styles.label}>City</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor={colors.textDim} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>State</Text>
          <TextInput style={styles.input} value={state} onChangeText={setState} maxLength={2} autoCapitalize="characters" placeholderTextColor={colors.textDim} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>ZIP</Text>
          <TextInput style={styles.input} value={zip} onChangeText={setZip} keyboardType="number-pad" placeholderTextColor={colors.textDim} />
        </View>
      </View>

      <Text style={styles.label}>SSN or EIN</Text>
      <TextInput style={styles.input} value={taxId} onChangeText={setTaxId} keyboardType="number-pad" secureTextEntry placeholderTextColor={colors.textDim} />

      <Text style={styles.label}>Signature (type your full legal name)</Text>
      <TextInput style={styles.input} value={signatureName} onChangeText={setSignatureName} placeholderTextColor={colors.textDim} />

      <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.primaryButtonText}>Submit</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, color: colors.text, fontSize: 15,
  },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { borderColor: colors.live, backgroundColor: colors.liveDim },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 28 },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  secondaryButton: { alignItems: 'center', padding: 14 },
  error: { color: colors.danger, backgroundColor: colors.dangerDim, padding: 12, borderRadius: 8, marginBottom: 12 },
  upToDateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20 },
  upToDateTitle: { color: colors.live, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  summaryRow: { color: colors.text, fontSize: 14, marginBottom: 6 },
});
