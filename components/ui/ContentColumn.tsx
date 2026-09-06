import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { CONTENT_MAX_WIDTH, useContentMaxWidth } from '@/lib/responsive';

export interface ContentColumnProps extends ViewProps {
  /** Override the cap (dp). Defaults to `CONTENT_MAX_WIDTH`. */
  max?: number;
  /** Fill the parent's height as well — for a column that owns a scroll view. */
  fill?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * A single column of content, centred and capped on wide viewports.
 *
 * On a phone this is a plain full-width `View` — the cap never bites, so
 * nothing changes. On a tablet it stops prose and form fields from running the
 * full width of the window, where a line of text is too long to track and a
 * label ends up half a screen from its field. The web dashboard caps its own
 * columns the same way.
 *
 * Put it INSIDE the padding, not around it: the column should centre the
 * content, not the screen's gutters.
 */
export function ContentColumn({ max = CONTENT_MAX_WIDTH, fill = false, style, ...props }: ContentColumnProps) {
  const maxWidth = useContentMaxWidth(max);
  return (
    <View
      {...props}
      style={[styles.column, fill ? styles.fill : null, maxWidth ? { maxWidth } : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  column: {
    width: '100%',
    alignSelf: 'center',
  },
  fill: {
    flex: 1,
  },
});
