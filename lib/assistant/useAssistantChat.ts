/**
 * Client state for one Ask ResNeo conversation — the app's port of the web's
 * `useAssistantChat`.
 *
 * Same shape of state, same rules: the answer arrives token by token into a
 * pending assistant turn, a refusal that is not an answer (rate limit, the
 * venue's daily cap, the assistant switched off) removes that turn and shows a
 * notice instead, and Stop leaves whatever had arrived on screen.
 *
 * The conversation survives leaving the screen, the way the web's survives
 * closing the drawer: it is kept in this module between mounts rather than in
 * storage, so it lasts as long as the app is running and no longer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAccessToken } from '@/lib/queries/useAccessToken';

import {
  AssistantRequestError,
  HISTORY_LIMIT,
  sendAssistantFeedback,
  streamAssistantAnswer,
  type AssistantBlockedReason,
  type AssistantTurn,
} from './client';
import { ASSISTANT_COPY } from './copy';

export interface AssistantChatMessage {
  /** Local id, stable for list keys. */
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Row id in `assistant_messages`, or null when the server was not logging. */
  serverId?: string | null;
  citations?: string[];
  answered?: boolean;
  rating?: 1 | -1 | null;
  /** Set on an assistant turn that failed. */
  error?: string | null;
  /** The person pressed Stop before the answer finished. */
  stopped?: boolean;
  /** Still streaming. */
  pending?: boolean;
}

export interface AssistantChatState {
  conversationId: string | null;
  messages: AssistantChatMessage[];
  status: 'idle' | 'streaming';
  blocked: AssistantBlockedReason;
  notice: string | null;
}

const EMPTY: AssistantChatState = {
  conversationId: null,
  messages: [],
  status: 'idle',
  blocked: null,
  notice: null,
};

/** What a remount picks up: the finished turns and the conversation they belong to. */
let kept: Pick<AssistantChatState, 'conversationId' | 'messages'> = {
  conversationId: null,
  messages: [],
};

/** Test hook: forget the kept conversation. */
export function resetKeptAssistantConversation(): void {
  kept = { conversationId: null, messages: [] };
}

function localId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The turns that go back to the server as history. */
function historyOf(messages: AssistantChatMessage[]): AssistantTurn[] {
  return messages
    .filter((m) => !m.pending && !m.error && m.content.trim().length > 0)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function useAssistantChat() {
  const accessToken = useAccessToken();
  const [state, setState] = useState<AssistantChatState>(() => ({ ...EMPTY, ...kept }));
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
    // Keep the finished conversation between mounts, never a half-streamed turn.
    if (state.status === 'idle') {
      kept = {
        conversationId: state.conversationId,
        messages: state.messages.filter((m) => !m.pending),
      };
    }
  }, [state]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const patchMessage = useCallback(
    (
      id: string,
      patch:
        | Partial<AssistantChatMessage>
        | ((m: AssistantChatMessage) => Partial<AssistantChatMessage>),
    ) => {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m,
        ),
      }));
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || abortRef.current) return;
      if (!accessToken) {
        setState((prev) => ({ ...prev, notice: ASSISTANT_COPY.error }));
        return;
      }

      const current = stateRef.current;
      const userMessage: AssistantChatMessage = { id: localId(), role: 'user', content: question };
      const assistantMessage: AssistantChatMessage = {
        id: localId(),
        role: 'assistant',
        content: '',
        pending: true,
      };
      const history = [...historyOf(current.messages), { role: 'user' as const, content: question }];
      const conversationId = current.conversationId;

      setState((prev) => ({
        ...prev,
        status: 'streaming',
        blocked: null,
        notice: null,
        messages: [...prev.messages.filter((m) => !m.pending), userMessage, assistantMessage],
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamAssistantAnswer({
          accessToken,
          messages: history,
          conversationId,
          signal: controller.signal,
          handlers: {
            onConversation: (id) => setState((prev) => ({ ...prev, conversationId: id })),
            onToken: (t) => patchMessage(assistantMessage.id, (m) => ({ content: m.content + t })),
            onDone: (result) =>
              patchMessage(assistantMessage.id, (m) => ({
                content: result.text ?? m.content,
                serverId: result.assistantMessageId,
                citations: result.citations,
                answered: result.answered,
                pending: false,
              })),
            onError: (message) =>
              patchMessage(assistantMessage.id, { error: message, pending: false }),
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          patchMessage(assistantMessage.id, (m) => ({
            pending: false,
            stopped: true,
            error: m.content ? null : ASSISTANT_COPY.stoppedEmpty,
          }));
        } else if (error instanceof AssistantRequestError) {
          // Not an answer at all: drop the empty turn and say why, so the
          // question the person typed is not left looking answered.
          setState((prev) => ({
            ...prev,
            blocked: error.blocked,
            notice: error.message,
            messages: prev.messages.filter((m) => m.id !== assistantMessage.id),
          }));
        } else {
          patchMessage(assistantMessage.id, { error: ASSISTANT_COPY.error, pending: false });
        }
      } finally {
        abortRef.current = null;
        setState((prev) => ({
          ...prev,
          status: 'idle',
          messages: prev.messages.map((m) =>
            m.id === assistantMessage.id && m.pending ? { ...m, pending: false } : m,
          ),
        }));
      }
    },
    [accessToken, patchMessage],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    kept = { conversationId: null, messages: [] };
    setState(EMPTY);
  }, []);

  const rate = useCallback(
    async (id: string, rating: 1 | -1, comment?: string) => {
      const serverId = stateRef.current.messages.find((m) => m.id === id)?.serverId;
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.id === id ? { ...m, rating } : m)),
      }));
      if (!serverId || !accessToken) return;
      await sendAssistantFeedback({ accessToken, messageId: serverId, rating, comment });
    },
    [accessToken],
  );

  return { state, send, stop, reset, rate };
}
