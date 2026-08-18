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
// How long a slide's video + business name stay held on screen together
// before advancing to the next slide. Both the video and the name label are
// driven by the SAME opacity Animated.Value (see opacities[i] below), so
// they are held and released in lockstep by construction — the name can
// never show ahead of or behind its matching video.
const SLIDE_HOLD_MS = 5800;
const CAROUSEL_INTERVAL_MS = SLIDE_HOLD_MS;
const CROSSFADE_MS = 600;

const isVideoUrl = (url) => !!url && /\.(mp4|mov|webm)(\?.*)?$/i.test(url);

function MediaVideo({ uri, style, label }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      console.log(`LOOP RESTART @ ${Date.now()}: ${label}`);
    });
    return () => sub?.remove();
  }, [player, label]);

  return (
    <View style={style} pointerEvents="none">
      <VideoView player={player} style={StyleSheet.absoluteFillObject} contentFit="cover" nativeControls={false} />
    </View>
  );
}

function MediaThumbnail({ uri, style, active = true, shouldLoad = true, label }) {
  if (!uri) return null;
  if (isVideoUrl(uri)) {
    if (!shouldLoad) return null;
    return <MediaVideo uri={uri} style={style} label={label} />;
  }
  return <Image source={{ uri }} style={style} />;
}

function BannerCarousel({ sellers, screenFocused, onPressSeller }) {
  const withImages = sellers.filter((s) => s.image_url);
  const [index, setIndex] = useState(0);
  // The slide fading OUT stays mounted here until its animation finishes —
  // fixes the glitch where the old slide's media vanished immediately on
  // index change, before its fade-out had actually completed, leaving the
  // new slide's text visible over stale/blank media underneath.
  const [fadingOutIndex, setFadingOutIndex] = useState(null);
  const [settled, setSettled] = useState(true);
  // Tracks which slide is safe to start preloading. Deliberately updated a
  // beat AFTER the crossfade finishes (in the animation's .start() callback)
  // rather than computed live from `index` — starting a brand-new video
  // decoder for the upcoming-next slide at the exact same instant a crossfade
  // animation begins caused a brief UI-thread stutter that looked like a
  // skip/jump on the currently-fading slide.
  const [preloadIndex, setPreloadIndex] = useState(withImages.length > 1 ? 1 : 0);
  const opacities = useRef([]).current;
  const timeoutRef = useRef(null);
  const mountedRef = useRef(true);

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

  // Recursive setTimeout — schedules the next tick only after the current
  // fade has genuinely finished, so it can't get permanently stuck the way
  // a flag-based setInterval guard could.
  useEffect(() => {
    mountedRef.current = true;
    console.log(`SCHEDULER EFFECT STARTED @ ${Date.now()}`);
    if (!screenFocused || withImages.length < 2) return;

    const scheduleNext = () => {
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setSettled(false);
        setIndex((current) => {
          const next = (current + 1) % withImages.length;
          console.log(`TICK @ ${Date.now()}: current=${current}(${withImages[current]?.business_name}) -> next=${next}(${withImages[next]?.business_name}) | total=${withImages.length}`);
          setFadingOutIndex(current);
          Animated.parallel([
            Animated.timing(opacities[current], { toValue: 0, duration: CROSSFADE_MS, useNativeDriver: true }),
            Animated.timing(opacities[next], { toValue: 1, duration: CROSSFADE_MS, useNativeDriver: true }),
          ]).start(() => {
            if (!mountedRef.current) return;
            setFadingOutIndex(null);
            setSettled(true);
            // Only now — after the crossfade is fully done — start preloading
            // the slide after next, so its decoder doesn't spin up while a
            // fade animation is actively running.
            setPreloadIndex((next + 1) % withImages.length);
            console.log(`PRELOAD SET @ ${Date.now()}: preloadIndex=${(next + 1) % withImages.length}(${withImages[(next + 1) % withImages.length]?.business_name})`);
            scheduleNext();
          });
          return next;
        });
      }, CAROUSEL_INTERVAL_MS);
    };

    scheduleNext();
    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutRef.current);
    };
  }, [screenFocused, withImages.length, opacities]);

  if (withImages.length === 0) return null;

  console.log(`RENDER @ ${Date.now()}: index=${index} fadingOutIndex=${fadingOutIndex} preloadIndex=${preloadIndex}`);

  return (
    <View style={{ height: CAROUSEL_HEIGHT, backgroundColor: colors.border }}>
      {withImages.map((seller, i) => {
        const shouldLoad = i === index || i === preloadIndex || i === fadingOutIndex;
        const isTappable = i === index && settled;
        return (
          <Animated.View
            key={seller.id}
            pointerEvents={isTappable ? 'auto' : 'none'}
            style={[StyleSheet.absoluteFillObject, { opacity: opacities[i] }]}
          >
            <TouchableOpacity activeOpacity={0.9} onPress={() => onPressSeller(seller.id)} style={StyleSheet.absoluteFillObject}>
              <MediaThumbnail
                uri={seller.image_url}
                style={{ width: SCREEN_WIDTH, height: CAROUSEL_HEIGHT }}
                active={i === index && screenFocused}
                shouldLoad={shouldLoad}
                label={seller.business_name}
              />
              {shouldLoad && (
                <View style={styles.carouselOverlay}>
                  <Text style={styles.carouselTitle}>{seller.business_name}</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 40 };

export default function SellerListScreen({ navigation }) {
  const { logout, user, setAppMode } = useAuth();
  const isFocused = useIsFocused();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [coords, setCoords] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [visibleIds, setVisibleIds] = useState(new Set());

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    setVisibleIds(new Set(viewableItems.map((v) => v.item.id)));
  }).current;

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
        stickyHeaderIndices={[0]}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>No sellers found nearby.</Text>}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        removeClippedSubviews={false}
        windowSize={7}
        initialNumToRender={8}
       renderItem={({ item }) => (
         <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}>
  <MediaThumbnail
    uri={item.image_url}
    style={styles.cardImage}
    active={false}
    shouldLoad={isFocused && visibleIds.has(item.id)}
  />
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