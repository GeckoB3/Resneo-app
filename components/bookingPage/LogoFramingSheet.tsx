/**
 * LogoFramingSheet — drag-to-reposition + pinch/step-to-zoom editor for the
 * booking page's circular logo badge, presented as its own Sheet. The editor
 * itself lives in {@link ImageFramingEditor} (shared with the service-photo and
 * team-photo sheets, which embed it as an in-sheet mode step instead — a second
 * stacked Sheet is flaky on iOS).
 *
 * Save → `onSave(framing)` (`null` = reset to the centred default), then closes.
 * Cancel → `onClose`.
 */

import { Sheet } from '@/components/ui/Sheet';
import type { BookingPageImageFraming } from '@/lib/booking/bookingPageConfig';

import { ImageFramingEditor } from './ImageFramingEditor';

export type LogoFramingSheetProps = {
  visible: boolean;
  imageUrl: string | null;
  value: BookingPageImageFraming | null;
  onClose: () => void;
  onSave: (next: BookingPageImageFraming | null) => void; // null = reset to centred default
};

export function LogoFramingSheet({
  visible,
  imageUrl,
  value,
  onClose,
  onSave,
}: LogoFramingSheetProps): React.JSX.Element {
  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%">
      <ImageFramingEditor
        active={visible}
        imageUrl={imageUrl}
        value={value}
        frameShape="circle"
        title="Reposition logo"
        emptyLabel="Add a logo to reposition it"
        accessibilityLabel="Logo position and zoom"
        onCancel={onClose}
        onSave={(next) => {
          onSave(next);
          onClose();
        }}
      />
    </Sheet>
  );
}
