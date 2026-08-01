import { useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(phone, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your phone and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Image source={require('../../assets/icon.png')} style={{ width: 64, height: 64, borderRadius: 16, alignSelf: 'center', marginBottom: 12 }} />
<Text style={styles.title}>Zelo</Text>
      <Text style={styles.subtitle}>Food, groceries, and more — delivered</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={styles.input}
        placeholder="(555) 123-4567"placeholder="(555) 123-4567"
        placeholderTextColor={colors.textDim}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={colors.textDim}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 20 }}>
        <Text style={{ color: colors.textDim, textAlign: 'center' }}>
          New here? <Text style={{ color: colors.live }}>Create an account</Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28 },
  title: { fontSize: 32, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.textDim, fontSize: 14, marginBottom: 32 },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, color: colors.text, fontSize: 15,
  },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 28 },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerDim, padding: 12, borderRadius: 8, marginBottom: 12 },
});
