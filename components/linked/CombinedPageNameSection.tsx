import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { COLLECTIVE_PUBLIC_NAME_MAX, COLLECTIVE_PUBLIC_NAME_MIN, collectiveCustomPublicName } from '@/lib/linked/collective-page';
import { useUpdateCollective } from '@/lib/queries/useCollectives';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView, UpdateCollectivePayload } from '@/types/collectives';

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string };

/**
 * One name save: Saving, then Saved for a moment, or the server's sentence (a name another
 * collective holds, say). `onSaved` records what the server now holds: the collective passed in
 * catches up only after the refresh a save triggers, and a second change made before then must be
 * compared with the saved value, not the stale one.
 */
function useNameSave(save: (payload: UpdateCollectivePayload) => Promise<unknown>) {
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  const run = useCallback(
    (payload: UpdateCollectivePayload, onSaved: () => void) => {
      setState({ status: 'saving' });
      save(payload)
        .then(() => {
          onSaved();
          setState({ status: 'saved' });
          setTimeout(() => setState((s) => (s.status === 'saved' ? { status: 'idle' } : s)), 2500);
        })
        .catch((err: unknown) => {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : areaCopy('bp.name.saveFailed') });
        });
    },
    [save],
  );
  return { state, run };
}

function SaveStatus({ state }: { state: SaveState }) {
  const { colors } = useTheme();
  if (state.status === 'idle') return null;
  return (
    <Text
      variant="caption"
      accessibilityLiveRegion="polite"
      color={state.status === 'error' ? colors.danger : state.status === 'saved' ? colors.success : colors.textMuted}>
      {state.status === 'saving' ? areaCopy('bp.name.saving') : state.status === 'saved' ? areaCopy('bp.name.saved') : state.message}
    </Text>
  );
}

/**
 * The name at the top of the combined page, in its browser tab and in guests' booking emails (web
 * `PageNameSection`, D58, CQ-10.10). By default it is the host venue's own name, so the page reads as
 * that business; the host can choose a different one. The collective's own name is separate, and
 * only the venues see it. Host only.
 *
 * Both save when the field is left, as on the web. A Save button shows while a change is unsaved: on
 * a phone the keyboard can go away without the field being left, and leaving the screen then would
 * lose the change.
 */
export function CombinedPageNameSection({ collective, onChanged }: { collective: CollectiveView; onChanged?: () => void }) {
  const update = useUpdateCollective();
  const { mutateAsync } = update;
  const collectiveId = collective.id;
  const save = useCallback(
    async (payload: UpdateCollectivePayload) => {
      await mutateAsync({ collectiveId, payload });
      onChanged?.();
    },
    [mutateAsync, collectiveId, onChanged],
  );

  const host = collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ?? 'The host venue';
  const initialCustom = collectiveCustomPublicName(collective.bookingPageConfig);
  // What each name was last saved as from here (undefined: nothing saved yet, so the collective's).
  const [savedHere, setSavedHere] = useState<{ custom?: string | null; name?: string }>({});
  const savedCustom = savedHere.custom !== undefined ? savedHere.custom : initialCustom;
  const savedName = savedHere.name ?? collective.name;
  const [useCustom, setUseCustom] = useState(initialCustom !== null);
  // A first-time choice starts from the collective's own name, which is often the business name.
  const [customName, setCustomName] = useState(initialCustom ?? collective.name);
  const [collectiveName, setCollectiveName] = useState(collective.name);
  const pageName = useNameSave(save);
  const ownName = useNameSave(save);

  const customValue = customName.trim();
  const customTooShort = customValue.length < COLLECTIVE_PUBLIC_NAME_MIN;
  const customDirty = useCustom && !customTooShort && customValue !== savedCustom;
  const nameValue = collectiveName.trim();
  const nameDirty = nameValue.length >= 2 && nameValue !== savedName;

  const savePageName = (value: string | null) => {
    if (pageName.state.status === 'saving') return;
    pageName.run({ publicName: value }, () => setSavedHere((s) => ({ ...s, custom: value })));
  };
  const saveCustom = () => {
    if (!customTooShort && customValue !== savedCustom) savePageName(customValue);
  };
  const saveCollectiveName = () => {
    if (!nameDirty || ownName.state.status === 'saving') return;
    ownName.run({ name: nameValue }, () => setSavedHere((s) => ({ ...s, name: nameValue })));
  };

  return (
    <Card style={styles.card} testID="combined-page-name">
      <View style={styles.group}>
        <Text variant="label">{areaCopy('bp.name.heading')}</Text>
        <Text variant="caption" tone="secondary">
          {areaCopy('bp.name.help')}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={areaCopy('bp.name.heading')} style={styles.group}>
          <ChoiceRow
            selected={!useCustom}
            title={host}
            summary={areaCopy('bp.name.host.body')}
            disabled={update.isPending}
            onPress={() => {
              setUseCustom(false);
              if (savedCustom !== null) savePageName(null);
            }}
          />
          <ChoiceRow
            selected={useCustom}
            title={areaCopy('bp.name.custom')}
            disabled={update.isPending}
            onPress={() => {
              setUseCustom(true);
              saveCustom();
            }}
          />
        </View>
        {useCustom ? (
          <Input
            accessibilityLabel={areaCopy('bp.name.custom.label')}
            value={customName}
            maxLength={COLLECTIVE_PUBLIC_NAME_MAX}
            returnKeyType="done"
            onChangeText={setCustomName}
            onBlur={saveCustom}
            onSubmitEditing={saveCustom}
            helper={customTooShort ? undefined : areaCopy('bp.name.custom.example')}
            error={customTooShort ? areaCopy('bp.name.custom.tooShort') : undefined}
          />
        ) : null}
        {useCustom && customDirty && pageName.state.status !== 'saving' ? (
          <Button label="Save" size="sm" variant="secondary" onPress={saveCustom} />
        ) : null}
        <SaveStatus state={pageName.state} />
      </View>

      <View style={styles.group}>
        <Input
          label={areaCopy('bp.name.collective.label')}
          helper={areaCopy('bp.name.collective.help')}
          value={collectiveName}
          maxLength={120}
          returnKeyType="done"
          onChangeText={setCollectiveName}
          onBlur={saveCollectiveName}
          onSubmitEditing={saveCollectiveName}
        />
        {nameDirty && ownName.state.status !== 'saving' ? (
          <Button label="Save" size="sm" variant="secondary" onPress={saveCollectiveName} />
        ) : null}
        <SaveStatus state={ownName.state} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
});
