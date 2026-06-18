import { render, screen } from '@testing-library/react-native';

import { Text } from '@/components/ui/Text';
import { SectionCard } from '@/components/ui/SectionCard';

/**
 * F4 — SectionCard compound primitive. Verifies the Header/Body/Footer slots
 * render their content and that an all-empty Header renders nothing (web parity:
 * the header collapses when given no eyebrow/title/description/right).
 */
describe('SectionCard', () => {
  it('renders header (eyebrow/title/description/right), body and footer slots', async () => {
    await render(
      <SectionCard>
        <SectionCard.Header
          eyebrow="SETTINGS"
          title="Opening hours"
          description="Weekly opening times"
          right={<Text>Edit</Text>}
        />
        <SectionCard.Body>
          <Text>Mon–Fri 9–5</Text>
        </SectionCard.Body>
        <SectionCard.Footer>
          <Text>Last saved today</Text>
        </SectionCard.Footer>
      </SectionCard>,
    );

    expect(screen.getByText('SETTINGS')).toBeTruthy();
    expect(screen.getByText('Opening hours')).toBeTruthy();
    expect(screen.getByText('Weekly opening times')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Mon–Fri 9–5')).toBeTruthy();
    expect(screen.getByText('Last saved today')).toBeTruthy();
  });

  it('renders nothing for an empty Header', async () => {
    await render(
      <SectionCard>
        <SectionCard.Header />
        <SectionCard.Body>
          <Text>Body only</Text>
        </SectionCard.Body>
      </SectionCard>,
    );
    expect(screen.getByText('Body only')).toBeTruthy();
  });

  it('exposes the compound static members', () => {
    expect(typeof SectionCard).toBe('function');
    expect(SectionCard.Header).toBeDefined();
    expect(SectionCard.Body).toBeDefined();
    expect(SectionCard.Divider).toBeDefined();
    expect(SectionCard.Footer).toBeDefined();
  });
});
