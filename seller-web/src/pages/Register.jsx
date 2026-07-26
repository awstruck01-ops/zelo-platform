import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import PolicyModal from '../components/PolicyModal';

const CLOUD_NAME = 'jwv51r23';
const UPLOAD_PRESET = 'zelo_unsigned';

export default function Register() {
  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [locating, setLocating] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [category, setCategory] = useState('restaurant');
  const [mediaType, setMediaType] = useState('photo'); // 'photo' | 'video'
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);

      const resourceType = mediaType === 'video' ? 'video' : 'image';
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (data.secure_url) {
        setImageUrl(data.secure_url);
      } else {
        setError('Upload failed. Please try again.');
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const useCurrentLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Location is not supported on this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLocating(false);
      },
      () => {
        setError('Could not get your location. Please allow location access and try again.');
        setLocating(false);
      }
    );
  };

  const requestOtp = async (e) => {
    e.preventDefault();
    setError('');

    if (!businessName || !phone || !password || !dateOfBirth || !address) {
      setError('Please fill in all fields.');
      return;
    }
    if (lat === null || lng === null) {
      setError('Please set your business location before continuing.');
      return;
    }
    if (!agreedToTos) {
      setError('You must agree to the Terms of Service to continue.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone });
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!otp) {
      setError('Please enter the code sent to your phone.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        role: 'seller',
        phone,
        otp,
        password,
        date_of_birth: dateOfBirth,
        business_name: businessName,
        category,
        address,
        lat,
        lng,
        image_url: imageUrl || null,
        agreed_to_tos: true,
      });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/zelo-logo-horizontal.svg" alt="Zelo" style={{ height: 36 }} />
          <span style={{ color: 'var(--accent-live)' }}>Seller</span>
        </h1>
        <p>Create your storefront on Zelo</p>

        {error && <div className="error-banner">{error}</div>}

        {step === 'details' && (
          <form onSubmit={requestOtp}>
            <div className="field">
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Mama Ngozi Kitchen"
                required
              />
            </div>

            <div className="field">
              <label>Business type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCategory('restaurant')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8,
                    border: category === 'restaurant' ? '2px solid var(--accent-live)' : '1px solid #ccc',
                    background: category === 'restaurant' ? 'var(--accent-live)' : 'transparent',
                    color: category === 'restaurant' ? '#fff' : 'inherit',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  🍽️ Restaurant
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('store')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8,
                    border: category === 'store' ? '2px solid var(--accent-live)' : '1px solid #ccc',
                    background: category === 'store' ? 'var(--accent-live)' : 'transparent',
                    color: category === 'store' ? '#fff' : 'inherit',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  🏪 Store
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="1 (718) 810-3683"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="dob">Date of birth</label>
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="address">Business address</label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, City, State"
                required
              />
            </div>

            <div className="field">
              <label>Business location</label>
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                style={{ width: '100%' }}
              >
                {locating
                  ? 'Getting location...'
                  : lat !== null
                  ? 'Location set ✓ (tap to update)'
                  : 'Use my current location'}
              </button>
            </div>

            <div className="field">
              <label>Storefront media</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => { setMediaType('photo'); setImageUrl(''); }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8,
                    border: mediaType === 'photo' ? '2px solid var(--accent-live)' : '1px solid #ccc',
                    background: mediaType === 'photo' ? 'var(--accent-live)' : 'transparent',
                    color: mediaType === 'photo' ? '#fff' : 'inherit', cursor: 'pointer',
                  }}
                >
                  📷 Photo
                </button>
                <button
                  type="button"
                  onClick={() => { setMediaType('video'); setImageUrl(''); }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8,
                    border: mediaType === 'video' ? '2px solid var(--accent-live)' : '1px solid #ccc',
                    background: mediaType === 'video' ? 'var(--accent-live)' : 'transparent',
                    color: mediaType === 'video' ? '#fff' : 'inherit', cursor: 'pointer',
                  }}
                >
                  🎥 Video
                </button>
              </div>

              <input
                id="storeImage"
                type="file"
                accept={mediaType === 'video' ? 'video/*' : 'image/*'}
                onChange={handleImageUpload}
                disabled={uploading}
              />
              {uploading && <p style={{ fontSize: 13, opacity: 0.7 }}>Uploading...</p>}
              {imageUrl && mediaType === 'photo' && (
                <img
                  src={imageUrl}
                  alt="Storefront preview"
                  style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
                />
              )}
              {imageUrl && mediaType === 'video' && (
                <video
                  src={imageUrl}
                  controls
                  style={{ width: '100%', maxHeight: 160, borderRadius: 8, marginTop: 8 }}
                />
              )}
            </div>

            <div className="field">
              <label>Seller Agreement</label>
              <button
                type="button"
                onClick={() => setPolicyOpen(true)}
                style={{
                  width: '100%', padding: '10px', borderRadius: 8,
                  border: agreedToTos ? '2px solid var(--accent-live)' : '1px solid #ccc',
                  background: agreedToTos ? 'rgba(0,150,80,0.08)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {agreedToTos ? '✅ Agreement accepted (tap to review)' : '📄 Read & agree to Seller Agreement'}
              </button>
            </div>

            <button
              type="submit"
              className="primary"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading || uploading}
            >
              {loading ? 'Sending code...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submit}>
            <p style={{ fontSize: 14, opacity: 0.8 }}>
              Enter the verification code sent to {phone}
            </p>
            <div className="field">
              <label htmlFor="otp">Verification code</label>
              <input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                required
              />
            </div>
            <button
              type="submit"
              className="primary"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create seller account'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>

      <PolicyModal
        open={policyOpen}
        onAgree={() => { setAgreedToTos(true); setPolicyOpen(false); }}
        onClose={() => setPolicyOpen(false)}
      />
    </div>
  );
}
