import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useStaffMe } from '@/lib/queries/useStaffMe';
import {
  clientContactHidden,
  diaryScopeOf,
  FULL_VIEWER_ACCESS,
  viewerAccessOf,
  type DiaryScope,
  type ViewerAccess,
} from '@/lib/roles/roles';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * What the signed-in person may see and do across the app (web roles plan §5.6, §5.11; the web's
 * `ViewerAccessProvider`). A screen reads it to show "Hidden" in place of a client's phone or email,
 * leave out call, text, email and copy actions, and hide the buttons that download client lists.
 *
 * The server enforces every one of these; this only keeps the screens honest. Outside the provider
 * (tests, the customer app) everything is allowed, which is today's behaviour.
 */
const ViewerAccessContext = createContext<ViewerAccess>(FULL_VIEWER_ACCESS);

export function ViewerAccessProvider({ value, children }: { value: ViewerAccess; children: ReactNode }) {
  return <ViewerAccessContext.Provider value={value}>{children}</ViewerAccessContext.Provider>;
}

/**
 * The provider for the staff app: the signed-in person's switches from `GET /api/venue/staff/me`,
 * else from `GET /api/venue`, else everything until either answers.
 */
export function LiveViewerAccessProvider({ children }: { children: ReactNode }) {
  const staffMe = useStaffMe();
  const { venue } = useVenueContext();
  const me = staffMe.data?.staff ?? null;
  const value = useMemo(() => viewerAccessOf(me, venue), [me, venue]);
  return <ViewerAccessProvider value={value}>{children}</ViewerAccessProvider>;
}

export function useViewerAccess(): ViewerAccess {
  return useContext(ViewerAccessContext);
}

/**
 * Whether a client's phone and email read "Hidden" here: the viewer's switch is off, or the response
 * that carried them says `contacts_hidden: true`.
 */
export function useClientContactHidden(contactsHidden?: boolean | null): boolean {
  return clientContactHidden(useViewerAccess(), contactsHidden);
}

/**
 * Other people's diaries for the signed-in person (roles plan §5.11, §7.3): which calendars they may
 * book and change on, and a check for a booking row or a calendar id. For everyone on "Can book and
 * change" (owners, admins, and the default) it is the open scope, which allows everything and costs
 * nothing, so their screens are exactly as before.
 */
export function useDiaryScope(): DiaryScope {
  const access = useViewerAccess();
  return useMemo(() => diaryScopeOf(access), [access]);
}
