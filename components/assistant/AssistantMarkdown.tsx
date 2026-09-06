import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import {
  parseAssistantMarkdown,
  type AssistantBlock,
  type AssistantSpan,
} from '@/lib/assistant/markdown';
import { fonts, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * One Ask ResNeo answer, drawn from the blocks `parseAssistantMarkdown` finds:
 * numbered steps and bullets as a marker plus its line, everything else as a
 * paragraph, with the screen and button names the model bolds kept bold and
 * only allowed links tappable.
 *
 * Re-parsed on every token while the answer streams. That is cheap (a couple of
 * regexes over a few hundred characters) and it is what makes the steps appear
 * as steps rather than as raw markdown that reformats itself at the end.
 */
export function AssistantMarkdown({
  markdown,
  onPressLink,
}: {
  markdown: string;
  onPressLink: (href: string) => void;
}) {
  const blocks = parseAssistantMarkdown(markdown);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} onPressLink={onPressLink} />
      ))}
    </View>
  );
}

function Block({
  block,
  onPressLink,
}: {
  block: AssistantBlock;
  onPressLink: (href: string) => void;
}) {
  if (block.type === 'listItem') {
    return (
      <View style={styles.listItem}>
        <Text variant="body" tone="muted" style={styles.marker}>
          {block.marker}
        </Text>
        <Text variant="body" style={styles.itemText}>
          <Spans spans={block.spans} onPressLink={onPressLink} />
        </Text>
      </View>
    );
  }
  return (
    <Text variant="body">
      <Spans spans={block.spans} onPressLink={onPressLink} />
    </Text>
  );
}

function Spans({
  spans,
  onPressLink,
}: {
  spans: AssistantSpan[];
  onPressLink: (href: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <>
      {spans.map((span, index) =>
        span.type === 'link' ? (
          <Text
            key={index}
            variant="body"
            color={colors.brand}
            style={styles.link}
            accessibilityRole="link"
            onPress={() => onPressLink(span.href)}>
            {span.text}
          </Text>
        ) : (
          <Text key={index} variant="body" style={span.bold ? styles.bold : undefined}>
            {span.text}
          </Text>
        ),
      )}
    </>
  );
}

const styles = StyleSheet.create({
  blocks: {
    gap: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  marker: {
    minWidth: 20,
  },
  itemText: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.semibold,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
