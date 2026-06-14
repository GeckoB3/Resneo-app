/**
 * EmptySearch — a magnifying glass sweeping an empty result card, used when a
 * list is empty *because* of an active search/filter (no matches) rather than
 * having no data at all. The lens ring carries the teal accent.
 */
import { Circle, Defs, G, Line, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { ILLO_GRID, useIllustrationPalette, type IllustrationProps } from './palette';

export function EmptySearch({ size = 120 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ILLO_GRID} ${ILLO_GRID}`} fill="none">
      <Defs>
        <LinearGradient id="se-lens" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.gradFrom} />
          <Stop offset="1" stopColor={p.gradTo} />
        </LinearGradient>
      </Defs>

      {/* Backdrop blob */}
      <Circle cx={60} cy={60} r={50} fill={p.backdrop} opacity={p.isDark ? 0.6 : 0.9} />

      {/* Result card behind the lens — empty rows */}
      <Rect x={24} y={30} width={56} height={64} rx={10} fill={p.paper} stroke={p.line} strokeWidth={2} />
      <G stroke={p.line} strokeWidth={2} strokeLinecap="round" opacity={0.8}>
        <Line x1={34} y1={44} x2={66} y2={44} />
        <Line x1={34} y1={56} x2={58} y2={56} />
        <Line x1={34} y1={68} x2={66} y2={68} />
        <Line x1={34} y1={80} x2={50} y2={80} />
      </G>

      {/* Magnifier — lens ring in teal, navy handle */}
      <Circle cx={74} cy={66} r={20} fill={p.paper} opacity={p.isDark ? 0.9 : 1} />
      <Circle cx={74} cy={66} r={20} stroke="url(#se-lens)" strokeWidth={5} fill="none" />
      <Circle cx={74} cy={66} r={20} stroke={p.ink} strokeWidth={5} fill="none" opacity={0.12} />
      <Line
        x1={89}
        y1={81}
        x2={101}
        y2={93}
        stroke={p.ink}
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Tiny "no match" glint */}
      <Line x1={68} y1={60} x2={80} y2={72} stroke={p.accent} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}
