import { createContext, useContext, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [sellerId, setSellerId] = useState(null);
  const [sellerName, setSellerName] = useState(null);
  const [items, setItems] = useState([]); // { catalog_item_id, name, price, quantity }
  const [deliveryAddress, setDeliveryAddress] = useState(null); // { label, text }
  const [deliveryLat, setDeliveryLat] = useState(null);
  const [deliveryLng, setDeliveryLng] = useState(null);

  const setDeliveryLocation = (lat, lng, address) => {
    setDeliveryLat(lat);
    setDeliveryLng(lng);
    setDeliveryAddress(address);
  };

  const addItem = (seller, item) => {
    if (sellerId && sellerId !== seller.id) {
      // starting a cart from a different seller clears the old one
      setItems([]);
    }
    setSellerId(seller.id);
    setSellerName(seller.business_name);
    setItems((prev) => {
      const existing = prev.find((i) => i.catalog_item_id === item.id);
      if (existing) {
        return prev.map((i) => (i.catalog_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { catalog_item_id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const removeItem = (catalogItemId) => {
    setItems((prev) => prev.filter((i) => i.catalog_item_id !== catalogItemId));
  };

  const clearCart = () => {
    setItems([]);
    setSellerId(null);
    setSellerName(null);
    setDeliveryLat(null);
    setDeliveryLng(null);
    setDeliveryAddress(null);
  };

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        sellerId, sellerName, items, addItem, removeItem, clearCart, subtotal,
        deliveryAddress, deliveryLat, deliveryLng, setDeliveryLocation,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
