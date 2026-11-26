import { ApiError } from '@/lib/api/client';
import {
  createBookPressKey,
  isBookRequestReused,
  isCreateInProgress,
  keepsBookRequestId,
  serverBooksOnce,
} from '@/lib/booking/book-once';

let n = 0;
const mint = () => `key-${++n}`;

beforeEach(() => {
  n = 0;
});

const timeout = () => new ApiError('Request timed out. Check your connection and try again.', 408);
const inProgress = () => new ApiError('Still being made.', 409, { error: 'Still being made.', code: 'CREATE_IN_PROGRESS' });
const slotTaken = () => new ApiError('That time has gone.', 409, { error: 'That time has gone.', code: 'SLOT_TAKEN' });

describe('createBookPressKey', () => {
  it('sends the same key after a timeout, and a new one once the booking is made', async () => {
    const press = createBookPressKey(mint);
    const sent: string[] = [];
    const call = jest.fn(async (body: { client_request_id: string }) => {
      sent.push(body.client_request_id);
      if (sent.length === 1) throw timeout();
      return { booking_id: 'b1' };
    });
    await expect(press.send({ a: 1 }, call)).rejects.toBeInstanceOf(ApiError);
    await press.send({ a: 1 }, call);
    await press.send({ a: 1 }, call);
    expect(sent).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('keeps the key while the first is still being made, and drops it after a refusal', async () => {
    const press = createBookPressKey(mint);
    const sent: string[] = [];
    const answers = [inProgress(), slotTaken()];
    const call = async (body: { client_request_id: string }) => {
      sent.push(body.client_request_id);
      const next = answers.shift();
      if (next) throw next;
      return 'ok';
    };
    await expect(press.send({ a: 1 }, call)).rejects.toThrow();
    await expect(press.send({ a: 1 }, call)).rejects.toThrow();
    await press.send({ a: 1 }, call);
    expect(sent).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('a changed payload is a new press', async () => {
    const press = createBookPressKey(mint);
    const sent: string[] = [];
    const call = async (body: { client_request_id: string }) => {
      sent.push(body.client_request_id);
      throw timeout();
    };
    await expect(press.send({ a: 1 }, call)).rejects.toThrow();
    await expect(press.send({ a: 2 }, call)).rejects.toThrow();
    expect(sent).toEqual(['key-1', 'key-2']);
  });

  it('sends the payload as it was, with the key added', async () => {
    const call = jest.fn(async (body: object) => body);
    await expect(createBookPressKey(mint).send({ booking_date: '2026-12-01' }, call)).resolves.toEqual({
      booking_date: '2026-12-01',
      client_request_id: 'key-1',
    });
  });
});

describe('the answers', () => {
  it('keeps the key on no answer, a timeout, a server error other than 502, or still being made', () => {
    expect(keepsBookRequestId(new ApiError('Network', 0))).toBe(true);
    expect(keepsBookRequestId(timeout())).toBe(true);
    expect(keepsBookRequestId(new ApiError('x', 500))).toBe(true);
    expect(keepsBookRequestId(new ApiError('x', 502))).toBe(false);
    expect(keepsBookRequestId(inProgress())).toBe(true);
    expect(keepsBookRequestId(slotTaken())).toBe(false);
    expect(keepsBookRequestId(new Error('boom'))).toBe(true);
  });

  it('reads the two book-once codes', () => {
    expect(isCreateInProgress(inProgress())).toBe(true);
    expect(isCreateInProgress(slotTaken())).toBe(false);
    expect(isBookRequestReused(new ApiError('x', 409, { error: 'x', code: 'REQUEST_REUSED' }))).toBe(true);
  });

  it('books once only when the server says so', () => {
    expect(serverBooksOnce({ server_features: { book_once: true } })).toBe(true);
    expect(serverBooksOnce({})).toBe(false);
    expect(serverBooksOnce(undefined)).toBe(false);
  });
});
