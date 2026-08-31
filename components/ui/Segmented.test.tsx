/**
 * How a segmented control treats a label too long for its segment.
 *
 * Segments are `flex: 1`, so each gets an equal share of the track however long
 * its word is. On the customer Passes screen that is four segments, about 82pt
 * each on a phone, and "Memberships" does not fit: it wrapped to two lines and
 * made the whole control twice as tall.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { Segmented } from '@/components/ui/Segmented';

const PASSES = [
  { value: 'credits', label: 'Credits' },
  { value: 'memberships', label: 'Memberships' },
  { value: 'courses', label: 'Courses' },
  { value: 'recurring', label: 'Weekly' },
] as const;

/** The rendered label node for one option. */
async function labelFor(label: string, wrapLabels = false) {
  const { getByText } = await render(
    <Segmented
      options={[...PASSES]}
      value="credits"
      onChange={() => {}}
      wrapLabels={wrapLabels}
    />,
  );
  return getByText(label);
}

describe('a label longer than its segment', () => {
  it('stays on ONE line', async () => {
    // The reported problem: "Memberships" over two lines, doubling the height
    // of the control it sits in.
    expect((await labelFor('Memberships')).props.numberOfLines).toBe(1);
  });

  it('shrinks to fit rather than truncating', async () => {
    /*
      The other way to keep one line is an ellipsis, and a tab reading
      "Membership…" is worse than one a point smaller: it stops naming the
      thing it navigates to.
    */
    const node = await labelFor('Memberships');
    expect(node.props.adjustsFontSizeToFit).toBe(true);
  });

  it('has a floor, so it shrinks a little and not to nothing', async () => {
    // Without a minimum, a long enough label becomes unreadable instead of
    // overflowing, which trades a visible bug for a quieter one.
    const node = await labelFor('Memberships');
    expect(node.props.minimumFontScale).toBeGreaterThanOrEqual(0.8);
  });

  it('applies the same treatment to a label that already fits', async () => {
    // Uniform props across segments: only the label that overflows actually
    // shrinks, and that is the platform's decision, not a per-label branch here.
    const node = await labelFor('Credits');
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe('wrapLabels, for genuinely open-ended text', () => {
  it('still allows two lines when asked', async () => {
    // Venue names have no fixed length, so wrapping remains right there. Saved
    // cards and the grant editor rely on it.
    expect((await labelFor('Memberships', true)).props.numberOfLines).toBe(2);
  });

  it('does NOT shrink when wrapping, because the two fight each other', async () => {
    /*
      Shrink-to-fit measures against a bounded box. Combined with wrapping it
      makes the result depend on which constraint the platform applies first,
      which is how one control ends up looking different on the two platforms.
    */
    expect((await labelFor('Memberships', true)).props.adjustsFontSizeToFit).toBe(false);
  });
});
