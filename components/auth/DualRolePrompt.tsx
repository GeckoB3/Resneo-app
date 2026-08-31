import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  hasBeenAskedDualRole,
  loadDualRoleAsked,
  markDualRoleAsked,
  subscribeDualRoleAsked,
  switchAppMode,
} from '@/lib/mode/app-mode-store';
import { useIsAlsoCustomer } from '@/lib/queries/useIsAlsoCustomer';

/**
 * "You also have bookings of your own. Where would you like to go?"
 *
 * The web asks this at login, on `/auth/choose-destination`, when somebody is
 * both a venue's staff and somebody else's customer and has expressed no
 * preference. It asks BEFORE routing, because one URL serves both surfaces and
 * the server has to pick a redirect.
 *
 * This asks AFTER landing instead, and the difference is deliberate. Deciding
 * before routing would mean a third asynchronous input to the guard sequence,
 * which is exactly what produced the bug where a customer's first frame said
 * "staff" and mounted the venue navigator. Here the worst case of a slow or
 * failed answer is that the prompt does not appear.
 *
 * The cost is honest: somebody who wanted their account sees the venue side for
 * a moment first. It is paid once, because the answer is remembered, and both
 * sides carry a permanent switcher for anybody who changes their mind.
 *
 * Renders NOTHING unless all of: the person is staff, they are also a customer
 * somewhere, and they have never been asked. Mounted high in the staff stack so
 * it does not depend on which tab they landed on.
 */
export function DualRolePrompt() {
  const { isAlsoCustomer } = useIsAlsoCustomer();
  const asked = useSyncExternalStore(
    subscribeDualRoleAsked,
    hasBeenAskedDualRole,
    hasBeenAskedDualRole,
  );
  const [storeRead, setStoreRead] = useState(false);

  useEffect(() => {
    let active = true;
    void loadDualRoleAsked().then(() => {
      if (active) setStoreRead(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Never before the disk read lands, or the sheet flashes at somebody who
  // answered it on a previous launch.
  const visible = storeRead && !asked && isAlsoCustomer;

  return (
    <Sheet visible={visible} onClose={() => markDualRoleAsked()}>
      <View style={styles.body}>
        <Text variant="subheading">Where would you like to go?</Text>
        <Text variant="bodySmall" tone="secondary">
          You run a venue on ResNeo, and you have bookings of your own as a customer. You can
          switch between the two at any time.
        </Text>

        <Button
          label="My venue"
          onPress={() => {
            /*
              Recorded as a preference, not just a dismissal. Somebody who
              picked this side meant it, and the mode store is what stops the
              question returning and what the switchers read.
            */
            switchAppMode('staff');
            markDualRoleAsked();
          }}
        />
        <Button
          label="My own bookings"
          variant="secondary"
          onPress={() => {
            switchAppMode('customer');
            markDualRoleAsked();
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, padding: 16 },
});
