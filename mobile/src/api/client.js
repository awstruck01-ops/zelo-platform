import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// When running on a physical device/emulator, replace localhost with your machine's LAN IP.
export const API_BASE = 'http://localhost:5000/api/v1';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('zelo_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
