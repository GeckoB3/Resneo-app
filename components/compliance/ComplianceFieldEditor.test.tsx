import { useReducer } from 'react';
import { Text } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ComplianceFieldEditor } from '@/components/compliance/ComplianceFieldEditor';
import {
  emptyBuilderState,
  fieldBuilderReducer,
  type FieldBuilderState,
} from '@/lib/compliance/field-builder';

/**
 * Render + interaction test for the mobile field builder. It's a controlled
 * component over the pure `fieldBuilderReducer`, so a tiny harness wires the
 * reducer and we drive the UI: add from the palette, edit a label, reorder, and
 * confirm the pass/fail ResultMappingEditor appears only for `pass_fail`.
 *
 * Presses are wrapped in `await act(...)` so the reducer dispatch + re-render
 * flushes before assertions (RTL press/act flush, per project memory).
 */
async function press(el: Parameters<typeof fireEvent.press>[0]) {
  // fireEvent is async in RNTL v14 and wraps itself in act: await it so it cannot overlap the next step.
  await fireEvent.press(el);
}

function Harness({
  initial = emptyBuilderState,
  isPassFail = false,
}: {
  initial?: FieldBuilderState;
  isPassFail?: boolean;
}) {
  const [state, dispatch] = useReducer(fieldBuilderReducer, initial);
  return (
    <>
      <ComplianceFieldEditor state={state} dispatch={dispatch} isPassFail={isPassFail} />
      {/* The builder's result mapping, so a test can see what a rename did to it. */}
      <Text testID="mapping-json">{JSON.stringify(state.resultMapping ?? null)}</Text>
    </>
  );
}

describe('ComplianceFieldEditor', () => {
  it('adds a field from the palette', async () => {
    await render(<Harness />);
    expect(screen.getByText('No fields yet. Add one from the palette above.')).toBeTruthy();

    await press(screen.getByText('+ Short text'));

    // The empty-state line is gone and a labelled "Question label" input appears.
    expect(screen.queryByText('No fields yet. Add one from the palette above.')).toBeNull();
    expect(screen.getByText('Question label')).toBeTruthy();
  });

  it('edits a field label', async () => {
    await render(<Harness />);
    await press(screen.getByText('+ Short text'));

    const labelInput = screen.getByDisplayValue('New field');
    await act(async () => {
      fireEvent.changeText(labelInput, 'Full name');
    });
    expect(screen.getByDisplayValue('Full name')).toBeTruthy();
  });

  it('reorders fields with the up/down controls', async () => {
    await render(<Harness />);
    await press(screen.getByText('+ Short text'));
    await press(screen.getByText('+ Date'));

    // Two field cards, labelled "New field". Rename them so we can track order.
    const inputs = screen.getAllByDisplayValue('New field');
    expect(inputs).toHaveLength(2);
    await act(async () => fireEvent.changeText(inputs[0]!, 'First'));
    await act(async () => fireEvent.changeText(inputs[1]!, 'Second'));

    // Move "Second" up via its labelled control.
    await press(screen.getByLabelText('Move Second up'));

    // After the move the first card's label input should read "Second".
    const ordered = screen
      .getAllByDisplayValue(/^(First|Second)$/)
      .map((n) => n.props.value as string);
    expect(ordered).toEqual(['Second', 'First']);
  });

  it('removes a field', async () => {
    await render(<Harness />);
    await press(screen.getByText('+ Short text'));
    expect(screen.getByText('Question label')).toBeTruthy();

    await press(screen.getByText('Remove'));
    expect(screen.getByText('No fields yet. Add one from the palette above.')).toBeTruthy();
  });

  it('hides the pass/fail result mapping editor for non-pass_fail types', async () => {
    await render(<Harness isPassFail={false} />);
    expect(screen.queryByText('Pass / fail result')).toBeNull();
  });

  it('shows the pass/fail result mapping editor for pass_fail types', async () => {
    await render(<Harness isPassFail />);
    expect(screen.getByText('Pass / fail result')).toBeTruthy();
    // With no staff-only dropdown yet, it nudges the user to add one.
    expect(screen.getByText(/Add a staff-only Dropdown field first/)).toBeTruthy();
  });

  it('allows one Signature and one File upload question, and says why (web parity)', async () => {
    await render(<Harness />);
    expect(screen.queryByTestId('one-per-form-hint')).toBeNull();

    await press(screen.getByText('+ Signature'));
    expect(screen.getByRole('button', { name: '+ Signature' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ File upload' })).not.toBeDisabled();
    expect(screen.getByTestId('one-per-form-hint')).toHaveTextContent(
      'A form can have one Signature question and one File upload question.',
    );
    // A second press adds nothing: one Signature card (its type tag), no second.
    await press(screen.getByText('+ Signature'));
    expect(screen.getAllByText('Signature')).toHaveLength(1);

    await press(screen.getByText('+ File upload'));
    expect(screen.getByRole('button', { name: '+ File upload' })).toBeDisabled();
    await press(screen.getByText('+ File upload'));
    expect(screen.getAllByText('File upload')).toHaveLength(1);
  });

  it('explains Staff only under the question', async () => {
    await render(<Harness />);
    await press(screen.getByText('+ Short text'));
    expect(screen.getByText('Hidden from clients. Only your team sees and answers it.')).toBeTruthy();
    expect(screen.getByText('Shown above the questions.')).toBeTruthy();
  });

  it('names the question the team records the result with, and a renamed answer keeps its mark', async () => {
    const initial = fieldBuilderReducer(emptyBuilderState, { type: 'ensureResultField' });
    await render(<Harness initial={initial} isPassFail />);
    expect(screen.getByTestId('result-mapping-hint')).toHaveTextContent(
      'Your team records the result with Result (staff decision). Mark which answers count as a pass and which as a fail.',
    );
    expect(screen.getByText('1 pass · 1 fail')).toBeTruthy();

    // Rename "Pass" to "No reaction": its stored value changes, and it still counts as the pass.
    await fireEvent.changeText(screen.getByDisplayValue('Pass'), 'No reaction');
    const mapping = JSON.parse(String(screen.getByTestId('mapping-json').props.children)) as {
      pass_values: string[];
      fail_values: string[];
    };
    expect(mapping.pass_values).toEqual(['no_reaction']);
    expect(mapping.fail_values).toEqual(['fail']);
  });

  it('renders an options editor for select fields', async () => {
    await render(<Harness />);
    await press(screen.getByText('+ Dropdown'));
    expect(screen.getByText('Options')).toBeTruthy();
    expect(screen.getByDisplayValue('Option 1')).toBeTruthy();

    await press(screen.getByText('+ Add option'));
    // A second option input appears.
    expect(screen.getByDisplayValue('Option 2')).toBeTruthy();
  });
});
