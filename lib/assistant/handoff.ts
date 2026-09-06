/**
 * Carrying an Ask ResNeo conversation into the Support form.
 *
 * The web writes the transcript to sessionStorage and navigates to
 * /dashboard/support, which reads it once on mount. The app does the same with
 * a module-level value rather than storage: the two screens are in one process,
 * the handoff should not outlive the navigation, and a 5,000 character message
 * has no business travelling as a route parameter.
 *
 * `buildHandoffMessage` is the web's, verbatim, so a question that reaches
 * support from either client reads the same to whoever answers it.
 */
import { ASSISTANT_COPY } from './copy';

/** The Support route accepts at most this many characters in the message. */
export const SUPPORT_MESSAGE_MAX = 5000;

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantHandoff {
  subject: string;
  message: string;
}

export function buildHandoffMessage(turns: TranscriptTurn[]): string {
  const lines: string[] = [
    'I asked Ask ResNeo and did not get what I needed. Here is the conversation:',
    '',
  ];
  for (const t of turns) {
    lines.push(t.role === 'user' ? `Me: ${t.content.trim()}` : `Ask ResNeo: ${t.content.trim()}`);
    lines.push('');
  }
  lines.push('What I still need help with:');
  lines.push('');
  const text = lines.join('\n');
  if (text.length <= SUPPORT_MESSAGE_MAX) return text;
  const marker = '\n[conversation shortened]\n';
  return text.slice(0, SUPPORT_MESSAGE_MAX - marker.length) + marker;
}

let pending: AssistantHandoff | null = null;

/** Park a transcript for the Support screen to pick up on its next mount. */
export function writeHandoff(turns: TranscriptTurn[]): void {
  pending = { subject: ASSISTANT_COPY.handoffSubject, message: buildHandoffMessage(turns) };
}

/**
 * Take the parked transcript, if there is one. Reading clears it, so a later
 * visit to Support opens blank rather than re-filling an old conversation.
 */
export function takeHandoff(): AssistantHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}
