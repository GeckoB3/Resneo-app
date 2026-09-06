import { parseSseFrames } from '@/lib/assistant/sse';

describe('parseSseFrames', () => {
  it('reads complete frames and keeps the unfinished tail', () => {
    const { frames, rest } = parseSseFrames(
      'event: meta\ndata: {"conversationId":"c1"}\n\nevent: token\ndata: {"t":"He',
    );
    expect(frames).toEqual([{ event: 'meta', data: '{"conversationId":"c1"}' }]);
    expect(rest).toBe('event: token\ndata: {"t":"He');
  });

  it('finishes a frame that arrived across two chunks', () => {
    const first = parseSseFrames('event: token\ndata: {"t":"He');
    expect(first.frames).toEqual([]);
    const second = parseSseFrames(`${first.rest}llo"}\n\n`);
    expect(second.frames).toEqual([{ event: 'token', data: '{"t":"Hello"}' }]);
    expect(second.rest).toBe('');
  });

  it('joins multi-line data and defaults an unnamed event', () => {
    const { frames } = parseSseFrames('data: one\ndata: two\n\n');
    expect(frames).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('ignores a frame with no data line', () => {
    const { frames } = parseSseFrames(': keep-alive\n\nevent: done\ndata: {}\n\n');
    expect(frames).toEqual([{ event: 'done', data: '{}' }]);
  });
});
