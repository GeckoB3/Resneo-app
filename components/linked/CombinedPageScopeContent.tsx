import { useMemo } from 'react';

import { CollectiveManagerPanel } from '@/components/linked/CollectiveManagerPanel';
import { CombinedPageMemberSummary } from '@/components/linked/CombinedPageMemberSummary';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { ApiError } from '@/lib/api/client';
import { fullMutualLinks } from '@/lib/linked/grants';
import { useCollectives } from '@/lib/queries/useCollectives';
import { useLinkedVenues } from '@/lib/queries/useLinkedVenues';

/**
 * The combined scope of the Booking page screen (web `CombinedPageScopeContent`):
 * the host's manager inline, or the member's read-only summary. Loads the one
 * collective and the invitable links itself (web `useCollectiveManagement`),
 * so the screen only has to know which collective it is.
 */
export function CombinedPageScopeContent({
  collectiveId,
  onOpenLinkedVenues,
  onDissolved,
}: {
  collectiveId: string;
  onOpenLinkedVenues: () => void;
  /** The host dissolved the collective from the Members tab. */
  onDissolved: () => void;
}) {
  const query = useCollectives();
  const linksQuery = useLinkedVenues();
  const collective = useMemo(
    () => (query.data?.collectives ?? []).find((c) => c.id === collectiveId) ?? null,
    [query.data?.collectives, collectiveId],
  );
  const eligibleLinks = useMemo(
    () => fullMutualLinks(linksQuery.data?.links ?? []),
    [linksQuery.data?.links],
  );

  if (query.isLoading) return <DetailSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : 'Could not load the combined page.'}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!collective) {
    return <ErrorState message="This collective could not be found. It may have been dissolved." />;
  }
  if (!collective.isHost) {
    return <CombinedPageMemberSummary collective={collective} onOpenLinkedVenues={onOpenLinkedVenues} />;
  }
  return (
    <CollectiveManagerPanel
      collective={collective}
      eligibleLinks={eligibleLinks}
      onChanged={() => void query.refetch()}
      onDissolved={onDissolved}
    />
  );
}
