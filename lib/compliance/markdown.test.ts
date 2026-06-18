import { renderInlineMarkdown } from '@/lib/compliance/markdown';

describe('renderInlineMarkdown', () => {
  it('returns an empty array for empty input', () => {
    expect(renderInlineMarkdown('')).toEqual([]);
  });

  it('strips emphasis and code markers', () => {
    expect(renderInlineMarkdown('**bold** and _italic_ and `code`')).toEqual([
      'bold and italic and code',
    ]);
  });

  it('unwraps links to their label', () => {
    expect(renderInlineMarkdown('See [our policy](https://example.com).')).toEqual([
      'See our policy.',
    ]);
  });

  it('normalises list bullets and ordered items', () => {
    expect(renderInlineMarkdown('- first\n- second')).toEqual(['•  first', '•  second']);
    expect(renderInlineMarkdown('1. one\n2. two')).toEqual(['1.  one', '2.  two']);
  });

  it('strips heading markers and drops blank lines', () => {
    expect(renderInlineMarkdown('# Heading\n\nbody')).toEqual(['Heading', 'body']);
  });
});
