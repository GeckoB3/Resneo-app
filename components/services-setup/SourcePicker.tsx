import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import type { SetupFilePart } from '@/lib/services-setup/api';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { Panel, TextLink, hostOf } from './bits';

/**
 * Step 1 of the services setup, "Add what you have" (web `SourcePicker.tsx`): four ways to show
 * us the services, the list of what will be read, an optional note for the AI, and the line
 * saying who reads it. On a phone the photo panel offers the photo library, the camera and, when
 * there is one, a screenshot copied to the clipboard (the web's paste); there is no drag and drop.
 */

export type SourceKind = 'url' | 'text' | 'file';

export interface SetupSource {
  key: string;
  kind: SourceKind;
  /** What the owner sees: a file name, a web address, "Your typed list". */
  label: string;
  url?: string;
  text?: string;
  /** One file, or the slices of one long screenshot (read together). */
  files?: SetupFilePart[];
  /** A photo or screenshot rather than a document, for the row's icon. */
  isImage?: boolean;
  status: 'waiting' | 'reading' | 'done' | 'failed';
  /** Services this source added to the list, and ones it found that were already there. */
  found?: number;
  alreadyListed?: number;
  error?: string;
  warnings?: string[];
  /** When the current read began, for the "Reading… 23s" timer. */
  startedAt?: number;
  /** Pages the reader followed from a link (a website's price page, its booking page). */
  followed?: string[];
}

type Choice = 'url' | 'photo' | 'file' | 'text';

type Symbol = SymbolViewProps['name'];

export const SOURCE_SYMBOLS: Record<'url' | 'photo' | 'file' | 'text', Symbol> = {
  url: { ios: 'link', android: 'link', web: 'link' },
  photo: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
  file: { ios: 'doc.text', android: 'description', web: 'description' },
  text: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
};

function Tile({
  active,
  icon,
  title,
  description,
  onPress,
}: {
  active: boolean;
  icon: Symbol;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={title}
      accessibilityHint={description}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: active ? colors.brand : colors.border,
          backgroundColor: active ? colors.brandSubtle : colors.surfaceRaised,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <SymbolView name={icon} tintColor={colors.brand} size={24} />
      <View style={styles.flex}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="bodySmall" tone="secondary">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

export interface SourcePickerProps {
  sources: SetupSource[];
  websiteUrl: string | null;
  preparing: boolean;
  notice: string | null;
  instructions: string;
  /** A picture is waiting on the clipboard, so "Paste a copied screenshot" is offered. */
  canPaste: boolean;
  onInstructionsChange: (value: string) => void;
  onAddUrl: (url: string) => void;
  onAddText: (text: string) => void;
  onPickPhotos: () => void;
  /** Take a photo with the camera. Left out, the panel says to take it first and choose it. */
  onTakePhoto?: () => void;
  onPastePhoto: () => void;
  onPickFiles: () => void;
  onRemove: (key: string) => void;
  /** The photo panel opened: a good moment to look at the clipboard. */
  onPhotoPanel?: () => void;
}

export function SourcePicker({
  sources,
  websiteUrl,
  preparing,
  notice,
  instructions,
  canPaste,
  onInstructionsChange,
  onAddUrl,
  onAddText,
  onPickPhotos,
  onTakePhoto,
  onPastePhoto,
  onPickFiles,
  onRemove,
  onPhotoPanel,
}: SourcePickerProps) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [showNotes, setShowNotes] = useState(instructions.trim().length > 0);

  function choose(next: Choice) {
    setChoice(next);
    if (next === 'photo') onPhotoPanel?.();
  }

  function submitUrl() {
    const value = url.trim();
    if (!value) return;
    onAddUrl(value);
    setUrl('');
  }

  function submitText() {
    if (!text.trim()) return;
    onAddText(text);
    setText('');
  }

  const suggestWebsite =
    websiteUrl && !sources.some((s) => s.kind === 'url' && hostOf(s.url ?? '') === hostOf(websiteUrl)) ? websiteUrl : null;

  return (
    <View style={styles.stack}>
      <Text variant="body" tone="secondary">
        Show us your services however you have them. We read them and set them up for you, then you check each one before
        anything is added. You can add more than one.
      </Text>

      <View style={styles.tiles}>
        <Tile
          active={choice === 'url'}
          icon={SOURCE_SYMBOLS.url}
          title="Your old booking page"
          description="Paste a link to your booking page or website, for example on Fresha, Treatwell or Booksy."
          onPress={() => choose('url')}
        />
        <Tile
          active={choice === 'photo'}
          icon={SOURCE_SYMBOLS.photo}
          title="A photo or screenshot"
          description="Your price list, a menu board, or screenshots of your old booking page."
          onPress={() => choose('photo')}
        />
        <Tile
          active={choice === 'file'}
          icon={SOURCE_SYMBOLS.file}
          title="A document or spreadsheet"
          description="A PDF, Word, Excel or CSV file with your services and prices."
          onPress={() => choose('file')}
        />
        <Tile
          active={choice === 'text'}
          icon={SOURCE_SYMBOLS.text}
          title="Type or paste a list"
          description="One service per line is fine. Add prices and times if you know them."
          onPress={() => choose('text')}
        />
      </View>

      {choice === 'url' ? (
        <Panel>
          <Input
            label="Link to your services"
            value={url}
            onChangeText={setUrl}
            placeholder="www.yoursalon.co.uk/prices"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            returnKeyType="done"
            onSubmitEditing={submitUrl}
          />
          <Button label="Add link" onPress={submitUrl} disabled={!url.trim()} />
          <Text variant="caption" tone="muted">
            Your home page is fine: we also look at the pages it links to for prices and booking. If a site will not let us
            read it, a screenshot works just as well.
          </Text>
          {suggestWebsite ? <TextLink label={`Use your website, ${hostOf(suggestWebsite)}`} onPress={() => onAddUrl(suggestWebsite)} /> : null}
        </Panel>
      ) : null}

      {choice === 'photo' ? (
        <Panel>
          <Button label="Choose photos" onPress={onPickPhotos} disabled={preparing} />
          {onTakePhoto ? <Button label="Take a photo" variant="secondary" onPress={onTakePhoto} disabled={preparing} /> : null}
          {canPaste ? <Button label="Paste a copied screenshot" variant="secondary" onPress={onPastePhoto} disabled={preparing} /> : null}
          <Text variant="caption" tone="muted">
            {onTakePhoto
              ? 'Make sure the prices are sharp and nothing is cut off. Long screenshots are fine.'
              : 'Make sure the prices are sharp and nothing is cut off. Long screenshots are fine. To photograph a price list, take the photo with your camera first, then choose it here.'}
          </Text>
        </Panel>
      ) : null}

      {choice === 'file' ? (
        <Panel>
          <Button label="Choose a file" onPress={onPickFiles} disabled={preparing} />
          <Text variant="caption" tone="muted">
            PDF, Word (.docx), Excel, CSV or text, up to 4 MB each.
          </Text>
        </Panel>
      ) : null}

      {choice === 'text' ? (
        <Panel>
          <Input
            label="Your services"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            style={styles.textArea}
            placeholder={'Ladies cut and blow dry, 45 min, £38\nFull head colour, 2 hours, £85\nGents cut £18'}
          />
          <Button label="Add this list" onPress={submitText} disabled={!text.trim()} />
        </Panel>
      ) : null}

      {preparing ? (
        <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel="Getting your photos ready">
          <ActivityIndicator size="small" color={colors.brand} />
          <Text variant="bodySmall" tone="secondary">
            Getting your photos ready…
          </Text>
        </View>
      ) : null}
      {notice ? (
        <Panel tone="warning">
          <Text variant="bodySmall" accessibilityRole="alert">
            {notice}
          </Text>
        </Panel>
      ) : null}

      {sources.length > 0 ? (
        <View style={styles.stackSm}>
          <Text variant="label">{`What we will read (${sources.length})`}</Text>
          <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            {sources.map((s, i) => (
              <View
                key={s.key}
                style={[styles.sourceRow, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <SymbolView
                  name={s.kind === 'url' ? SOURCE_SYMBOLS.url : s.kind === 'text' ? SOURCE_SYMBOLS.text : s.isImage ? SOURCE_SYMBOLS.photo : SOURCE_SYMBOLS.file}
                  tintColor={colors.brand}
                  size={20}
                />
                <View style={styles.flex}>
                  <Text variant="bodySmall" numberOfLines={1}>
                    {s.label}
                  </Text>
                  {s.status === 'failed' && s.error ? (
                    <Text variant="caption" tone="danger">
                      {`Last try: ${s.error}`}
                    </Text>
                  ) : null}
                </View>
                <TextLink label="Remove" accessibilityLabel={`Remove ${s.label}`} onPress={() => onRemove(s.key)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {showNotes ? (
        <Input
          label="Anything we should know?"
          optional
          value={instructions}
          onChangeText={onInstructionsChange}
          maxLength={1000}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={styles.notes}
          placeholder="For example: ignore the children's prices, or every service needs 10 minutes more than it says."
        />
      ) : (
        <TextLink label="Add a note on how to read your list (optional)" onPress={() => setShowNotes(true)} />
      )}

      <Text variant="caption" tone="muted">
        We use AI (from OpenAI) to read what you add. Please do not include client names or other personal details. Nothing is
        added to your services until you choose to add it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  stackSm: {
    gap: spacing.sm,
  },
  tiles: {
    gap: spacing.sm,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 76,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textArea: {
    minHeight: 132,
  },
  notes: {
    minHeight: 76,
  },
  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
