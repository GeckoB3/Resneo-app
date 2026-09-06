/**
 * Server-sent events, parsed off a response body the app reads itself.
 *
 * `POST /api/venue/assistant` answers `text/event-stream` (EventSource cannot
 * POST, so the web reads the body with a stream reader and so do we). A frame
 * is a blank-line-separated block of `event:` / `data:` lines; a chunk of the
 * stream can end mid-frame, so the caller keeps the tail and feeds it back in
 * with the next chunk.
 *
 * Ported from the web's `parseSseFrames` in `src/components/assistant/
 * useAssistantChat.ts`, verbatim in behaviour so both clients read the same
 * stream the same way.
 */

export interface SseFrame {
  event: string;
  data: string;
}

export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const parts = buffer.split('\n\n');
  // The last part is either empty (the buffer ended on a frame boundary) or an
  // unfinished frame. Either way it goes back to the caller, never parsed here.
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) frames.push({ event, data: dataLines.join('\n') });
  }
  return { frames, rest };
}
