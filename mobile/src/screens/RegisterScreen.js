import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const ROLES = [
  { key: 'customer', label: 'Customer' },
  { key: 'driver', label: 'Driver' },
];

const VEHICLES = ['bicycle', 'scooter', 'motorcycle', 'car', 'truck'];

const DRIVER_POLICY_TEXT = `By driving with Zelo, you agree to:

• Maintain a valid driver's license and current vehicle insurance at all times
• Follow all traffic laws and drive safely
• Treat customers, sellers, and other drivers with respect
• Complete deliveries as accepted, or reject promptly if unable
• Take a photo confirming delivery at the customer's location
• Report any accidents, incidents, or safety concerns immediately
• Operate as an independent contractor responsible for your own taxes

Zelo may suspend or terminate driver accounts for policy violations, safety concerns, or fraudulent activity.`;

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [role, setRole] = useState('customer');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Driver-only fields
  const [licenseUrl, setLicenseUrl] = useState('');
  const [insuranceUrl, setInsuranceUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingInsurance, setUploadingInsurance] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [w9LegalName, setW9LegalName] = useState('');
  const [w9TaxId, setW9TaxId] = useState('');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

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

  // Shared upload helper — takes an already-picked/captured asset and sends it
  // to the backend, updating the relevant preview URL on success.
  // IMPORTANT: do NOT manually set a Content-Type header here. React Native's
  // networking layer needs to generate the multipart boundary itself; setting
  // 'multipart/form-data' without a boundary makes the server unable to parse
  // the upload, so the request silently fails server-side.
  const uploadAsset = async (asset, setUrl, setUploading) => {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || `upload-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      const res = await api.post('/uploads/registration', formData);
      setUrl(res.data.data.url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Camera-only capture for documents like the driver's license — opens the
  // camera directly, no gallery option.
  const captureDocument = async (setUrl, setUploading) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to take this photo');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (result.canceled) return;
    await uploadAsset(result.assets[0], setUrl, setUploading);
  };

  // Lets the user choose between taking a new photo or picking an existing
  // one from their gallery — used for proof of insurance.
  const captureOrPickDocument = (setUrl, setUploading) => {
    Alert.alert(
      'Add photo',
      'Take a new photo or choose one from your gallery',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              setError('Camera permission is required to take this photo');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
            if (result.canceled) return;
            await uploadAsset(result.assets[0], setUrl, setUploading);
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              setError('Photo library permission is required to upload documents');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
            if (result.canceled) return;
            await uploadAsset(result.assets[0], setUrl, setUploading);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Camera-only capture for the identity selfie — deliberately does NOT allow
  // picking from the gallery, since the whole point is a live photo taken
  // right now, not an old/borrowed image.
  const captureSelfie = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to complete your application');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      quality: 0.8,
    });
    if (result.canceled) return;
    await uploadAsset(result.assets[0], setSelfieUrl, setUploadingSelfie);
  };

  const driverFieldsComplete =
    role !== 'driver' ||
    (licenseUrl && insuranceUrl && selfieUrl && w9LegalName && w9TaxId && agreedToPolicy && email);

  const submit = async () => {
    setError('');
    if (role === 'driver' && !driverFieldsComplete) {
      setError('Please complete all driver requirements below before continuing');
      return;
    }
    setLoading(true);
    try {
      const payload = { phone, otp, password, role, date_of_birth: dob, email: email || undefined };
      if (role === 'driver') {
        payload.vehicle_type = vehicleType;
        payload.license_url = licenseUrl;
        payload.insurance_doc_url = insuranceUrl;
        payload.selfie_url = selfieUrl;
        payload.w9_legal_name = w9LegalName;
        payload.w9_tax_id = w9TaxId;
        payload.agreed_to_policy = true;
      }
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
          <Text style={styles.label}>Email (for approval + updates)</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
            placeholderTextColor={colors.textDim}
          />

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

          <Text style={styles.sectionHeader}>Driver verification</Text>

          <Text style={styles.label}>Driver's license photo</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => captureDocument(setLicenseUrl, setUploadingLicense)}
            disabled={uploadingLicense}
          >
            {uploadingLicense ? (
              <ActivityIndicator color={colors.live} />
            ) : (
              <Text style={{ color: colors.live }}>{licenseUrl ? 'Retake photo' : 'Open camera'}</Text>
            )}
          </TouchableOpacity>
          {licenseUrl ? <Image source={{ uri: licenseUrl }} style={styles.preview} /> : null}

          <Text style={styles.label}>Proof of insurance</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => captureOrPickDocument(setInsuranceUrl, setUploadingInsurance)}
            disabled={uploadingInsurance}
          >
            {uploadingInsurance ? (
              <ActivityIndicator color={colors.live} />
            ) : (
              <Text style={{ color: colors.live }}>{insuranceUrl ? 'Change photo' : 'Add photo'}</Text>
            )}
          </TouchableOpacity>
          {insuranceUrl ? <Image source={{ uri: insuranceUrl }} style={styles.preview} /> : null}

          <Text style={styles.label}>Take a photo of yourself</Text>
          <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 8 }}>
            This confirms it's really you applying — camera only, no gallery uploads.
          </Text>
          <TouchableOpacity style={styles.uploadButton} onPress={captureSelfie} disabled={uploadingSelfie}>
            {uploadingSelfie ? (
              <ActivityIndicator color={colors.live} />
            ) : (
              <Text style={{ color: colors.live }}>{selfieUrl ? 'Retake photo' : 'Open camera'}</Text>
            )}
          </TouchableOpacity>
          {selfieUrl ? <Image source={{ uri: selfieUrl }} style={styles.preview} /> : null}

          <Text style={styles.sectionHeader}>Tax information (Form W-9)</Text>
          <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 8 }}>
            As an independent contractor, we need this to report your earnings to the IRS.
          </Text>

          <Text style={styles.label}>Legal name</Text>
          <TextInput style={styles.input} value={w9LegalName} onChangeText={setW9LegalName} placeholderTextColor={colors.textDim} />

          <Text style={styles.label}>SSN or EIN</Text>
          <TextInput
            style={styles.input}
            value={w9TaxId}
            onChangeText={setW9TaxId}
            keyboardType="number-pad"
            placeholder="XXX-XX-XXXX"
            placeholderTextColor={colors.textDim}
            secureTextEntry
          />

          <Text style={styles.sectionHeader}>Driver policy</Text>
          <TouchableOpacity onPress={() => setShowPolicy(!showPolicy)}>
            <Text style={{ color: colors.live, marginBottom: 8 }}>
              {showPolicy ? 'Hide policy ▲' : 'Read driver policy ▼'}
            </Text>
          </TouchableOpacity>
          {showPolicy && (
            <View style={styles.policyBox}>
              <Text style={{ color: colors.textDim, fontSize: 13, lineHeight: 20 }}>{DRIVER_POLICY_TEXT}</Text>
            </View>
          )}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}
            onPress={() => setAgreedToPolicy(!agreedToPolicy)}
          >
            <View style={[styles.checkbox, agreedToPolicy && styles.checkboxChecked]}>
              {agreedToPolicy ? <Text style={{ color: colors.liveText, fontSize: 12 }}>✓</Text> : null}
            </View>
            <Text style={{ color: colors.text, marginLeft: 10, flex: 1 }}>
              I have read and agree to the driver policy and independent contractor terms
            </Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, (loading || !otpSent || !driverFieldsComplete) && { opacity: 0.5 }]}
        onPress={submit}
        disabled={loading || !otpSent || !driverFieldsComplete}
      >
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
  sectionHeader: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 26, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, color: colors.text, fontSize: 15,
  },
  uploadButton: {
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 2,
  },
  preview: { width: '100%', height: 140, borderRadius: 10, marginTop: 10, backgroundColor: colors.border },
  policyBox: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, maxHeight: 220,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.live, borderColor: colors.live },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 28 },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerDim, padding: 12, borderRadius: 8, marginBottom: 12 },
  roleChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 8,
  },
  roleChipActive: { borderColor: colors.live, backgroundColor: colors.liveDim },
});
