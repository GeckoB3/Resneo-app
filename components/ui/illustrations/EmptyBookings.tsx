/**
 * EmptyBookings — a calendar card with an empty grid and a single teal "spark"
 * where a booking would sit. Used by the appointments list when a period has
 * nothing booked. Flat + geometric to match the app's chart/icon language.
 */
import { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Svg } from 'react-native-svg';

import { ILLO_GRID, useIllustrationPalette, type IllustrationProps } from './palette';

export function EmptyBookings({ size = 120 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ILLO_GRID} ${ILLO_GRID}`} fill="none">
      <Defs>
        <LinearGradient id="bk-spark" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.gradFrom} />
          <Stop offset="1" stopColor={p.gradTo} />
        </LinearGradient>
      </Defs>

      {/* Soft backdrop blob */}
      <Circle cx={60} cy={60} r={50} fill={p.backdrop} opacity={p.isDark ? 0.6 : 0.9} />

      {/* Calendar card */}
      <Rect x={26} y={28} width={68} height={66} rx={10} fill={p.paper} stroke={p.line} strokeWidth={2} />
      {/* Header band */}
      <Path
        d="M26 38a10 10 0 0 1 10-10h48a10 10 0 0 1 10 10v6H26z"
        fill={p.fill}
      />
      {/* Hanger rings */}
      <Line x1={42} y1={22} x2={42} y2={32} stroke={p.ink} strokeWidth={3.5} strokeLinecap="round" />
      <Line x1={78} y1={22} x2={78} y2={32} stroke={p.ink} strokeWidth={3.5} strokeLinecap="round" />

      {/* Grid rows (faint, like an empty week) */}
      <G stroke={p.line} strokeWidth={2} strokeLinecap="round" opacity={0.8}>
        <Line x1={34} y1={56} x2={50} y2={56} />
        <Line x1={58} y1={56} x2={74} y2={56} />
        <Line x1={34} y1={68} x2={50} y2={68} />
        <Line x1={34} y1={80} x2={50} y2={80} />
        <Line x1={58} y1={80} x2={74} y2={80} />
      </G>

      {/* The one teal event marker — the brand spark */}
      <Rect x={58} y={62} width={26} height={12} rx={6} fill="url(#bk-spark)" />
    </Svg>
  );
}
