/**
 * EmptyInbox — an open envelope with a teal "all caught up" check, used by the
 * notifications screen when there's no activity. Flat geometric envelope to
 * match the brand's simple shapes.
 */
import { Circle, Defs, G, LinearGradient, Path, Stop, Svg } from 'react-native-svg';

import { ILLO_GRID, useIllustrationPalette, type IllustrationProps } from './palette';

export function EmptyInbox({ size = 120 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ILLO_GRID} ${ILLO_GRID}`} fill="none">
      <Defs>
        <LinearGradient id="in-check" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.gradFrom} />
          <Stop offset="1" stopColor={p.gradTo} />
        </LinearGradient>
      </Defs>

      {/* Backdrop blob */}
      <Circle cx={60} cy={60} r={50} fill={p.backdrop} opacity={p.isDark ? 0.6 : 0.9} />

      {/* Envelope body */}
      <Path
        d="M26 44a8 8 0 0 1 8-8h52a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8z"
        fill={p.paper}
        stroke={p.ink}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* Inner flap (open) */}
      <Path
        d="M26 46l30 24a8 8 0 0 0 8 0l30-24"
        fill="none"
        stroke={p.line}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lift lines — paper peeking out */}
      <G stroke={p.line} strokeWidth={2} strokeLinecap="round" opacity={0.7}>
        <Path d="M40 40h40" fill="none" />
      </G>

      {/* Teal "caught up" badge */}
      <Circle cx={86} cy={40} r={15} fill="url(#in-check)" />
      <Path
        d="M79.5 40l4.5 4.5 9-9"
        stroke={p.paper}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
