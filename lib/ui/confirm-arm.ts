/**
 * How long a two-tap destructive button stays armed.
 *
 * Cancel booking, Remove closure, Delete permanently, Erase data and the rest
 * ask by flipping their own label to "Tap to confirm" rather than opening a
 * dialog, then disarming themselves so an armed destructive button is never
 * left sitting under a thumb. At four seconds the window closed while the
 * reader was still reading it — often enough on a device to have to start again
 * (device test, 2026-09-12).
 *
 * Eight is long enough to read the question, look away and come back, and short
 * enough that the button is disarmed well before the phone is put down. One
 * constant so every one of them behaves the same: three screens had grown their
 * own copy of the number.
 */
export const CONFIRM_ARM_MS = 8000;
