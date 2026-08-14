import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
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
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [useCustomTip, setUseCustomTip] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const selectPresetTip = (amt) => {
    setUseCustomTip(false);
    setCustomTip('');
    setTipAmount(amt);
  };

  const selectCustomTip = () => {
    setUseCustomTip(true);
    setTipAmount(0);
    setCustomTip('');
  };

  const onCustomTipChange = (text) => {
    // Allow only digits and a single decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setCustomTip(cleaned);
    const parsed = parseFloat(cleaned);
    setTipAmount(Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0);
  };

  const placeOrder = async (acceptExtended = false) => {
    if (deliveryLat == null || deliveryLng == null) {
      setError('Set your delivery address before placing the order');
      return;
    }
    setPlacing(true);
    setError('');
    try {
      const cartItems = items.map((i) => ({ catalog_item_id: i.catalog_item_id, quantity: i.quantity }));

      // Step 1: price the cart server-side and get a PaymentIntent to pay against
      const intentRes = await api.post('/orders/payment-intent', {
        seller_id: sellerId,
        items: cartItems,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        accept_extended_distance: acceptExtended,
        tip_amount: tipAmount,
      });
      const { client_secret, payment_intent_id } = intentRes.data.data;

      // Step 2: collect payment with Stripe's hosted sheet (card entry, Apple/Google Pay, etc.)
      const initResult = await initPaymentSheet({
        merchantDisplayName: 'Zelo',
        paymentIntentClientSecret: client_secret,
      });
      if (initResult.error) {
        setError(initResult.error.message || 'Could not set up payment');
        return;
      }

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        // Canceled or declined — not a bug, just don't proceed to order creation
        if (presentResult.error.code !== 'Canceled') {
          setError(presentResult.error.message || 'Payment failed');
        }
        return;
      }

      // Step 3: payment succeeded — now actually create the order. Backend
      // re-verifies this payment_intent_id with Stripe before trusting it.
      // This is wrapped separately from steps 1-2 so a failure here (which
      // happens AFTER the customer has already been charged) gets a
      // distinct message rather than looking like a generic failed attempt.
      try {
        const res = await api.post('/orders', {
          seller_id: sellerId,
          items: cartItems,
          delivery_address: deliveryAddress,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
          payment_intent_id,
          accept_extended_distance: acceptExtended,
          tip_amount: tipAmount,
        });
        const order = res.data.data;
        clearCart();
        navigation.replace('OrderTracking', { orderId: order.id });
      } catch (orderErr) {
        setError(
          'Your payment went through, but we couldn\'t finish placing the order (' +
          (orderErr.response?.data?.error || 'unknown error') +
          '). Please contact support — don\'t place this order again without checking with them first.'
        );
      }
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

  const tipOptions = [0.10, 0.15, 0.20];

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
            navigation={navigation}
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

        <View style={styles.tipRow}>
          <Text style={{ color: colors.textDim, marginBottom: 8 }}>Add a tip</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tipOptions.map((pct) => {
              const amt = Math.round(subtotal * pct * 100) / 100;
              const selected = !useCustomTip && tipAmount === amt;
              return (
                <TouchableOpacity
                  key={pct}
                  style={[styles.tipButton, selected && styles.tipButtonSelected]}
                  onPress={() => selectPresetTip(amt)}
                >
                  <Text style={{ color: selected ? colors.liveText : colors.text }}>
                    {Math.round(pct * 100)}% ({formatUSD(amt)})
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.tipButton, !useCustomTip && tipAmount === 0 && styles.tipButtonSelected]}
              onPress={() => selectPresetTip(0)}
            >
              <Text style={{ color: !useCustomTip && tipAmount === 0 ? colors.liveText : colors.text }}>No tip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tipButton, useCustomTip && styles.tipButtonSelected]}
              onPress={selectCustomTip}
            >
              <Text style={{ color: useCustomTip ? colors.liveText : colors.text }}>Custom</Text>
            </TouchableOpacity>
          </View>

          {useCustomTip && (
            <View style={styles.customTipRow}>
              <Text style={{ color: colors.text, marginRight: 6 }}>$</Text>
              <TextInput
                value={customTip}
                onChangeText={onCustomTipChange}
                placeholder="0.00"
                placeholderTextColor={colors.textDim}
                keyboardType="decimal-pad"
                style={styles.customTipInput}
                autoFocus
              />
            </View>
          )}
        </View>

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
  tipRow: { marginBottom: 12 },
  tipButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  tipButtonSelected: { backgroundColor: colors.live, borderColor: colors.live },
  customTipRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
  },
  customTipInput: { color: colors.text, minWidth: 80, fontSize: 15, padding: 0 },
  primaryButton: { backgroundColor: colors.live, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, padding: 12 },
});
