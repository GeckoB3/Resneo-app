import { StaffRequired } from '@/components/auth/StaffRequired';

/** Route wrapper — the gate renders <StaffRequired/> inline, but the route is
 * kept so it can also be reached directly. */
export default function StaffRequiredScreen() {
  return <StaffRequired />;
}
