import { StyleSheet, View } from 'react-native';

import { ErrorLine, money } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { aiT } from './copy';
import { draftCanBeAdded, draftSummary, optionLabel, reviewLevel, type ProductDraftState, type ReviewNote } from './model';

/**
 * One product the reader found (mock-up B9; the web's `DraftProductCard`): the name and brand, a
 * one-line summary, Ready, Check or Fix, the notes at three levels (fix red, check amber, the
 * reader's own grey), and Skip, Edit and Add. A product with something to fix can't be added until
 * it is edited; one to check can still be added on its own, the owner's call. A product the venue
 * may already have is added "as a new product". Added and skipped products say so; a skipped one
 * can be brought back.
 */
export function DraftCard({
  draft,
  notes,
  busy,
  locked,
  onAdd,
  onEdit,
  onSkip,
  onRestore,
}: {
  draft: ProductDraftState;
  notes: ReviewNote[];
  /** This card is saving. */
  busy: boolean;
  /** Another save is running ("Add all ready"), so this card waits. */
  locked: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onSkip: () => void;
  onRestore: () => void;
}) {
  const { colors } = useTheme();
  const name = draft.name.trim() || aiT('ai.card.unnamed');
  const summary = draftSummary(draft, money);

  if (draft.status === 'added') {
    return (
      <Card accessibilityLabel={name} style={{ borderColor: colors.success }}>
        <Text variant="label">{name}</Text>
        <Text variant="bodySmall" tone="success">
          {`${aiT('ai.card.added')} · ${summary}`}
        </Text>
      </Card>
    );
  }

  if (draft.status === 'skipped') {
    return (
      <Card accessibilityLabel={name}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text variant="label" tone="muted" style={styles.struck}>
              {name}
            </Text>
            <Text variant="bodySmall" tone="muted">
              {aiT('ai.card.skipped')}
            </Text>
          </View>
          <Button label={aiT('ai.card.restore')} size="sm" variant="ghost" onPress={onRestore} disabled={locked} />
        </View>
      </Card>
    );
  }

  const level = reviewLevel(notes);
  const canAdd = draftCanBeAdded(notes);
  const optionNames = draft.options.length > 1 ? draft.options.map((o, i) => optionLabel(o.name, i)).join(', ') : '';
  return (
    <Card accessibilityLabel={name}>
      <View style={styles.stack}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text variant="label">{name}</Text>
            {draft.brand.trim() ? (
              <Text variant="caption" tone="muted">
                {draft.brand.trim()}
              </Text>
            ) : null}
          </View>
          <Badge
            label={level === 'fix' ? aiT('ai.card.fix') : level === 'check' ? aiT('ai.card.check') : aiT('ai.card.ready')}
            tone={level === 'fix' ? 'danger' : level === 'check' ? 'warning' : 'success'}
          />
        </View>
        <Text variant="bodySmall" tone="secondary">
          {summary}
        </Text>
        {optionNames ? (
          <Text variant="caption" tone="muted">
            {optionNames}
          </Text>
        ) : null}
        {notes.map((note, i) => (
          <View
            key={`${note.kind}-${i}`}
            style={[
              styles.note,
              note.level === 'fix'
                ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
                : note.level === 'check'
                  ? { backgroundColor: colors.warningSurface, borderColor: colors.warning }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text variant="caption">{note.text}</Text>
          </View>
        ))}
        <ErrorLine message={draft.error} />
        <View style={styles.buttons}>
          <Button label={aiT('ai.card.skip')} size="sm" variant="ghost" onPress={onSkip} disabled={locked || busy} />
          <Button
            label={aiT('ai.card.edit')}
            size="sm"
            variant={level === 'fix' ? 'primary' : 'secondary'}
            onPress={onEdit}
            disabled={locked || busy}
          />
          <Button
            label={draft.duplicateOf ? aiT('ai.card.addNew') : aiT('ai.card.add')}
            size="sm"
            variant={level === 'fix' ? 'secondary' : 'primary'}
            onPress={onAdd}
            loading={busy}
            disabled={locked || busy || !canAdd}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  note: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'flex-end' },
});
