/**
 * Client mode's shared flag (POS test round 2026-10-11, Part 3): on while any screen has the phone
 * in a client's hands, and Back goes to the stop panel's listener.
 */
import { render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { __resetClientFacingForTests, isClientFacing, requestClientBack, useClientFacing } from '@/lib/ui/client-facing';

jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => undefined), deactivateKeepAwake: jest.fn() }));

function Probe({ active, onBack, hardwareBack = false }: { active: boolean; onBack: () => void; hardwareBack?: boolean }) {
  useClientFacing(active, onBack, { hardwareBack });
  return null;
}

describe('useClientFacing', () => {
  beforeEach(() => __resetClientFacingForTests());

  it('is on only while a client screen is up, and sends Back to its listener', async () => {
    const onBack = jest.fn();
    const view = await render(<Probe active onBack={onBack} />);
    expect(isClientFacing()).toBe(true);
    expect(requestClientBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    await view.rerender(<Probe active={false} onBack={onBack} />);
    expect(isClientFacing()).toBe(false);
    expect(requestClientBack()).toBe(false);
  });

  it("takes Android's Back on a full screen", async () => {
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
    const view = await render(<Probe active hardwareBack onBack={jest.fn()} />);
    expect(add).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    await view.unmount();
    expect(remove).toHaveBeenCalled();
    add.mockRestore();
  });
});
