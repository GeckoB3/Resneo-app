import { Redirect, type Href } from 'expo-router';

/**
 * Commission used to be a Checkout settings screen. It is now Commission splits (2026-10-14), which
 * works with or without Checkout and also holds splits agreed with other businesses. Anything still
 * linking here (an older notification, the web's old Checkout settings link) lands there.
 */
export default function CommissionSettingsScreen() {
  return <Redirect href={'/commission-splits' as Href} />;
}
