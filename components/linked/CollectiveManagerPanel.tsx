import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CombinedPageAboutSection } from '@/components/linked/CombinedPageAboutSection';
import { CombinedPageAddressRow } from '@/components/linked/CombinedPageAddressRow';
import { CombinedPageConfigEditor } from '@/components/linked/CombinedPageConfigEditor';
import { CombinedPageNameSection } from '@/components/linked/CombinedPageNameSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

export type CollectiveManagerTab = 'page' | 'services' | 'about' | 'members';
type TabKey = 'page' | 'about';

/**
 * The host's combined-page manager: Page (the names, the address, the page's look) and About (the
 * host's contact details and hours the page shows). One component so the Booking page screen and
 * the collective screen under Linked venues edit the same thing the same way (web
 * `CombinedPageManagerPanel`, inline or in its modal).
 *
 * The services, the venues, the hosting and ending the collective are all in Manage Collective
 * (CQ-10.4), and a card at the foot of Page says so. The older model's Services and Members tabs
 * went with W14 / C1 (27 November 2026): every collective shares services.
 */
export function CollectiveManagerPanel({
  collective,
  onChanged,
  initialTab = 'page',
}: {
  collective: CollectiveView;
  /** Unused since W14 / C1 (it fed the Members tab); kept so the callers need no change. */
  eligibleLinks?: AccountLinkView[];
  onChanged: () => void;
  /** Unused since W14 / C1 (the Members tab ended the collective); kept so the callers need no change. */
  onDissolved?: () => void;
  /** The tab to open on. Members and Services, which went with W14 / C1, open on Page. */
  initialTab?: CollectiveManagerTab;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab === 'about' ? 'about' : 'page');
  return (
    <View style={styles.root}>
      <Segmented<TabKey>
        options={[
          { value: 'page', label: 'Page' },
          { value: 'about', label: 'About' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={styles.tabBody}>
        {tab === 'page' ? (
          <>
            {/* The name guests see and the collective's own name (CQ-10.10; web `PageNameSection`). */}
            {collective.isHost ? <CombinedPageNameSection key={collective.id} collective={collective} onChanged={onChanged} /> : null}
            {/* The page's address next (owner's decision 2026-09-09: the combined
                page settings must show the URL with a copy button). */}
            <Card style={styles.addressCard}>
              <CombinedPageAddressRow collective={collective} />
            </Card>
            <CombinedPageConfigEditor collective={collective} onChanged={onChanged} />
            <ManageCollectivePointerCard collectiveName={collective.name} />
          </>
        ) : null}

        {tab === 'about' ? <CombinedPageAboutSection collective={collective} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: {
    gap: spacing.md,
  },
  root: {
    gap: spacing.md,
  },
  tabBody: {
    gap: spacing.md,
  },
  addressCard: {
    gap: spacing.xs,
  },
});

/** The services, venues, hosting and ending are in Manage Collective (CQ-10.4). */
function ManageCollectivePointerCard({ collectiveName }: { collectiveName: string }) {
  const router = useRouter();
  return (
    <Card style={styles.pointer} testID="manage-collective-pointer">
      <Text variant="bodySmall" tone="secondary">
        {areaCopy('bp.manage.elsewhere', { collective: collectiveName })}
      </Text>
      <Button
        label={areaCopy('bp.manage.elsewhere.cta')}
        variant="secondary"
        fullWidth
        onPress={() => router.push('/collective-area?tab=venues' as Href)}
      />
    </Card>
  );
}
