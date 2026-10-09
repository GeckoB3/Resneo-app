import { useState, type ReactNode } from 'react';

import { PosSheet } from '@/components/pos/parts';
import { Banner, TextField, useSettingsT } from '@/components/pos/settings/SettingsParts';
import { Button } from '@/components/ui/Button';

/**
 * A short form in a sheet for a name (add or rename a till or a payment type), standing in for the
 * web's dialog and prompt. `onSave` answers null when done, or the sentence to show; `fieldError`
 * marks the sentence as about the name.
 */
export function NameSheet({
  visible,
  title,
  label,
  initial,
  maxLength,
  onClose,
  onSave,
  children,
}: {
  visible: boolean;
  title: string;
  label: string;
  initial: string | null;
  maxLength: number;
  onClose: () => void;
  onSave: (name: string) => Promise<{ message: string; field: boolean } | null>;
  /** More fields under the name (a switch). */
  children?: ReactNode;
}) {
  const { t } = useSettingsT();
  const [name, setName] = useState<string | null>(initial);
  const [seen, setSeen] = useState({ visible, initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field: boolean } | null>(null);
  // Start fresh each time the sheet opens.
  if (seen.visible !== visible || seen.initial !== initial) {
    setSeen({ visible, initial });
    if (visible) {
      setName(initial);
      setError(null);
    }
  }
  const save = async () => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    setBusy(true);
    const r = await onSave(trimmed);
    setBusy(false);
    setError(r);
  };
  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button label={t('common.save')} onPress={() => void save()} loading={busy} disabled={!name?.trim()} />
          <Button label={t('common.cancel')} variant="secondary" onPress={onClose} disabled={busy} />
        </>
      }>
      {error && !error.field ? <Banner tone="danger">{error.message}</Banner> : null}
      <TextField
        label={label}
        value={name}
        maxLength={maxLength}
        error={error?.field ? error.message : null}
        onChange={(x) => {
          setName(x);
          setError(null);
        }}
      />
      {children}
    </PosSheet>
  );
}
