import { Notice, money, usePosT } from '@/components/pos/parts';
import { useVisitDetail } from '@/lib/queries/useVisitPartnerLines';

/**
 * On a sale for a visit across businesses (web `PosVisitOtherPartsNote`, 2026-11-05): each other
 * business's services, what they come to, and that the other business takes that payment. Every
 * business checks out its own part on its own account (POS D28), so the front desk must not collect
 * it here, but can tell the client it is still to pay.
 */
export function PosVisitOtherPartsNote({ linkedVisitId }: { linkedVisitId: string | null }) {
  const t = usePosT();
  const detail = useVisitDetail(linkedVisitId);
  if (!detail || detail.legacy) return null;
  const notes = detail.parts
    .filter((part) => !part.own)
    .map((part) => {
      const services = detail.lines
        .filter((l) => l.venue_id === part.venue_id && l.status !== 'Cancelled')
        .map((l) => `${l.service_name}${l.person_name ? ` with ${l.person_name}` : ''}`);
      if (services.length === 0) return null;
      const list =
        services.length === 1 ? services[0]! : `${services.slice(0, -1).join(', ')} and ${services[services.length - 1]}`;
      const settled = part.outstanding_pence === 0 && (part.total_pence ?? 0) > 0;
      return {
        key: part.venue_id,
        text: settled
          ? t('visit.otherPart.paid', { services: list, business: part.venue_name })
          : t('visit.otherPart', {
              services: list,
              business: part.venue_name,
              amount: part.total_pence != null ? money(part.total_pence) : '',
            }).replace(' ()', ''),
      };
    })
    .filter((n): n is { key: string; text: string } => n !== null);
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((n) => (
        <Notice key={n.key}>{n.text}</Notice>
      ))}
    </>
  );
}
