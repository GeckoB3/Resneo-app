/**
 * The shape of an Ask ResNeo answer, at the widths the app actually runs at.
 *
 * The bug this guards: the answer bubble used to be shrink-to-fit with a
 * percentage cap. A step's text is `flex: 1` inside its row, which contributes
 * nothing to an intrinsic width, so a bubble sized by its content collapsed to
 * the longest plain line it happened to hold. On a phone that line was usually
 * wider than the screen, so the cap took over and nobody saw it; on a tablet
 * there was room to spare and the same answer drew itself in a phone-wide
 * column — with the feedback row underneath it covered by the overflowing text
 * on the native layout engine, which had measured the answer at one width and
 * drawn it at another.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { AssistantMessageList } from '@/components/assistant/AssistantMessageList';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';
import type { AssistantChatMessage } from '@/lib/assistant/useAssistantChat';

/** An answer that is nothing but steps — the shape that used to collapse. */
const STEPS: AssistantChatMessage[] = [
  { id: 'u1', role: 'user', content: 'How do I add a deposit?' },
  {
    id: 'a1',
    role: 'assistant',
    serverId: 'm-1',
    content: 'Here is how:\n\n1. Open **Services**.\n2. Switch on **Require a deposit**.',
  },
];

async function renderList(messages: AssistantChatMessage[] = STEPS) {
  return await render(
    <AssistantMessageList
      messages={messages}
      onRate={jest.fn()}
      onSendToSupport={jest.fn()}
      onPressLink={jest.fn()}
    />,
  );
}

describe('AssistantMessageList layout', () => {
  it('gives the answer a definite width instead of sizing it to its content', async () => {
    await renderList();
    const style = StyleSheet.flatten(screen.getByTestId('assistant-answer').props.style);

    // Stretched, so the width is known before the text is measured.
    expect(style.alignSelf).toBe('stretch');
    // A percentage cap here is the old bug: it only bites once the content has
    // already decided how wide the bubble is.
    expect(style.maxWidth).toBeUndefined();
  });

  it('keeps the feedback row and the support link in a row that wraps rather than overflows', async () => {
    await renderList();
    // The row is the parent the feedback prompt and the support link share.
    const actions = screen.getByText(ASSISTANT_COPY.sendToSupport).parent?.parent;
    const style = StyleSheet.flatten(actions?.props.style);

    expect(style.flexDirection).toBe('row');
    expect(style.flexWrap).toBe('wrap');
    // Space-between rather than an auto margin: an auto margin inside a
    // wrapping row is what let the support link drift under the answer.
    expect(style.justifyContent).toBe('space-between');
  });

  it('shows both halves of the footer under a finished answer', async () => {
    await renderList();
    expect(screen.getByText(ASSISTANT_COPY.feedbackPrompt)).toBeTruthy();
    expect(screen.getByLabelText('Yes, this was helpful')).toBeTruthy();
    expect(screen.getByLabelText('No, this was not helpful')).toBeTruthy();
    expect(screen.getByText(ASSISTANT_COPY.sendToSupport)).toBeTruthy();
  });

  it('still offers Support on an answer the server never logged, with nothing to rate', async () => {
    await renderList([{ id: 'a1', role: 'assistant', content: 'Sorry, I could not find that.' }]);

    expect(screen.queryByText(ASSISTANT_COPY.feedbackPrompt)).toBeNull();
    expect(screen.getByText(ASSISTANT_COPY.sendToSupport)).toBeTruthy();
  });
});
