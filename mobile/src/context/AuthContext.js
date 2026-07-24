import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get('/auth/profile');
      setUser(res.data.data.user);
      setProfile(res.data.data.profile);
    } catch (err) {
      setUser(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('zelo_token');
      if (token) await loadProfile();
      setLoading(false);
    })();
  }, [loadProfile]);

  const login = async (phone, password) => {
    const res = await api.post('/auth/login', { phone, password });
    await AsyncStorage.setItem('zelo_token', res.data.data.token);
    setUser(res.data.data.user);
    await loadProfile();
  };

  const register = async (payload) => {
    const res = await api.post('/auth/register', payload);
    await AsyncStorage.setItem('zelo_token', res.data.data.token);
    setUser(res.data.data.user);
    await loadProfile();
  };

  const logout = async () => {
    await AsyncStorage.removeItem('zelo_token');
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, logout, reloadProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
