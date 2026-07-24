import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { colors } from '../../theme';
import api from '../../api/client';
import { useCart } from '../../context/CartContext';
import AddressPicker from '../../components/AddressPicker';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// React Native's Alert.alert doesn't render an interactive multi-button dialog on web,
// so this falls back to the browser's native confirm() there instead.
function confirmExtendedDistance(message, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert('This seller is far from you', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Pay extra & continue', onPress: onConfirm },
  ]);
}

export default function CartScreen({ navigation }) {
  const {
    sellerId, sellerName, items, removeItem, subtotal, clearCart,
    deliveryAddress, deliveryLat, deliveryLng, setDeliveryLocation,
  } = useCart();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const placeOrder = async (acceptExtended = false) => {
    if (deliveryLat == null || deliveryLng == null) {
      setError('Set your delivery address before placing the order');
      return;
    }
    setPlacing(true);
    setError('');
    try {
      const res = await api.post('/orders', {
        seller_id: sellerId,
        items: items.map((i) => ({ catalog_item_id: i.catalog_item_id, quantity: i.quantity })),
        delivery_address: deliveryAddress,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        payment_method: 'card',
        processor_ref: `MOBILE-${Date.now()}`,
        accept_extended_distance: acceptExtended,
      });
      const order = res.data.data;
      clearCart();
      navigation.replace('OrderTracking', { orderId: order.id });
    } catch (err) {
      if (err.response?.status === 422) {
        const { message, distance_mi } = err.response.data;
        confirmExtendedDistance(`${message} (${distance_mi} mi away)`, () => placeOrder(true));
      } else {
        setError(err.response?.data?.error || 'Failed to place order');
      }
    } finally {
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 60 }}>Your cart is empty.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{sellerName}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(i) => i.catalog_item_id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <AddressPicker
            deliveryLat={deliveryLat}
            deliveryLng={deliveryLng}
            deliveryAddress={deliveryAddress}
            onLocationSet={setDeliveryLocation}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Text style={{ color: colors.text, flex: 1 }}>{item.quantity}× {item.name}</Text>
            <Text style={{ color: colors.text, fontFamily: 'monospace' }}>{formatUSD(item.price * item.quantity)}</Text>
            <TouchableOpacity onPress={() => removeItem(item.catalog_item_id)}>
              <Text style={{ color: colors.danger, marginLeft: 12 }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.subtotalRow}>
          <Text style={{ color: colors.textDim }}>Subtotal</Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{formatUSD(subtotal)}</Text>
        </View>
        <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: 12 }}>
          Delivery fee and sales tax are calculated automatically at checkout.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, deliveryLat == null && { opacity: 0.5 }]}
          onPress={() => placeOrder(false)}
          disabled={placing || deliveryLat == null}
        >
          {placing ? <ActivityIndicator color={colors.liveText} /> : <Text style={styles.primaryButtonText}>Place order</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, padding: 16, paddingBottom: 0 },
  itemRow: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, flexDirection: 'row', alignItems: 'center',
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, padding: 12 },
});
