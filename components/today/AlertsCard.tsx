import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { DashboardAlert } from '@/types/dashboard';

type AlertsCardProps = {
  alerts: DashboardAlert[];
};

export function AlertsCard({ alerts }: AlertsCardProps) {
  const { colors } = useTheme();

  if (alerts.length === 0) return null;

  return (
    <View style={styles.container}>
      {alerts.map((alert, i) => {
        const isWarning = alert.type === 'warning';
        const borderColor = isWarning ? colors.warning : colors.info;
        const bgColor = isWarning ? colors.warningSurface : colors.infoSurface;
        const textColor = isWarning ? colors.warning : colors.info;

        return (
          <View
            key={i}
            style={[styles.alert, { borderColor, backgroundColor: bgColor }]}
          >
            <SymbolView
              name={
                isWarning
                  ? { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }
                  : { ios: 'info.circle.fill', android: 'info', web: 'info' }
              }
              size={16}
              tintColor={borderColor}
            />
            <Text variant="bodySmall" style={{ color: textColor, flex: 1 }}>
              {alert.message}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.card,
    borderWidth: 1,
  },
});
