import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CommunicationPreviewResponse, MessageChannel } from '@/types/communications';

type PreviewSheetProps = {
  visible: boolean;
  title: string;
  channel: MessageChannel;
  /** Result from POST /api/venue/communication-preview, or null while loading. */
  preview: CommunicationPreviewResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

/**
 * Bottom sheet that renders a communication preview.
 *
 * - SMS: styled text bubble rendered inline.
 * - Email: rendered inline as plain text (subject + body), with a button
 *   to open the full HTML in the system browser via a data: URI.
 */
export function CommunicationPreviewSheet({
  visible,
  title,
  channel,
  preview,
  loading,
  error,
  onClose,
}: PreviewSheetProps) {
  const { colors } = useTheme();

  const openEmailInBrowser = async () => {
    if (!preview?.html) return;
    // Encode the HTML as a data: URI and open in the in-app browser so the
    // user can see the fully rendered template without a WebView dependency.
    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(preview.html)}`;
    await WebBrowser.openBrowserAsync(dataUri);
  };

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="80%">
      {/* Header */}
      <View style={styles.header}>
        <Text variant="subheading" style={styles.headerTitle} numberOfLines={2}>
          Preview: {title}
        </Text>
        <View style={styles.channelBadge}>
          <View
            style={[
              styles.channelPill,
              { backgroundColor: channel === 'sms' ? colors.successSurface : colors.brandSubtle },
            ]}>
            <Text
              variant="caption"
              style={{ color: channel === 'sms' ? colors.success : colors.brand }}>
              {channel === 'sms' ? 'SMS' : 'Email'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text variant="bodySmall" tone="muted" style={styles.loadingText}>
              Rendering preview…
            </Text>
          </View>
        ) : error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          </View>
        ) : !preview ? (
          <Text variant="bodySmall" tone="muted" style={styles.noPreview}>
            No preview available.
          </Text>
        ) : channel === 'sms' ? (
          <SmsBubble text={preview.text} sampleKind={preview.previewSampleKind} />
        ) : (
          <EmailPreview
            subject={preview.subject}
            text={preview.text}
            hasHtml={!!preview.html}
            sampleKind={preview.previewSampleKind}
            onOpenBrowser={openEmailInBrowser}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button label="Close" variant="ghost" onPress={onClose} fullWidth />
      </View>
    </Sheet>
  );
}

function SmsBubble({
  text,
  sampleKind,
}: {
  text: string | null;
  sampleKind: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.smsContainer}>
      <View
        style={[
          styles.smsBubble,
          { backgroundColor: colors.successSurface, borderColor: colors.success },
        ]}>
        <Text variant="bodySmall" style={{ color: colors.text }}>
          {text ?? 'No message content.'}
        </Text>
      </View>
      {sampleKind ? (
        <Text variant="caption" tone="muted" style={styles.sampleKind}>
          Sample context: {sampleKind}
        </Text>
      ) : null}
    </View>
  );
}

function EmailPreview({
  subject,
  text,
  hasHtml,
  sampleKind,
  onOpenBrowser,
}: {
  subject: string | null;
  text: string | null;
  hasHtml: boolean;
  sampleKind: string | null;
  onOpenBrowser: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.emailContainer}>
      {subject ? (
        <View style={[styles.subjectBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="caption" tone="muted">
            Subject
          </Text>
          <Text variant="bodyMedium">{subject}</Text>
        </View>
      ) : null}

      <View style={[styles.emailBody, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <Text variant="bodySmall" style={{ color: colors.text }}>
          {text ?? 'No text content.'}
        </Text>
      </View>

      {hasHtml ? (
        <Button
          label="Open full HTML in browser"
          variant="secondary"
          onPress={onOpenBrowser}
          fullWidth
        />
      ) : null}

      {sampleKind ? (
        <Text variant="caption" tone="muted" style={styles.sampleKind}>
          Sample context: {sampleKind}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  channelBadge: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  channelPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    gap: spacing.base,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  loadingText: {
    marginTop: spacing.sm,
  },
  errorBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  noPreview: {
    textAlign: 'center',
    paddingVertical: spacing['2xl'],
  },
  smsContainer: {
    gap: spacing.md,
    alignItems: 'stretch',
  },
  smsBubble: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.base,
  },
  emailContainer: {
    gap: spacing.base,
  },
  subjectBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  emailBody: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.base,
  },
  sampleKind: {
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
  },
});
