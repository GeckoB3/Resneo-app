import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CollectiveCatalogueBuilder } from '@/components/linked/CollectiveCatalogueBuilder';
import { CollectiveMembersPanel } from '@/components/linked/CollectiveMembersPanel';
import { CombinedPageAboutSection } from '@/components/linked/CombinedPageAboutSection';
import { CombinedPageAddressRow } from '@/components/linked/CombinedPageAddressRow';
import { CombinedPageConfigEditor } from '@/components/linked/CombinedPageConfigEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { isSharedServices } from '@/lib/linked/collective-membership-copy';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

export type CollectiveManagerTab = 'page' | 'services' | 'about' | 'members';
type TabKey = CollectiveManagerTab;

/**
 * The host's combined-page manager: Page (address, headings, photos,
 * branding), Services (offerings and provider calendars), About (the host's
 * contact details and hours the page shows) and Members. One component so the
 * Booking page screen and the collective screen under Linked venues edit the
 * same thing the same way (web `CombinedPageManagerPanel`, inline or in its
 * modal).
 *
 * On shared services (CQ-10.4, web `CombinedPageManager`, 2026-10-29) it shows Page and About only:
 * the services, the venues, the hosting and ending the collective are all in Manage Collective, and a
 * card at the foot of Page says so. Its Members tab sent Make host, which shared services refuse, and
 * ended the collective without the typed name Manage Collective asks for.
 */
export function CollectiveManagerPanel({
  collective,
  eligibleLinks,
  onChanged,
  onDissolved,
  initialTab = 'page',
}: {
  collective: CollectiveView;
  eligibleLinks: AccountLinkView[];
  onChanged: () => void;
  onDissolved: () => void;
  /** The tab to open on, e.g. Members from the Collective area's "Invite a venue". */
  initialTab?: CollectiveManagerTab;
}) {
  const shared = isSharedServices(collective);
  const [tab, setTab] = useState<TabKey>(
    shared && (initialTab === 'members' || initialTab === 'services') ? 'page' : initialTab,
  );
  return (
    <View style={styles.root}>
      <Segmented<TabKey>
        options={
          shared
            ? [
                { value: 'page', label: 'Page' },
                { value: 'about', label: 'About' },
              ]
            : [
                { value: 'page', label: 'Page' },
                { value: 'services', label: 'Services' },
                { value: 'about', label: 'About' },
                { value: 'members', label: 'Members' },
              ]
        }
        value={tab}
        onChange={setTab}
      />

      <View style={styles.tabBody}>
        {tab === 'page' ? (
          <>
            {/* The page's address first (owner's decision 2026-09-09: the combined
                page settings must show the URL with a copy button). */}
            <Card style={styles.addressCard}>
              <CombinedPageAddressRow collective={collective} />
            </Card>
            <CombinedPageConfigEditor collective={collective} onChanged={onChanged} />
            {shared ? <ManageCollectivePointerCard collectiveName={collective.name} /> : null}
          </>
        ) : null}

        {tab === 'services' && !shared ? <CollectiveCatalogueBuilder collectiveId={collective.id} /> : null}

        {tab === 'about' ? <CombinedPageAboutSection collective={collective} /> : null}

        {tab === 'members' && !shared ? (
          <CollectiveMembersPanel
            collective={collective}
            eligibleLinks={eligibleLinks}
            onDissolved={onDissolved}
          />
        ) : null}
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

/** Shared services: the services, venues, hosting and ending are in Manage Collective (CQ-10.4). */
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
