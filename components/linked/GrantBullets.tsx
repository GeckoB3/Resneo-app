import { View, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { describeGrant } from '@/lib/linked/grants';
import { spacing } from '@/theme/index';
import type { LinkGrant } from '@/types/linked-venues';

/** A heading + the plain-English bullet list of what a grant permits. */
export function GrantBullets({ heading, grant }: { heading: string; grant: LinkGrant }) {
  const bullets = describeGrant(grant);
  return (
    <View style={styles.block}>
      <Text variant="label" tone="secondary">
        {heading}
      </Text>
      <View style={styles.bullets}>
        {bullets.map((bullet, i) => (
          <Text key={i} variant="bodySmall">
            {`•  ${bullet}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  bullets: {
    gap: 2,
  },
});
