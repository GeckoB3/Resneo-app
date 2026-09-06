/**
 * The little bit of markdown an Ask ResNeo answer is allowed to be, parsed into
 * blocks and spans a React Native view can draw.
 *
 * The web renders the same answers with `marked` + `sanitize-html`
 * (`src/components/assistant/AssistantMarkdown.tsx`). There is no HTML renderer
 * here, so this parses the subset the prompt actually asks the model for:
 * numbered steps, bullets, bold names of screens and buttons, and links. The
 * href allowlist is the web's, verbatim: a link may point only at a help page,
 * a dashboard page or a listed YouTube video, and anything else is rendered as
 * its plain label. The route already strips links to pages that do not exist
 * (`postprocessAnswer`); this is the second gate, and the only one running on a
 * half-streamed answer.
 *
 * Headings, tables and code blocks are not in the format the model is given.
 * They are still handled, as a plain paragraph, rather than shown as syntax.
 */

export type AssistantSpan =
  | { type: 'text'; text: string; bold?: boolean }
  | { type: 'link'; text: string; href: string };

export type AssistantBlock =
  | { type: 'paragraph'; spans: AssistantSpan[] }
  /** A numbered step ("1.") or a bullet ("•"); `marker` is what to draw. */
  | { type: 'listItem'; marker: string; spans: AssistantSpan[] };

const LINK = /\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const BOLD = /(\*\*|__)(.+?)\1/g;
const YOUTUBE = /^https:\/\/(www\.)?(youtu\.be|youtube\.com)\//;
const ORDERED = /^\s{0,3}(\d{1,2})[.)]\s+(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

/**
 * Whether a link is one we will let the person tap. The web's rule, unchanged:
 * help pages, dashboard pages, and YouTube. Everything else (including any
 * `http:` or app-scheme URL the model might invent) is not a link.
 */
export function isRenderableHref(href: string | undefined | null): boolean {
  if (!href) return false;
  const target = href.trim();
  if (target.startsWith('/help/') || target.startsWith('/dashboard')) return true;
  return YOUTUBE.test(target);
}

/**
 * Remove the inline markers we do not render: inline code, and `*italic*` as a
 * matched pair. Underscores are left exactly as written — an unpaired strip
 * would eat the ones inside a wire name like `booking_time`, which an answer
 * about a field may well quote.
 */
function stripMarkers(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
}

/** Split a run of plain text into bold and non-bold spans. */
function parseEmphasis(text: string): AssistantSpan[] {
  const spans: AssistantSpan[] = [];
  let lastIndex = 0;
  BOLD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOLD.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = stripMarkers(text.slice(lastIndex, match.index));
      if (before) spans.push({ type: 'text', text: before });
    }
    const bold = stripMarkers(match[2] ?? '');
    if (bold) spans.push({ type: 'text', text: bold, bold: true });
    lastIndex = match.index + match[0].length;
  }
  const tail = stripMarkers(text.slice(lastIndex));
  if (tail) spans.push({ type: 'text', text: tail });
  return spans;
}

/** One line of answer text as spans: links first, then emphasis in the gaps. */
export function parseAssistantInline(text: string): AssistantSpan[] {
  const spans: AssistantSpan[] = [];
  let lastIndex = 0;
  LINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK.exec(text)) !== null) {
    if (match.index > lastIndex) spans.push(...parseEmphasis(text.slice(lastIndex, match.index)));
    const label = stripMarkers((match[1] ?? '').replace(BOLD, '$2')).trim();
    const href = (match[2] ?? '').trim();
    if (label) {
      // A link we will not open becomes its own label, which is what the web's
      // sanitiser does with one: the words stay, the target goes.
      if (isRenderableHref(href)) spans.push({ type: 'link', text: label, href });
      else spans.push({ type: 'text', text: label });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) spans.push(...parseEmphasis(text.slice(lastIndex)));
  return spans;
}

/**
 * Parse a whole answer. Safe to call on a half-streamed one: an unfinished
 * link or bold marker simply renders as the text it is so far, and settles as
 * the rest of the token arrives.
 */
export function parseAssistantMarkdown(markdown: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const spans = parseAssistantInline(paragraph.join(' '));
    if (spans.length) blocks.push({ type: 'paragraph', spans });
    paragraph = [];
  };

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      flush();
      const spans = parseAssistantInline(ordered[2] ?? '');
      if (spans.length) blocks.push({ type: 'listItem', marker: `${ordered[1]}.`, spans });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const spans = parseAssistantInline(bullet[1] ?? '');
      if (spans.length) blocks.push({ type: 'listItem', marker: '•', spans });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const spans = parseAssistantInline(heading[1] ?? '');
      if (spans.length) blocks.push({ type: 'paragraph', spans });
      continue;
    }

    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
