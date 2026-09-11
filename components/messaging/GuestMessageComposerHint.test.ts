import { composerCountLabel, smsSegments } from '@/components/messaging/GuestMessageComposerHint';

/** The counter under a custom message (web 2026-09-10): characters, texts, and the cut-short warning. */
describe('composerCountLabel', () => {
  it('counts characters alone for an email', () => {
    expect(composerCountLabel('Hello there', 'email')).toEqual({ text: '11 characters', warn: false });
  });

  it('adds the number of texts when SMS is a channel', () => {
    expect(composerCountLabel('Hello there', 'sms').text).toBe('11 characters · about 1 text');
    expect(composerCountLabel('x'.repeat(200), 'both').text).toBe('200 characters · about 2 texts');
  });

  it('warns when the SMS budget (three segments) is nearly used up', () => {
    const long = 'x'.repeat(430);
    const out = composerCountLabel(long, 'sms');
    expect(out.warn).toBe(true);
    expect(out.text).toContain('(SMS will be cut short)');
    expect(composerCountLabel(long, 'email').warn).toBe(false);
  });

  it('never reports zero texts', () => {
    expect(smsSegments('')).toBe(1);
  });
});
