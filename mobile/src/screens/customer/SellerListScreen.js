import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Location from 'expo-location';
import { colors } from '../../theme';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 220;
const CAROUSEL_INTERVAL_MS = 6000;

const isVideoUrl = (url) => !!url && /\.(mp4|mov|webm)(\?.*)?$/i.test(url);

function MediaVideo({ uri, style }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
}

function MediaThumbnail({ uri, style }) {
  if (!uri) return null;
  if (isVideoUrl(uri)) return <MediaVideo uri={uri} style={style} />;
  return <Image source={{ uri }} style={style} />;
}

function BannerCarousel({ sellers }) {
  const carouselRef = useRef(null);
  const indexRef = useRef(0);
  const withImages = sellers.filter((s) => s.image_url);

  useEffect(() => {
    if (withImages.length < 2) return;
    const interval = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % withImages.length;
      carouselRef.current?.scrollToOffset({ offset: indexRef.current * SCREEN_WIDTH, animated: true });
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [withImages.length]);

  if (withImages.length === 0) return null;

  return (
    <View style={{ height: CAROUSEL_HEIGHT, backgroundColor: colors.border }}>
      <FlatList
        ref={carouselRef}
        data={withImages}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH, height: CAROUSEL_HEIGHT }}>
            <MediaThumbnail uri={item.image_url} style={{ width: SCREEN_WIDTH, height: CAROUSEL_HEIGHT }} />
            <View style={styles.carouselOverlay}>
              <Text style={styles.carouselTitle}>{item.business_name}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

export default function SellerListScreen({ navigation }) {
  const { logout, user, setAppMode } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [coords, setCoords] = useState(null);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission is needed to find sellers near you');
        setLoading(false);
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({});
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch (err) {
        setLocationError('Could not determine your location');
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(() => {
    if (!coords) return;
    api.get('/sellers', { params: { lat: coords.lat, lng: coords.lng } })
      .then((res) => setSellers(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load sellers'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [coords]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;
  if (locationError) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.danger, padding: 20, paddingTop: 60, textAlign: 'center' }}>{locationError}</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby</Text>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <TouchableOpacity onPress={() => navigation.navigate('OrderHistory')}>
            <Text style={{ color: colors.live }}>My orders</Text>
          </TouchableOpacity>
          {user?.role === 'driver' && (
            <TouchableOpacity onPress={() => setAppMode(null)}>
              <Text style={{ color: colors.live, fontSize: 13 }}>Switch mode</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={logout}>
            <Text style={{ color: colors.textDim, fontSize: 13 }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={sellers}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.live} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={<BannerCarousel sellers={sellers} />}
        ListHeaderComponentStyle={{ marginHorizontal: -16, marginBottom: 16 }}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>No sellers found nearby.</Text>}
       renderItem={({ item }) => (
         <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}>
  <MediaThumbnail uri={item.image_url} style={styles.cardImage} />
  <View style={{ flex: 1 }}>
    <Text style={styles.cardTitle}>{item.business_name}</Text>
    <Text style={styles.cardSub}>{item.category} · {item.item_count} item(s)</Text>
    {item.distance_mi != null && (
      <Text style={styles.cardSub}>{Number(item.distance_mi).toFixed(1)} mi away</Text>
    )}
  </View>
  {item.avg_rating && <Text style={styles.rating}>★ {item.avg_rating}</Text>}
</TouchableOpacity>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  carouselOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  carouselTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cardImage: { width: 64, height: 64, borderRadius: 8, marginRight: 12, backgroundColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardSub: { color: colors.textDim, fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  rating: { color: colors.pending, fontWeight: '600' },
  error: { color: colors.danger, padding: 12, marginHorizontal: 16 },
  logout: { padding: 16, alignItems: 'center' },
});