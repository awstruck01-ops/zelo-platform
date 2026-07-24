import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const ROLES = [
  { key: 'customer', label: 'Customer' },
  { key: 'driver', label: 'Driver' },
];

const VEHICLES = ['bicycle', 'scooter', 'motorcycle', 'car', 'truck'];

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [role, setRole] = useState('customer');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    setError('');
    if (!phone) return setError('Enter your phone number first');
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone });
      setOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const payload = { phone, otp, password, role, date_of_birth: dob };
      if (role === 'driver') payload.vehicle_type = vehicleType;
      await register(payload);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 28 }}>
      <Text style={styles.title}>Create account</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>I am a…</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.roleChip, role === r.key && styles.roleChipActive]}
            onPress={() => setRole(r.key)}
          >
            <Text style={{ color: role === r.key ? colors.live : colors.textDim }}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Phone number</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.textDim} />

      <TouchableOpacity onPress={sendOtp} disabled={loading} style={{ marginTop: 8 }}>
        <Text style={{ color: colors.live }}>{otpSent ? 'Resend OTP' : 'Send OTP'}</Text>
      </TouchableOpacity>

      {otpSent && (
        <>
          <Text style={styles.label}>Enter OTP</Text>
          <TextInput style={styles.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholderTextColor={colors.textDim} />
        </>
      )}

      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholderTextColor={colors.textDim} />

      <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="1998-07-07" placeholderTextColor={colors.textDim} />

      {role === 'driver' && (
        <>
          <Text style={styles.label}>Vehicle type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {VEHICLES.map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.roleChip, vehicleType === v && styles.roleChipActive]}
                onPress={() => setVehicleType(v)}
              >
                <Text style={{ color: vehicleType === v ? colors.live : colors.textDim, textTransform: 'capitalize' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={loading || !otpSent}>
        {loading ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.primaryButtonText}>Create account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 20, marginBottom: 40 }}>
        <Text style={{ color: colors.textDim, textAlign: 'center' }}>
          Already have an account? <Text style={{ color: colors.live }}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 20 },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, color: colors.text, fontSize: 15,
  },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 28 },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerDim, padding: 12, borderRadius: 8, marginBottom: 12 },
  roleChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 8,
  },
  roleChipActive: { borderColor: colors.live, backgroundColor: colors.liveDim },
});
