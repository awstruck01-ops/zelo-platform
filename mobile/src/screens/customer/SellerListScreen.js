import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function SellerListScreen({ navigation }) {
  const { logout } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Austin, TX coordinates as a reasonable default customer location for browsing
  const CUSTOMER_LAT = 30.2672;
  const CUSTOMER_LNG = -97.7431;

  const load = useCallback(() => {
    api.get('/sellers', { params: { lat: CUSTOMER_LAT, lng: CUSTOMER_LNG } })
      .then((res) => setSellers(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load sellers'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby</Text>
        <TouchableOpacity onPress={() => navigation.navigate('OrderHistory')}>
          <Text style={{ color: colors.live }}>My orders</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={sellers}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.live} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 40 }}>No sellers found nearby.</Text>}
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}>
  {item.image_url && (
    <Image source={{ uri: item.image_url }} style={styles.cardImage} />
  )}
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

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={{ color: colors.textDim }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
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
