import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

const STAGES = [
  'placed', 'payment_confirmed', 'preparing', 'driver_searching',
  'driver_assigned', 'picked_up', 'delivered', 'completed',
];

const STAGE_LABELS = {
  placed: 'Placed', payment_confirmed: 'Payment confirmed', preparing: 'Preparing',
  driver_searching: 'Finding a driver', driver_assigned: 'Driver on the way to pickup',
  picked_up: 'Picked up', delivered: 'Delivered', completed: 'Completed',
};

export default function OrderRail({ status }) {
  if (status === 'cancelled' || status === 'disputed') {
    return (
      <View style={[styles.badge, { backgroundColor: colors.dangerDim }]}>
        <Text style={{ color: colors.danger, fontWeight: '600', textTransform: 'capitalize' }}>{status}</Text>
      </View>
    );
  }

  const currentIndex = status === 'completed' ? STAGES.length : STAGES.indexOf(status);

  return (
    <View>
      <View style={styles.rail}>
        {STAGES.map((stage, i) => (
          <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : 0 }}>
            <View
              style={[
                styles.dot,
                i < currentIndex && { backgroundColor: colors.live },
                i === currentIndex && { backgroundColor: colors.pending },
              ]}
            />
            {i < STAGES.length - 1 && (
              <View style={[styles.line, i < currentIndex && { backgroundColor: colors.live }]} />
            )}
          </View>
        ))}
      </View>
      <Text style={styles.currentLabel}>{STAGE_LABELS[status] || status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  line: { flex: 1, height: 2, backgroundColor: colors.border },
  currentLabel: { color: colors.text, marginTop: 10, fontWeight: '600' },
  badge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 100, alignSelf: 'flex-start' },
});
