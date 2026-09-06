import {
  buildHandoffMessage,
  SUPPORT_MESSAGE_MAX,
  takeHandoff,
  writeHandoff,
} from '@/lib/assistant/handoff';

describe('buildHandoffMessage', () => {
  it('labels each turn so support can read the conversation', () => {
    const message = buildHandoffMessage([
      { role: 'user', content: 'How do I refund a deposit?' },
      { role: 'assistant', content: 'Open the booking and press Refund.' },
    ]);
    expect(message).toContain('Me: How do I refund a deposit?');
    expect(message).toContain('Ask ResNeo: Open the booking and press Refund.');
    expect(message.trimEnd().endsWith('What I still need help with:')).toBe(true);
  });

  it('stays within what the Support route accepts', () => {
    const long = 'x'.repeat(SUPPORT_MESSAGE_MAX);
    const message = buildHandoffMessage([{ role: 'user', content: long }]);
    expect(message.length).toBeLessThanOrEqual(SUPPORT_MESSAGE_MAX);
    expect(message).toContain('[conversation shortened]');
  });
});

describe('takeHandoff', () => {
  it('hands the parked transcript over once', () => {
    writeHandoff([{ role: 'user', content: 'Anything' }]);
    const first = takeHandoff();
    expect(first?.subject).toBe('Question from Ask ResNeo');
    expect(first?.message).toContain('Me: Anything');
    // Reading clears it: a later visit to Support opens blank.
    expect(takeHandoff()).toBeNull();
  });
});
