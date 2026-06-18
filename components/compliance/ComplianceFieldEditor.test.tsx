import { useReducer } from 'react';

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
  await act(async () => {
    fireEvent.press(el);
  });
}

function Harness({
  initial = emptyBuilderState,
  isPassFail = false,
}: {
  initial?: FieldBuilderState;
  isPassFail?: boolean;
}) {
  const [state, dispatch] = useReducer(fieldBuilderReducer, initial);
  return <ComplianceFieldEditor state={state} dispatch={dispatch} isPassFail={isPassFail} />;
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
