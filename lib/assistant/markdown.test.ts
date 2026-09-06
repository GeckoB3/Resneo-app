import { isRenderableHref, parseAssistantMarkdown } from '@/lib/assistant/markdown';

/**
 * The parser behind an Ask ResNeo answer. What matters is the shape the answer
 * is asked for (numbered steps, bold control names, one "Read more" link) and
 * the link allowlist, which is the app's copy of the web's second gate against
 * a page the model invented.
 */
describe('isRenderableHref', () => {
  it('allows help pages, dashboard pages and YouTube', () => {
    expect(isRenderableHref('/help/appointments/working-hours')).toBe(true);
    expect(isRenderableHref('/dashboard/settings')).toBe(true);
    expect(isRenderableHref('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isRenderableHref('https://youtu.be/abc123')).toBe(true);
  });

  it('refuses anything else, including other origins and app schemes', () => {
    expect(isRenderableHref('https://example.com/help/x')).toBe(false);
    expect(isRenderableHref('http://youtube.com/watch?v=x')).toBe(false);
    expect(isRenderableHref('resneo://booking/1')).toBe(false);
    expect(isRenderableHref('/booking/1')).toBe(false);
    expect(isRenderableHref('')).toBe(false);
    expect(isRenderableHref(undefined)).toBe(false);
  });
});

describe('parseAssistantMarkdown', () => {
  it('reads numbered steps with their bold control names', () => {
    const blocks = parseAssistantMarkdown(
      '1. Open **Settings** and press **Payments**.\n2. Turn on **Deposits**.',
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'listItem', marker: '1.' });
    expect(blocks[0]!.spans).toEqual([
      { type: 'text', text: 'Open ' },
      { type: 'text', text: 'Settings', bold: true },
      { type: 'text', text: ' and press ' },
      { type: 'text', text: 'Payments', bold: true },
      { type: 'text', text: '.' },
    ]);
    expect(blocks[1]).toMatchObject({ type: 'listItem', marker: '2.' });
  });

  it('reads bullets, and joins the lines of a paragraph', () => {
    const blocks = parseAssistantMarkdown('- One\n- Two\n\nA sentence\nover two lines.');
    expect(blocks.map((b) => b.type)).toEqual(['listItem', 'listItem', 'paragraph']);
    expect(blocks[0]).toMatchObject({ marker: '•' });
    expect(blocks[2]!.spans).toEqual([{ type: 'text', text: 'A sentence over two lines.' }]);
  });

  it('keeps an allowed link and drops the target of one that is not', () => {
    const blocks = parseAssistantMarkdown(
      'Read more: [Working hours](/help/appointments/working-hours) or [elsewhere](https://example.com/x).',
    );
    expect(blocks[0]!.spans).toEqual([
      { type: 'text', text: 'Read more: ' },
      { type: 'link', text: 'Working hours', href: '/help/appointments/working-hours' },
      { type: 'text', text: ' or ' },
      // The words survive, the target does not: what the web's sanitiser does.
      { type: 'text', text: 'elsewhere' },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves the underscores in a wire name alone', () => {
    const blocks = parseAssistantMarkdown('The field is booking_time.');
    expect(blocks[0]!.spans).toEqual([{ type: 'text', text: 'The field is booking_time.' }]);
  });

  it('renders a half-streamed answer as the text it is so far', () => {
    // Mid-token: an unfinished link and an unfinished bold run.
    const blocks = parseAssistantMarkdown('1. Open **Sett');
    expect(blocks[0]).toMatchObject({ type: 'listItem', marker: '1.' });
    expect(blocks[0]!.spans).toEqual([{ type: 'text', text: 'Open **Sett' }]);
  });

  it('shows a heading as a plain paragraph rather than as syntax', () => {
    const blocks = parseAssistantMarkdown('## Deposits\n\nSteps follow.');
    expect(blocks[0]).toEqual({ type: 'paragraph', spans: [{ type: 'text', text: 'Deposits' }] });
  });
});
