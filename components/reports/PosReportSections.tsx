/**
 * Reports' POS tabs in the app (POS plan P7-4, UX spec §11, §20.11, §22.2), each in its own file
 * under `components/reports/pos` and `components/reports/vouchers`, at parity with the web's
 * ReportsView tabs: Takings (with cash-ups and, for admins, payouts and fees), Sales (with the
 * product cards), Vouchers and Commission. Shown only where `GET /api/venue/reports/pos-access`
 * says the venue has them and this login may read them.
 */
export { CommissionSection } from '@/components/reports/pos/CommissionSection';
export { SalesSection } from '@/components/reports/pos/SalesSection';
export { TakingsSection } from '@/components/reports/pos/TakingsSection';
export { VouchersSection } from '@/components/reports/vouchers/VouchersSection';
