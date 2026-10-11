/**
 * A button is named by its label, while it loads and after. Android keeps a view's last content
 * description when the next one would be empty, so a label-less button that was once busy kept
 * reading "busy" to TalkBack after it finished loading.
 */
import { render, screen } from '@testing-library/react-native';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('is named by its label', async () => {
    await render(<Button label="New sale" onPress={jest.fn()} />);
    expect(screen.getByLabelText('New sale').props.accessibilityState).toMatchObject({ disabled: false, busy: false });
  });

  it('keeps its name while it loads and once it is done', async () => {
    const view = await render(<Button label="New sale" loading onPress={jest.fn()} />);
    expect(screen.getByLabelText('New sale').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await view.rerender(<Button label="New sale" loading={false} onPress={jest.fn()} />);
    expect(screen.getByLabelText('New sale').props.accessibilityState).toMatchObject({ disabled: false, busy: false });
  });

  it('lets a caller choose a different name', async () => {
    await render(<Button label="Add" accessibilityLabel="Add a product" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Add a product')).toBeTruthy();
    expect(screen.queryByLabelText('Add')).toBeNull();
  });
});
