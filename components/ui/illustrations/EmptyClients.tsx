/**
 * EmptyClients — two overlapping avatar tokens standing in for a (yet empty)
 * client directory, the front one carrying the teal brand accent. Geometric
 * person glyphs rather than detailed figures, matching the flat aesthetic.
 */
import { Circle, Defs, G, LinearGradient, Path, Stop, Svg } from 'react-native-svg';

import { ILLO_GRID, useIllustrationPalette, type IllustrationProps } from './palette';

export function EmptyClients({ size = 120 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ILLO_GRID} ${ILLO_GRID}`} fill="none">
      <Defs>
        <LinearGradient id="cl-front" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.gradFrom} />
          <Stop offset="1" stopColor={p.gradTo} />
        </LinearGradient>
      </Defs>

      {/* Backdrop blob */}
      <Circle cx={60} cy={60} r={50} fill={p.backdrop} opacity={p.isDark ? 0.6 : 0.9} />

      {/* Back figure — quiet, navy-tinted */}
      <G opacity={0.55}>
        <Circle cx={80} cy={50} r={13} fill={p.fill} stroke={p.line} strokeWidth={2} />
        <Path
          d="M58 92a22 22 0 0 1 44 0z"
          fill={p.fill}
          stroke={p.line}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </G>

      {/* Front figure — the brand accent token */}
      <Circle cx={46} cy={48} r={15} fill={p.paper} stroke={p.ink} strokeWidth={2.5} />
      <Path
        d="M22 96a24 24 0 0 1 48 0z"
        fill={p.paper}
        stroke={p.ink}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* Teal accent badge on the front avatar */}
      <Circle cx={46} cy={48} r={15} fill="url(#cl-front)" opacity={0.16} />
      <Circle cx={62} cy={62} r={9} fill="url(#cl-front)" />
      <Path
        d="M58.5 62l2.5 2.5 4.5-4.5"
        stroke={p.paper}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
