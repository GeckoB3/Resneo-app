/**
 * The Ask ResNeo request: what reaches the screen when the answer streams, and
 * the three refusals that are not answers (rate limit, the venue's daily cap,
 * and the assistant being switched off, which the route answers as a 404).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
const mockStreamingFetch = jest.fn();
jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockStreamingFetch(...args),
}));

jest.mock('@/lib/env', () => ({
  getApiUrl: () => 'https://api.test',
}));

const mockRefresh = jest.fn();
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  refreshExpiredAccessToken: (...args: unknown[]) => mockRefresh(...args),
}));

import {
  AssistantRequestError,
  streamAssistantAnswer,
  type AssistantStreamHandlers,
} from '@/lib/assistant/client';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';

/** A response whose body hands back the given text in the given chunks. */
function streamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: encoder.encode(chunks[index++]!) }
            : { done: true, value: undefined },
      }),
    },
  };
}

function refusal(status: number, body: Record<string, unknown>) {
  return { ok: false, status, json: async () => body };
}

function handlers(): AssistantStreamHandlers & {
  tokens: string[];
  done: unknown[];
  errors: string[];
  conversationIds: string[];
} {
  const tokens: string[] = [];
  const done: unknown[] = [];
  const errors: string[] = [];
  const conversationIds: string[] = [];
  return {
    tokens,
    done,
    errors,
    conversationIds,
    onConversation: (id) => conversationIds.push(id),
    onToken: (t) => tokens.push(t),
    onDone: (result) => done.push(result),
    onError: (message) => errors.push(message),
  };
}

const BASE = {
  accessToken: 'token-1',
  messages: [{ role: 'user' as const, content: 'How do I add a calendar?' }],
  signal: new AbortController().signal,
};

beforeEach(() => {
  mockStreamingFetch.mockReset();
  mockRefresh.mockReset();
});

describe('streamAssistantAnswer', () => {
  it('feeds the answer back token by token, across chunk boundaries', async () => {
    mockStreamingFetch.mockResolvedValue(
      streamingResponse([
        'event: meta\ndata: {"conversationId":"c-1"}\n\nevent: token\ndata: {"t":"Open "}\n\nevent: to',
        'ken\ndata: {"t":"Settings."}\n\nevent: done\ndata: {"assistantMessageId":"m-1","text":"Open Settings.","citations":["settings/calendars"],"answered":true}\n\n',
      ]),
    );
    const h = handlers();
    await streamAssistantAnswer({ ...BASE, handlers: h });

    expect(h.conversationIds).toEqual(['c-1']);
    expect(h.tokens).toEqual(['Open ', 'Settings.']);
    expect(h.done).toEqual([
      {
        assistantMessageId: 'm-1',
        text: 'Open Settings.',
        citations: ['settings/calendars'],
        answered: true,
      },
    ]);
    expect(h.errors).toEqual([]);
  });

  it('tells the server it is the app, and sends the Bearer', async () => {
    mockStreamingFetch.mockResolvedValue(streamingResponse([]));
    await streamAssistantAnswer({ ...BASE, conversationId: 'c-9', handlers: handlers() });

    const [url, init] = mockStreamingFetch.mock.calls[0]!;
    expect(url).toBe('https://api.test/api/venue/assistant');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body)).toEqual({
      conversationId: 'c-9',
      messages: BASE.messages,
      client: 'app',
    });
  });

  it('reads a body that does not stream, all at once', async () => {
    mockStreamingFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => 'event: token\ndata: {"t":"Hi"}\n\n',
    });
    const h = handlers();
    await streamAssistantAnswer({ ...BASE, handlers: h });
    expect(h.tokens).toEqual(['Hi']);
  });

  it("names the venue's daily cap rather than a generic failure", async () => {
    mockStreamingFetch.mockResolvedValue(refusal(429, { code: 'daily_cap', error: 'nope' }));
    await expect(streamAssistantAnswer({ ...BASE, handlers: handlers() })).rejects.toMatchObject({
      blocked: 'daily_cap',
      message: ASSISTANT_COPY.dailyCap,
    });
  });

  it('reads a 429 without a code as the short-term rate limit', async () => {
    mockStreamingFetch.mockResolvedValue(refusal(429, {}));
    await expect(streamAssistantAnswer({ ...BASE, handlers: handlers() })).rejects.toMatchObject({
      blocked: 'rate_limited',
      message: ASSISTANT_COPY.rateLimited,
    });
  });

  it('reads the route not existing as the assistant being switched off', async () => {
    mockStreamingFetch.mockResolvedValue(refusal(404, { error: 'Not found' }));
    const error = await streamAssistantAnswer({ ...BASE, handlers: handlers() }).catch((e) => e);
    expect(error).toBeInstanceOf(AssistantRequestError);
    expect(error.blocked).toBe('unavailable');
    expect(error.message).toBe(ASSISTANT_COPY.unavailable);
  });

  it('refreshes an expired token once and asks again', async () => {
    mockStreamingFetch
      .mockResolvedValueOnce(refusal(401, { error: 'Unauthorised' }))
      .mockResolvedValueOnce(streamingResponse(['event: token\ndata: {"t":"Back"}\n\n']));
    mockRefresh.mockResolvedValue('token-2');

    const h = handlers();
    await streamAssistantAnswer({ ...BASE, handlers: h });

    expect(mockRefresh).toHaveBeenCalledWith('token-1');
    expect(mockStreamingFetch.mock.calls[1]![1].headers.Authorization).toBe('Bearer token-2');
    expect(h.tokens).toEqual(['Back']);
  });

  it('gives up on a 401 the refresh cannot fix', async () => {
    mockStreamingFetch.mockResolvedValue(refusal(401, { error: 'Unauthorised' }));
    mockRefresh.mockResolvedValue(null);
    await expect(streamAssistantAnswer({ ...BASE, handlers: handlers() })).rejects.toMatchObject({
      status: 401,
      blocked: null,
    });
    expect(mockStreamingFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a mid-stream failure without losing what had arrived', async () => {
    mockStreamingFetch.mockResolvedValue(
      streamingResponse([
        'event: token\ndata: {"t":"Half "}\n\nevent: error\ndata: {"message":"Something went wrong."}\n\n',
      ]),
    );
    const h = handlers();
    await streamAssistantAnswer({ ...BASE, handlers: h });
    expect(h.tokens).toEqual(['Half ']);
    expect(h.errors).toEqual(['Something went wrong.']);
  });
});
