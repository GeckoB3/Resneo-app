import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CollectiveCatalogueBuilder } from '@/components/linked/CollectiveCatalogueBuilder';
import { CollectiveMembersPanel } from '@/components/linked/CollectiveMembersPanel';
import { CombinedPageAboutSection } from '@/components/linked/CombinedPageAboutSection';
import { CombinedPageAddressRow } from '@/components/linked/CombinedPageAddressRow';
import { CombinedPageConfigEditor } from '@/components/linked/CombinedPageConfigEditor';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

type TabKey = 'page' | 'services' | 'about' | 'members';

/**
 * The host's combined-page manager: Page (address, headings, photos,
 * branding), Services (offerings and provider calendars), About (the host's
 * contact details and hours the page shows) and Members. One component so the
 * Booking page screen and the collective screen under Linked venues edit the
 * same thing the same way (web `CombinedPageManagerPanel`, inline or in its
 * modal).
 */
export function CollectiveManagerPanel({
  collective,
  eligibleLinks,
  onChanged,
  onDissolved,
}: {
  collective: CollectiveView;
  eligibleLinks: AccountLinkView[];
  onChanged: () => void;
  onDissolved: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('page');
  return (
    <View style={styles.root}>
      <Segmented<TabKey>
        options={[
          { value: 'page', label: 'Page' },
          { value: 'services', label: 'Services' },
          { value: 'about', label: 'About' },
          { value: 'members', label: 'Members' },
        ]}
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
          </>
        ) : null}

        {tab === 'services' ? <CollectiveCatalogueBuilder collectiveId={collective.id} /> : null}

        {tab === 'about' ? <CombinedPageAboutSection collective={collective} /> : null}

        {tab === 'members' ? (
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
