import { type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

export interface ServiceBookingRulesSectionProps {
  bookingRulesSummary: string;
  advanceDays: string;
  setAdvanceDays: Dispatch<SetStateAction<string>>;
  noticeHours: string;
  setNoticeHours: Dispatch<SetStateAction<string>>;
  cancelHours: string;
  setCancelHours: Dispatch<SetStateAction<string>>;
  sameDay: boolean;
  setSameDay: Dispatch<SetStateAction<boolean>>;
}

/**
 * The service form's Client booking rules card: book ahead, notice,
 * cancellation notice and same-day bookings. Moved out of the Services screen
 * unchanged (codebase standards P5.2).
 */
export function ServiceBookingRulesSection({
  bookingRulesSummary,
  advanceDays,
  setAdvanceDays,
  noticeHours,
  setNoticeHours,
  cancelHours,
  setCancelHours,
  sameDay,
  setSameDay,
}: ServiceBookingRulesSectionProps) {
  return (
    <CollapsibleCard title="Client booking rules" summary={bookingRulesSummary}>
      <View style={styles.sectionStack}>
        <View style={styles.moneyRow}>
          <View style={styles.moneyField}>
            <Input
              label="Book ahead (days)"
              value={advanceDays}
              onChangeText={setAdvanceDays}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.moneyField}>
            <Input
              label="Min notice (hours)"
              value={noticeHours}
              onChangeText={setNoticeHours}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <Input
          label="Cancellation notice (hours)"
          helper="Refund cut-off for deposits and online payments."
          value={cancelHours}
          onChangeText={setCancelHours}
          keyboardType="number-pad"
        />
        <View style={styles.switchRow}>
          <Text variant="bodyMedium">Allow same-day bookings</Text>
          <Switch value={sameDay} onValueChange={setSameDay} />
        </View>
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  // Vertical rhythm for inputs/rows inside a CollapsibleCard body (the card body
  // is a single View, so the sheet-level `gap` doesn't reach these children).
  sectionStack: {
    gap: spacing.md,
  },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyField: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
});
