import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
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
        <Stack.Screen name="SellerList" component={SellerListScreen} options={{ title: 'Zelo' }} />
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

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.live} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? <AuthStack /> : user.role === 'driver' ? <DriverStack /> : <CustomerStack />}
    </NavigationContainer>
  );
}
