import { render, screen } from '@testing-library/react-native';

import { CompliancePill, type ComplianceTone } from '@/components/ui/Badge';
import { lightColors } from '@/theme/index';

/**
 * F4 — CompliancePill: the 6 compliance states mirrored from the web's
 * `compliance-*` Pill variants (current/expiring/expired/missing/pending/voided).
 * Asserts each state's default label and that the label text colour resolves to
 * the matching theme token (so the state→colour mapping is wired through).
 */

// Light theme is the default under jest (useColorScheme → null/'light').
const EXPECTED: Record<ComplianceTone, { label: string; fg: string }> = {
  current: { label: 'Current', fg: lightColors.success },
  expiring: { label: 'Expiring soon', fg: lightColors.warning },
  expired: { label: 'Expired', fg: lightColors.danger },
  missing: { label: 'Missing', fg: lightColors.textSecondary },
  pending: { label: 'Pending', fg: lightColors.info },
  voided: { label: 'Voided', fg: lightColors.textMuted },
};

function flattenColor(node: { props: Record<string, unknown> }): string | undefined {
  const style = node.props.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
  return (flat as { color?: string })?.color;
}

describe('CompliancePill', () => {
  (Object.keys(EXPECTED) as ComplianceTone[]).forEach((tone) => {
    it(`renders the "${tone}" state with its label and themed colour`, async () => {
      const { unmount } = await render(<CompliancePill tone={tone} />);
      const label = screen.getByText(EXPECTED[tone].label);
      expect(label).toBeTruthy();
      expect(flattenColor(label)).toBe(EXPECTED[tone].fg);
      unmount();
    });
  });

  it('honours a custom label override', async () => {
    await render(<CompliancePill tone="current" label="Compliant" />);
    expect(screen.getByText('Compliant')).toBeTruthy();
    expect(screen.queryByText('Current')).toBeNull();
  });
});
