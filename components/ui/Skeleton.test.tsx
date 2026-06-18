/**
 * F4 — Skeleton shimmer with a reduce-motion early-return.
 *
 * Reduce-motion users must get a calm, static block (NO SVG, no animation); the
 * default path renders an animated `react-native-svg` gradient shimmer. We toggle
 * the shared `useReduceMotion` hook to prove the early return is taken.
 */
import { render } from '@testing-library/react-native';

let mockReduceMotion = false;
jest.mock('@/lib/motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

import { Skeleton } from '@/components/ui/Skeleton';

/** Walk a RNTL JSON tree and collect every node `type` string. */
function collectTypes(node: unknown, acc: string[] = []): string[] {
  if (!node || typeof node !== 'object') return acc;
  const n = node as { type?: unknown; children?: unknown };
  if (typeof n.type === 'string') acc.push(n.type);
  const children = (node as { children?: unknown[] }).children;
  if (Array.isArray(children)) children.forEach((c) => collectTypes(c, acc));
  return acc;
}

describe('Skeleton', () => {
  afterEach(() => {
    mockReduceMotion = false;
  });

  it('reduce-motion: renders a static block with NO svg', async () => {
    mockReduceMotion = true;
    const tree = await render(<Skeleton width={100} height={12} />);
    const types = collectTypes(tree.toJSON());
    // No react-native-svg host nodes should appear in the static branch.
    const svgish = types.filter((t) => /svg/i.test(t));
    expect(svgish).toHaveLength(0);
    // It still renders a host view.
    expect(tree.toJSON()).toBeTruthy();
  });

  it('motion on: renders the animated svg shimmer', async () => {
    mockReduceMotion = false;
    const tree = await render(<Skeleton width={100} height={12} />);
    const types = collectTypes(tree.toJSON());
    const svgish = types.filter((t) => /svg/i.test(t));
    expect(svgish.length).toBeGreaterThan(0);
  });
});
