import { Platform, type TextInput } from 'react-native';

/**
 * Selects a field's text when it takes focus, so typing replaces a pre-filled value ("35.00", then
 * 5, gives 5, not 35.005). Call it from the field's onFocus, and pass `SELECT_TEXT_ON_FOCUS_PROP`
 * as its `selectTextOnFocus`, instead of setting that prop to true.
 *
 * On Android the prop also re-selects the text at the field's first layout pass after it takes
 * focus (ReactEditText.onLayout, once per mount). On an empty field that pass comes with the first
 * keystroke, because the line-height span makes a field with text a little taller than an empty
 * one: the first digit was selected and the second replaced it ("1" then "0" gave "0", found on a
 * Samsung, 2026-10-20). On iOS (new architecture) the prop selects only on a programmatic focus(),
 * never on a tap. Selecting from onFocus does neither: one selection, made as the field takes focus.
 */
export function selectAllOnFocus(input: TextInput | null, text: string | undefined): void {
  const length = text?.length ?? 0;
  // Optional call: the jest TextInput mock has no setSelection.
  if (Platform.OS !== 'web' && length > 0) input?.setSelection?.(0, length);
}

/** Web keeps the prop: react-native-web selects on focus itself and has no `setSelection`. */
export const SELECT_TEXT_ON_FOCUS_PROP = Platform.OS === 'web';
