/**
 * Categories tab of the Services screen (R23-3): add, rename, reorder and
 * delete headings; non-admins read only. The mutations are mocked at the hook
 * boundary and the payloads asserted, since the server contract is the point.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockCreate = jest.fn();
const mockRename = jest.fn();
const mockDelete = jest.fn();
const mockReorder = jest.fn();
jest.mock('@/lib/queries/useServiceCategories', () => ({
  CATEGORY_NAME_MAX: 80,
  useCreateServiceCategory: () => ({ mutate: mockCreate, isPending: false }),
  useRenameServiceCategory: () => ({ mutate: mockRename, isPending: false }),
  useDeleteServiceCategory: () => ({ mutate: mockDelete, isPending: false }),
  useReorderServiceCategories: () => ({ mutate: mockReorder, isPending: false }),
}));

import { ServiceCategoriesManager } from '@/components/manage/ServiceCategoriesManager';

const categories = [
  { id: 'c-hair', name: 'Hair', sort_order: 0 },
  { id: 'c-nails', name: 'Nails', sort_order: 1 },
];

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

async function type(getEl: () => Parameters<typeof fireEvent.changeText>[0], text: string) {
  await act(async () => {
    fireEvent.changeText(getEl(), text);
  });
}

function renderManager(overrides: Partial<React.ComponentProps<typeof ServiceCategoriesManager>> = {}) {
  return render(
    <ServiceCategoriesManager
      categories={categories}
      serviceCountByCategory={new Map([['c-hair', 3]])}
      uncategorisedCount={1}
      isAdmin
      {...overrides}
    />,
  );
}

beforeEach(() => {
  mockCreate.mockReset();
  mockRename.mockReset();
  mockDelete.mockReset();
  mockReorder.mockReset();
});

describe('ServiceCategoriesManager', () => {
  it('lists headings with their service counts', async () => {
    await renderManager();
    expect(screen.getByText('Hair')).toBeTruthy();
    expect(screen.getByText('3 services')).toBeTruthy();
    expect(screen.getByText('0 services')).toBeTruthy();
    expect(screen.getByText(/1 service without a category/)).toBeTruthy();
  });

  it('creates a heading from the typed name', async () => {
    await renderManager();
    await type(() => screen.getByPlaceholderText('e.g. Hair, Nails, Massage'), '  Massage ');
    await press(() => screen.getByText('Add'));
    expect(mockCreate).toHaveBeenCalledWith('Massage', expect.anything());
  });

  it('renames inline and sends the id with the new name', async () => {
    await renderManager();
    await press(() => screen.getByLabelText('Rename Hair'));
    await type(() => screen.getByDisplayValue('Hair'), 'Hair & beauty');
    await press(() => screen.getByText('Save'));
    expect(mockRename).toHaveBeenCalledWith({ id: 'c-hair', name: 'Hair & beauty' }, expect.anything());
  });

  it('moves a heading one place and persists the full order', async () => {
    await renderManager();
    await press(() => screen.getByLabelText('Move Nails up'));
    expect(mockReorder).toHaveBeenCalledWith(['c-nails', 'c-hair'], expect.anything());
  });

  it('asks before deleting, naming what moves to Other services', async () => {
    await renderManager();
    await press(() => screen.getByLabelText('Delete Hair'));
    expect(screen.getByText('Delete "Hair"?')).toBeTruthy();
    expect(screen.getByText(/3 services will stay bookable and move to "Other services"/)).toBeTruthy();
    await press(() => screen.getByText('Delete category'));
    expect(mockDelete).toHaveBeenCalledWith('c-hair', expect.anything());
  });

  it('is read-only for non-admins', async () => {
    await renderManager({ isAdmin: false });
    expect(screen.queryByPlaceholderText('e.g. Hair, Nails, Massage')).toBeNull();
    expect(screen.queryByLabelText('Delete Hair')).toBeNull();
    expect(screen.getByText('Hair')).toBeTruthy();
  });
});
