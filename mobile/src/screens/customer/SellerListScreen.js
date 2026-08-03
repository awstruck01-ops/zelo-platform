import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image, Dimensions, Animated } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import { colors } from '../../theme';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 220;
const CAROUSEL_INTERVAL_MS = 5800;
const CROSSFADE_MS = 600;

const isVideoUrl = (url) => !!url && /\.(mp4|mov|webm)(\?.*)?$/i.test(url);

function MediaVideo({ uri, style, active }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
    player.muted = true;
  });

  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  // pointerEvents="none" — the video surface must not swallow taps, or the
  // TouchableOpacity wrapping this slide never receives the press.
  return (
    <View style={style} pointerEvents="none">
      <VideoView player={player} style={StyleSheet.absoluteFillObject} contentFit="cover" nativeControls={false} />
    </View>
  );
}

function MediaThumbnail({ uri, style, active = true }) {
  if (!uri) return null;
  if (isVideoUrl(uri)) return <MediaVideo uri={uri} style={style} active={active} />;
  return <Image source={{ uri }} style={style} />;
}

// Every slide stays mounted the whole time (just hidden/paused), instead of
// being created fresh when its turn comes up. That means every video already
// has a decoded first frame ready to show, and every image is already
// downloaded — eliminating the black/gray flash that showed up when slides
// were mounted on-demand. Only the active slide actually plays video or
// receives taps; the rest sit inert underneath.
function BannerCarousel({ sellers, screenFocused, onPressSeller }) {
  const withImages = sellers.filter((s) => s.image_url);
  const [index, setIndex] = useState(0);
  const opacities = useRef([]).current;

  if (opacities.length !== withImages.length) {
    opacities.length = 0;
    withImages.forEach((_, i) => opacities.push(new Animated.Value(i === 0 ? 1 : 0)));
  }

  useEffect(() => {
    withImages.forEach((s) => {
      if (!isVideoUrl(s.image_url)) {
        Image.prefetch(s.image_url).catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellers]);

  useEffect(() => {
    if (!screenFocused || withImages.length < 2) return;
    const interval = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % withImages.length;
        Animated.parallel([
          Animated.timing(opacities[current], { toValue: 0, duration: CROSSFADE_MS, useNativeDriver: true }),
          Animated.timing(opacities[next], { toValue: 1, duration: CROSSFADE_MS, useNativeDriver: true }),
        ]).start();
        return next;
      });
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [screenFocused, withImages.length, opacities]);

  if (withImages.length === 0) return null;

  return (
    <View style={{ height: CAROUSEL_HEIGHT, backgroundColor: colors.border }}>
      {withImages.map((seller, i) => (
        <Animated.View
          key={seller.id}
          pointerEvents={i === index ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFillObject, { opacity: opacities[i] }]}
        >
          <TouchableOpacity activeOpacity={0.9} onPress={() => onPressSeller(seller.id)} style={StyleSheet.absoluteFillObject}>
            <MediaThumbnail
              uri={seller.image_url}
              style={{ width: SCREEN_WIDTH, height: CAROUSEL_HEIGHT }}
              active={i === index && screenFocused}
            />
            <View style={styles.carouselOverlay}>
              <Text style={styles.carouselTitle}>{seller.business_name}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  );
}

export default function SellerListScreen({ navigation }) {
  const { logout, user, setAppMode } = useAuth();
  const isFocused = useIsFocused();
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
        ListHeaderComponent={
          <BannerCarousel
            sellers={sellers}
            screenFocused={isFocused}
            onPressSeller={(sellerId) => navigation.navigate('SellerDetail', { sellerId })}
          />
        }
        ListHeaderComponentStyle={{ marginHorizontal: -16, marginBottom: 16 }}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>No sellers found nearby.</Text>}
       renderItem={({ item }) => (
         <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}>
  <MediaThumbnail uri={item.image_url} style={styles.cardImage} active={false} />
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