import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import { useCart } from '../../context/CartContext';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SellerDetailScreen({ route, navigation }) {
  const { sellerId } = route.params;
  const { addItem, items, sellerId: cartSellerId } = useCart();
  const [seller, setSeller] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/sellers/${sellerId}`)
      .then((res) => setSeller(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load storefront'))
      .finally(() => setLoading(false));
  }, [sellerId]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        items.length > 0 && cartSellerId === sellerId ? (
          <TouchableOpacity onPress={() => navigation.navigate('Cart')} style={{ marginRight: 16 }}>
            <Text style={{ color: colors.live, fontWeight: '700' }}>Cart ({items.length})</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [items, cartSellerId, sellerId, navigation]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.live} />;
  if (error) return <View style={styles.container}><Text style={styles.error}>{error}</Text></View>;

  return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        <Text style={styles.title}>{seller.business_name}</Text>
        <Text style={styles.sub}>{seller.address}</Text>
      </View>
      <FlatList
        data={seller.items || []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center' }}>No items listed yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
              <Text style={styles.itemPrice}>{formatUSD(item.price)}</Text>
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => addItem(seller, item)}>
              <Text style={{ color: colors.liveText, fontWeight: '700' }}>Add</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  itemCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemDesc: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  itemPrice: { color: colors.live, fontSize: 14, fontWeight: '600', marginTop: 6, fontFamily: 'monospace' },
  addButton: { backgroundColor: colors.live, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  error: { color: colors.danger, padding: 16 },
});
