/**
 * The camera scanner (UX spec §13.6): asks for the camera in plain words, says how to turn it back
 * on when it was refused, hands back one code in single mode and closes, and in continuous mode
 * takes each code once while the caller is not busy.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/AppLockProvider', () => ({ AppLockCover: () => null }));

let mockPermission: { granted: boolean; canAskAgain: boolean; status: string } | null = null;
const mockRequest = jest.fn(async () => mockPermission);
let mockOnScanned: ((r: { type: string; data: string }) => void) | undefined;
jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useCameraPermissions: () => [mockPermission, mockRequest, mockRequest],
    CameraView: (props: { onBarcodeScanned?: (r: { type: string; data: string }) => void }) => {
      mockOnScanned = props.onBarcodeScanned;
      return React.createElement(View, { testID: 'camera' });
    },
  };
});

import { CameraScanner } from '@/components/retail/CameraScanner';

beforeEach(() => {
  mockOnScanned = undefined;
  mockRequest.mockClear();
});

describe('CameraScanner', () => {
  it('asks for the camera in plain words before the phone has been asked', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'denied' };
    await render(<CameraScanner visible onClose={jest.fn()} onScan={jest.fn()} />);
    expect(screen.getByText('ResNeo needs your camera to scan barcodes.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Turn on the camera'));
    });
    expect(mockRequest).toHaveBeenCalled();
  });

  it('says how to turn the camera back on when it was refused for good', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    await render(<CameraScanner visible onClose={jest.fn()} onScan={jest.fn()} />);
    expect(
      screen.getByText("Camera access is off. Turn it on in your phone's settings to scan, or type the code instead."),
    ).toBeTruthy();
    expect(screen.getByText('Open settings')).toBeTruthy();
  });

  it('hands back the first code and closes in single mode', async () => {
    mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
    const onScan = jest.fn();
    const onClose = jest.fn();
    await render(<CameraScanner visible onClose={onClose} onScan={onScan} />);
    expect(screen.getByText('Point the camera at the barcode.')).toBeTruthy();
    expect(screen.getByLabelText('Torch')).toBeTruthy();
    await act(async () => {
      mockOnScanned?.({ type: 'ean13', data: '5012345678900' });
      mockOnScanned?.({ type: 'ean13', data: '5012345678900' });
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('5012345678900');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps scanning in continuous mode, once per code, and shows what happened', async () => {
    mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
    const onScan = jest.fn();
    const { rerender } = await render(<CameraScanner visible mode="continuous" onClose={jest.fn()} onScan={onScan} />);
    await act(async () => {
      mockOnScanned?.({ type: 'ean13', data: '5012345678900' });
      mockOnScanned?.({ type: 'ean13', data: '5012345678900' });
      mockOnScanned?.({ type: 'code128', data: 'SKU-22' });
    });
    expect(onScan.mock.calls).toEqual([['5012345678900'], ['SKU-22']]);
    await rerender(
      <CameraScanner
        visible
        mode="continuous"
        onClose={jest.fn()}
        onScan={onScan}
        paused
        message={{ tone: 'success', text: 'Added Shampoo' }}
      />,
    );
    expect(screen.getByText('Added Shampoo')).toBeTruthy();
    // Paused while the caller is busy: the camera takes nothing.
    expect(mockOnScanned).toBeUndefined();
    expect(screen.getByText('Done')).toBeTruthy();
  });
});
