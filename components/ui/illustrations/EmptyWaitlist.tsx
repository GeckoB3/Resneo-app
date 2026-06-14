/**
 * EmptyWaitlist — a stack of queue cards with a teal clock, standing in for an
 * empty waitlist (no one waiting in line). Geometric, flat, on-brand.
 */
import { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Svg } from 'react-native-svg';

import { ILLO_GRID, useIllustrationPalette, type IllustrationProps } from './palette';

export function EmptyWaitlist({ size = 120 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ILLO_GRID} ${ILLO_GRID}`} fill="none">
      <Defs>
        <LinearGradient id="wl-clock" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.gradFrom} />
          <Stop offset="1" stopColor={p.gradTo} />
        </LinearGradient>
      </Defs>

      {/* Backdrop blob */}
      <Circle cx={60} cy={60} r={50} fill={p.backdrop} opacity={p.isDark ? 0.6 : 0.9} />

      {/* Back queue card (offset, quiet) */}
      <Rect
        x={38}
        y={28}
        width={50}
        height={34}
        rx={8}
        fill={p.fill}
        stroke={p.line}
        strokeWidth={2}
        opacity={0.7}
      />
      {/* Middle queue card */}
      <Rect x={30} y={40} width={54} height={36} rx={9} fill={p.paper} stroke={p.line} strokeWidth={2} />

      {/* Front queue card with rows */}
      <Rect x={24} y={54} width={58} height={40} rx={10} fill={p.paper} stroke={p.ink} strokeWidth={2.5} />
      <G stroke={p.line} strokeWidth={2} strokeLinecap="round" opacity={0.85}>
        <Line x1={34} y1={68} x2={56} y2={68} />
        <Line x1={34} y1={80} x2={48} y2={80} />
      </G>

      {/* Teal clock — the "waiting" mark */}
      <Circle cx={84} cy={74} r={16} fill="url(#wl-clock)" />
      <Path
        d="M84 66v8.5l5.5 3.5"
        stroke={p.paper}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
