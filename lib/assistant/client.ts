/**
 * The two Ask ResNeo calls, both on the app's Bearer token.
 *
 * `POST /api/venue/assistant` answers with server-sent events rather than JSON,
 * so it cannot go through `apiFetch` (which reads the whole body as text before
 * anything is shown). It uses `expo/fetch`, whose response body is a real
 * `ReadableStream` on iOS and Android — React Native's own fetch buffers, and a
 * buffered answer is a blank screen for the length of the answer.
 *
 * Everything else `apiFetch` does is kept: the Bearer header, and one refresh
 * and retry on a 401, which is what makes the first question after the app
 * resumes work instead of failing (see `refreshExpiredAccessToken`).
 */
import { fetch as streamingFetch } from 'expo/fetch';

import { apiFetch, refreshExpiredAccessToken } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';

import { ASSISTANT_COPY } from './copy';
import { parseSseFrames } from './sse';

/** The server's schema: `assistantRequestSchema` in the web repo. */
export const MAX_MESSAGE_CHARS = 2000;
/** The server keeps the last eleven turns; sending more is wasted bytes. */
export const HISTORY_LIMIT = 11;

export type AssistantBlockedReason = 'rate_limited' | 'daily_cap' | 'unavailable' | null;

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A request that never became a stream. `blocked` carries the three states the
 * screen treats as more than a failed answer: too many questions just now, the
 * venue's day is used up, and the assistant being switched off for this venue
 * (which the route answers as a 404, because while it is off it does not
 * exist).
 */
export class AssistantRequestError extends Error {
  constructor(
    message: string,
    readonly blocked: AssistantBlockedReason,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AssistantRequestError';
  }
}

export interface AssistantStreamHandlers {
  /** The conversation id, on the first frame, so follow-up turns join it. */
  onConversation?: (conversationId: string) => void;
  onToken: (token: string) => void;
  onDone: (result: {
    assistantMessageId: string | null;
    text: string | null;
    citations: string[];
    answered: boolean;
  }) => void;
  /** The server gave up mid-answer; the text so far stays on screen. */
  onError: (message: string) => void;
}

export interface AssistantStreamOptions {
  accessToken: string;
  messages: AssistantTurn[];
  conversationId?: string | null;
  signal: AbortSignal;
  handlers: AssistantStreamHandlers;
}

function blockedReasonFor(status: number, code: unknown): AssistantBlockedReason {
  if (status === 429) return code === 'daily_cap' ? 'daily_cap' : 'rate_limited';
  if (status === 404) return 'unavailable';
  return null;
}

function noticeFor(blocked: AssistantBlockedReason, fallback: string | undefined): string {
  switch (blocked) {
    case 'daily_cap':
      return ASSISTANT_COPY.dailyCap;
    case 'rate_limited':
      return ASSISTANT_COPY.rateLimited;
    case 'unavailable':
      return ASSISTANT_COPY.unavailable;
    default:
      return fallback?.trim() || ASSISTANT_COPY.error;
  }
}

async function postAssistant(
  accessToken: string,
  body: string,
  signal: AbortSignal,
): Promise<Response> {
  return streamingFetch(`${getApiUrl()}/api/venue/assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body,
    signal,
  }) as unknown as Promise<Response>;
}

/**
 * Ask a question and feed the answer back token by token. Resolves when the
 * stream ends; rejects with `AssistantRequestError` when there was no stream to
 * read, and with the abort error when the person pressed Stop.
 */
export async function streamAssistantAnswer({
  accessToken,
  messages,
  conversationId,
  signal,
  handlers,
}: AssistantStreamOptions): Promise<void> {
  const body = JSON.stringify({
    ...(conversationId ? { conversationId } : {}),
    messages: messages.slice(-HISTORY_LIMIT),
    client: 'app',
  });

  let token = accessToken;
  let response = await postAssistant(token, body, signal);
  if (response.status === 401) {
    // The same recovery `apiFetch` runs: a token that expired while the app was
    // in the background is refreshed once, and only a genuinely dead session
    // reaches the screen as an error.
    const refreshed = await refreshExpiredAccessToken(token);
    if (refreshed) {
      token = refreshed;
      response = await postAssistant(token, body, signal);
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    const blocked = blockedReasonFor(response.status, payload.code);
    throw new AssistantRequestError(
      noticeFor(blocked, payload.error),
      blocked,
      response.status,
    );
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const consume = (chunk: string) => {
    buffer += chunk;
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;
    for (const frame of parsed.frames) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(frame.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (frame.event === 'meta') {
        const id = typeof data.conversationId === 'string' ? data.conversationId : null;
        if (id) handlers.onConversation?.(id);
      } else if (frame.event === 'token') {
        const t = typeof data.t === 'string' ? data.t : '';
        if (t) handlers.onToken(t);
      } else if (frame.event === 'done') {
        handlers.onDone({
          assistantMessageId:
            typeof data.assistantMessageId === 'string' ? data.assistantMessageId : null,
          text: typeof data.text === 'string' ? data.text : null,
          citations: Array.isArray(data.citations) ? (data.citations as string[]) : [],
          answered: data.answered !== false,
        });
      } else if (frame.event === 'error') {
        handlers.onError(typeof data.message === 'string' ? data.message : ASSISTANT_COPY.error);
      }
    }
  };

  const reader = response.body?.getReader?.();
  if (!reader) {
    // No stream to read (the web preview, or a test double): the answer still
    // arrives, just all at once rather than as it is written.
    consume(await response.text());
    return;
  }

  for (;;) {
    const chunk = await reader.read();
    if (chunk.value) consume(decoder.decode(chunk.value, { stream: true }));
    if (chunk.done) break;
  }
}

/**
 * Thumbs up or down on one answer. Best effort, like the web's: a rating that
 * does not save changes nothing the person can see, so it never surfaces.
 */
export async function sendAssistantFeedback(input: {
  accessToken: string;
  messageId: string;
  rating: 1 | -1;
  comment?: string;
}): Promise<void> {
  try {
    await apiFetch<null>('/api/venue/assistant/feedback', {
      accessToken: input.accessToken,
      method: 'POST',
      body: JSON.stringify({
        messageId: input.messageId,
        rating: input.rating,
        ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
      }),
    });
  } catch {
    /* feedback is best effort */
  }
}
