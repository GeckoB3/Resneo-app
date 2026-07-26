import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { IconButton } from '@/components/ui/IconButton';
import { lightColors } from '@/theme/index';

/**
 * The `active` state marks a toolbar control that is currently doing something
 * (compact rows on, a filter applied, a non-default sort). It used to be a pale
 * wash that staff could not tell apart from the resting bordered button, so
 * these pin that active and resting differ visibly and that active is a solid
 * brand fill rather than the subtle tint.
 */
function backgroundOf(label: string): string | undefined {
  const flat = StyleSheet.flatten(screen.getByLabelText(label).props.style) as {
    backgroundColor?: string;
  };
  return flat?.backgroundColor;
}

describe('IconButton active state', () => {
  it('fills with the solid brand colour when active', async () => {
    await render(
      <IconButton
        icon={{ ios: 'rectangle.compress.vertical', android: 'compress', web: 'compress' }}
        accessibilityLabel="Compact"
        variant="bordered"
        active
        onPress={jest.fn()}
      />,
    );
    expect(backgroundOf('Compact')).toBe(lightColors.brand);
  });

  it('is visibly different from the resting bordered button', async () => {
    const { rerender } = await render(
      <IconButton
        icon={{ ios: 'rectangle.compress.vertical', android: 'compress', web: 'compress' }}
        accessibilityLabel="Compact"
        variant="bordered"
        onPress={jest.fn()}
      />,
    );
    const resting = backgroundOf('Compact');

    await rerender(
      <IconButton
        icon={{ ios: 'rectangle.compress.vertical', android: 'compress', web: 'compress' }}
        accessibilityLabel="Compact"
        variant="bordered"
        active
        onPress={jest.fn()}
      />,
    );
    expect(backgroundOf('Compact')).not.toBe(resting);
  });

  it('does not use the subtle tint for active any more', async () => {
    // brandSubtle against surface was the indistinguishable pairing.
    await render(
      <IconButton
        icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
        accessibilityLabel="Filter"
        variant="bordered"
        active
        onPress={jest.fn()}
      />,
    );
    expect(backgroundOf('Filter')).not.toBe(lightColors.brandSubtle);
  });

  it('reports the state to assistive tech', async () => {
    await render(
      <IconButton
        icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
        accessibilityLabel="Filter"
        active
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Filter').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('leaves the tinted variant as a soft wash (emphasis, not state)', async () => {
    await render(
      <IconButton
        icon={{ ios: 'star', android: 'star', web: 'star' }}
        accessibilityLabel="Tinted"
        variant="tinted"
        onPress={jest.fn()}
      />,
    );
    expect(backgroundOf('Tinted')).toBe(lightColors.brandSubtle);
  });
});
