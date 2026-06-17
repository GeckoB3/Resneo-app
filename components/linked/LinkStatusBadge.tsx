import { Badge } from '@/components/ui/Badge';
import { linkStatusDisplay } from '@/lib/linked/linkStatus';
import type { LinkStatus } from '@/types/linked-venues';

/** Status pill for a linked-venue link, matching the web colour semantics. */
export function LinkStatusBadge({ status }: { status: LinkStatus }) {
  const { label, tone } = linkStatusDisplay(status);
  return <Badge label={label} tone={tone} />;
}
