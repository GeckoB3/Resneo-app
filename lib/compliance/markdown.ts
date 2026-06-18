/**
 * A deliberately tiny markdown → plain-text-lines renderer for compliance intro
 * text. The web sanitises a small markdown subset to HTML; React Native has no
 * HTML renderer, so we strip the common inline/structural syntax to readable
 * plain lines (bold/italic markers removed, list bullets normalised, links shown
 * as their label). This is presentation-only — author guidance, never trusted
 * markup — so it needs no sanitiser dependency.
 */

/** Strip inline markdown emphasis/code and unwrap links to their label. */
function stripInline(text: string): string {
  return text
    // [label](url) → label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // **bold** / __bold__ → bold
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    // *italic* / _italic_ → italic
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // `code` → code
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Render intro markdown to an array of plain-text lines suitable for a stack of
 * `<Text>` rows. Blank lines are dropped; list items get a leading bullet;
 * heading markers are stripped.
 */
export function renderInlineMarkdown(markdown: string): string[] {
  if (!markdown) return [];
  return markdown
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line) return null;
      // Unordered list item
      const ul = /^[-*+]\s+(.*)$/.exec(line);
      if (ul) return `•  ${stripInline(ul[1]!)}`;
      // Ordered list item
      const ol = /^(\d+)\.\s+(.*)$/.exec(line);
      if (ol) return `${ol[1]}.  ${stripInline(ol[2]!)}`;
      // Heading → bare text
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      if (h) return stripInline(h[1]!);
      return stripInline(line);
    })
    .filter((l): l is string => l !== null && l.length > 0);
}
