import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { CollectiveCatalogueBuilder } from '@/components/linked/CollectiveCatalogueBuilder';
import { CollectiveMembersPanel } from '@/components/linked/CollectiveMembersPanel';
import { CombinedPageAboutSection } from '@/components/linked/CombinedPageAboutSection';
import { CombinedPageAddressRow } from '@/components/linked/CombinedPageAddressRow';
import { CombinedPageConfigEditor } from '@/components/linked/CombinedPageConfigEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import {
  COLLECTIVE_AREA_WEB_PATH,
  SHARED_SERVICES_POINTER,
  isSharedServices,
} from '@/lib/linked/collective-membership-copy';
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
  const [tab, setTab] = useState<TabKey>(initialTab);
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

        {tab === 'services' ? (
          isSharedServices(collective) ? (
            <SharedServicesPointerCard />
          ) : (
            <CollectiveCatalogueBuilder collectiveId={collective.id} />
          )
        ) : null}

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

/** Shared services: where the page's services and calendars are managed, with a way to each. */
function SharedServicesPointerCard() {
  const router = useRouter();
  const openArea = () => {
    const url = `${getWebUrl() || 'https://app.resneo.com'}${COLLECTIVE_AREA_WEB_PATH}`;
    void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
  };
  return (
    <Card style={styles.pointer}>
      <Text variant="bodySmall" tone="secondary">
        {SHARED_SERVICES_POINTER}
      </Text>
      <Button label="Open Services" variant="primary" fullWidth onPress={() => router.push('/manage/services' as Href)} />
      <Button label="Open the Collective area on the web" variant="secondary" fullWidth onPress={openArea} />
    </Card>
  );
}
