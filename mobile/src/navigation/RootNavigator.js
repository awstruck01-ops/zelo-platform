import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import SellerListScreen from '../screens/customer/SellerListScreen';
import SellerDetailScreen from '../screens/customer/SellerDetailScreen';
import CartScreen from '../screens/customer/CartScreen';
import OrderTrackingScreen from '../screens/customer/OrderTrackingScreen';
import OrderHistoryScreen from '../screens/customer/OrderHistoryScreen';
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import DriverOrderScreen from '../screens/driver/DriverOrderScreen';
const Stack = createNativeStackNavigator();
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.live,
  },
};
const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerShadowVisible: false,
};
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
function CustomerStack() {
  return (
    <CartProvider>
      <Stack.Navigator screenOptions={screenOptions}>
       <Stack.Screen
  name="SellerList"
  component={SellerListScreen}
  options={{
    headerTitle: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Zelo</Text>
      </View>
    ),
  }}
/>
        <Stack.Screen name="SellerDetail" component={SellerDetailScreen} options={{ title: 'Menu' }} />
        <Stack.Screen name="Cart" component={CartScreen} options={{ title: 'Your order' }} />
        <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} options={{ title: 'Track order', headerBackVisible: false }} />
        <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} options={{ title: 'My orders' }} />
      </Stack.Navigator>
    </CartProvider>
  );
}
function DriverStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'Zelo Driver', headerShown: false }} />
      <Stack.Screen name="DriverOrder" component={DriverOrderScreen} options={{ title: 'Active delivery' }} />
    </Stack.Navigator>
  );
}

// Shown once per session to driver accounts, since a driver can also shop as
// a customer on Zelo (the backend doesn't restrict order placement by role).
function ModeChooser() {
  const { setAppMode, logout } = useAuth();
  return (
    <View style={chooserStyles.container}>
      <Image source={require('../../assets/icon.png')} style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 20 }} />
      <Text style={chooserStyles.title}>What are you doing today?</Text>
      <TouchableOpacity style={chooserStyles.optionButton} onPress={() => setAppMode('driving')}>
        <Text style={chooserStyles.optionButtonText}>Driving</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[chooserStyles.optionButton, chooserStyles.optionButtonSecondary]} onPress={() => setAppMode('shopping')}>
        <Text style={[chooserStyles.optionButtonText, { color: colors.live }]}>Shopping</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={logout} style={{ marginTop: 30 }}>
        <Text style={{ color: colors.textDim }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
const chooserStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 28 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 28 },
  optionButton: { backgroundColor: colors.live, borderRadius: 10, paddingVertical: 16, paddingHorizontal: 48, marginBottom: 12, width: '100%', alignItems: 'center' },
  optionButtonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.live },
  optionButtonText: { color: colors.liveText, fontWeight: '700', fontSize: 16 },
});

export default function RootNavigator() {
  const { user, profile, loading, appMode } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.live} size="large" />
      </View>
    );
  }

  let content;
  if (!user) {
    content = <AuthStack />;
  } else if (user.role === 'driver' && !appMode) {
    content = <ModeChooser />;
  } else if (user.role === 'driver' && appMode === 'driving') {
    content = <DriverStack />;
  } else {
    // covers: non-driver accounts, and drivers who chose 'shopping'
    content = <CustomerStack />;
  }

  return <NavigationContainer theme={navTheme}>{content}</NavigationContainer>;
}
