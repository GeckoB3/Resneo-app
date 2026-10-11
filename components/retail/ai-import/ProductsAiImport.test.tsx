/**
 * "Add products with AI" in the app (POS test round 2026-10-11, Part 4, OB7), step for step the
 * web's flow: each source (photos taken one after another with the camera, the photo library, a
 * file, a link, a typed list) read one request each, the review cards with their levels and notes,
 * editing a draft, adding one or every ready one through the ordinary products route (with the brand
 * and category found or added), stopping after three failures in a row, asking before leaving, and
 * nothing to try when the server does not offer it.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: () => null }));
type Listener = (e: { preventDefault: () => void; data: { action: unknown } }) => void;
const mockListeners: Listener[] = [];
const mockDispatch = jest.fn();
jest.mock('expo-router', () => ({
  useNavigation: () => ({
    addListener: (_event: string, cb: Listener) => {
      mockListeners.push(cb);
      return () => {
        const i = mockListeners.indexOf(cb);
        if (i >= 0) mockListeners.splice(i, 1);
      };
    },
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  }),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/components/services-setup/ImagePainter', () => ({ ImagePainterHost: () => null }));
jest.mock('@/lib/services-setup/files', () => ({ readFileBase64: jest.fn(async () => 'QUJD') }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockOffered = true;
const mockRead = jest.fn();
jest.mock('@/components/retail/ai-import/api', () => ({
  ...jest.requireActual<typeof import('@/components/retail/ai-import/api')>('@/components/retail/ai-import/api'),
  useProductsAiAvailability: () => ({ offered: mockOffered, loading: false }),
  readProductsAi: (...args: unknown[]) => mockRead(...args),
}));
const mockSave = jest.fn();
jest.mock('@/lib/queries/useRetail', () => ({ useSaveProduct: () => ({ mutateAsync: mockSave }) }));
const mockAddNamed = jest.fn();
jest.mock('@/lib/queries/useStockSetup', () => ({
  useNamedList: (kind: string) => ({ data: kind === 'brands' ? [{ id: 'brand-1', name: 'Glow' }] : [] }),
  useAddNamed: () => ({ mutateAsync: mockAddNamed }),
}));
const mockPosFetch = jest.fn();
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (...args: unknown[]) => mockPosFetch(...args),
}));

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { AI_REVIEW } from '@/components/retail/ai-import/copy';
import { ProductsAiImport } from '@/components/retail/ai-import/ProductsAiImport';
import { ApiError } from '@/lib/api/client';

const camera = ImagePicker as jest.Mocked<typeof ImagePicker>;
const documents = DocumentPicker as jest.Mocked<typeof DocumentPicker>;

function asset(uri: string) {
  return { uri, width: 800, height: 600, mimeType: 'image/jpeg', fileSize: 3, fileName: null, assetId: null, type: 'image' };
}

function answer(drafts: Record<string, unknown>[], notes: string[] = []) {
  return { ok: true, data: { drafts, notes } };
}

const shampoo = {
  key: 'p1',
  name: 'Repair Shampoo',
  brand: 'Glow',
  category: 'Hair care',
  options: [
    { name: '250 ml', price_pence: 1850, cost_pence: 925, barcode: null },
    { name: '1 litre', price_pence: 4200, cost_pence: null, barcode: null },
  ],
  usage: 'retail',
  level: 'ready',
  notes: [],
  duplicate_of: null,
};
const mask = {
  key: 'p2',
  name: 'Colour Protect Mask',
  brand: null,
  category: 'Treatments',
  options: [{ name: null, price_pence: 2400, cost_pence: null, barcode: null }],
  usage: 'retail',
  level: 'check',
  notes: [AI_REVIEW.priceMaybeTrade],
  duplicate_of: null,
};
const spray = {
  key: 'p3',
  name: 'Sea Salt Spray',
  brand: null,
  category: null,
  options: [{ name: null, price_pence: null, cost_pence: null, barcode: null }],
  usage: 'retail',
  level: 'fix',
  notes: [AI_REVIEW.priceMissing],
  duplicate_of: null,
};

async function show() {
  const onAdded = jest.fn();
  const onClose = jest.fn();
  await render(<ProductsAiImport onAdded={onAdded} onClose={onClose} />);
  return { onAdded, onClose };
}

async function press(text: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), value);
  });
}

/** A typed list read into these drafts, landing on the review. */
async function readList(drafts: Record<string, unknown>[]) {
  await press('Type or paste a list');
  await type('Your products', 'everything we sell');
  await press('Add this list');
  mockRead.mockResolvedValueOnce(answer(drafts));
  await press('Find my products');
}

beforeEach(() => {
  mockOffered = true;
  mockRead.mockReset();
  mockSave.mockReset();
  mockAddNamed.mockReset();
  mockPosFetch.mockReset();
  mockDispatch.mockReset();
  mockListeners.length = 0;
  camera.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted', expires: 'never' } as never);
  camera.launchCameraAsync.mockReset();
  camera.launchImageLibraryAsync.mockReset();
  documents.getDocumentAsync.mockReset();
});

describe('Add products with AI', () => {
  it('reads every kind of source, one request each: photos taken one after another, the library, a file, a link and a list', async () => {
    await show();
    await press('Photos');
    camera.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [asset('file:///cam-1.jpg')] } as never);
    await press('Take a photo');
    // The button stays for the next photo.
    camera.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [asset('file:///cam-2.jpg')] } as never);
    await press('Take another photo');
    expect(camera.requestCameraPermissionsAsync).toHaveBeenCalled();
    camera.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [asset('file:///lib-1.jpg')] } as never);
    await press('Choose photos');
    expect(camera.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true, mediaTypes: ['images'] }));
    expect(screen.getByText('Photo 1')).toBeTruthy();
    expect(screen.getByText('Photo 2')).toBeTruthy();
    expect(screen.getByText('Photo 3')).toBeTruthy();

    await press('A price list or invoice');
    documents.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///price-list.pdf', name: 'price-list.pdf', size: 3, mimeType: 'application/pdf' }],
    } as never);
    await press('Choose a file');
    expect(screen.getByText('price-list.pdf')).toBeTruthy();

    await press('A link');
    await type('Link to your products', 'www.bloomhair.example/shop');
    await press('Add link');
    expect(screen.getByText('bloomhair.example/shop')).toBeTruthy();

    await press('Type or paste a list');
    await type('Your products', 'Sea Salt Spray £16');
    await press('Add this list');
    expect(screen.getByText('Your typed list')).toBeTruthy();
    expect(screen.getByText("What we'll read (6)")).toBeTruthy();

    mockRead.mockResolvedValue(answer([]));
    mockRead.mockResolvedValueOnce(answer([shampoo], ['Some prices looked like trade prices.']));
    await press('Find my products in these 6');

    const bodies = mockRead.mock.calls.map((c) => c[0] as { kind: string; images?: string[]; file?: unknown; url?: string; text?: string });
    expect(bodies).toHaveLength(6);
    // Each photo is a request of its own.
    expect(bodies.filter((b) => b.kind === 'images').map((b) => b.images)).toEqual([
      ['data:image/jpeg;base64,QUJD'],
      ['data:image/jpeg;base64,QUJD'],
      ['data:image/jpeg;base64,QUJD'],
    ]);
    expect(bodies).toContainEqual({ kind: 'file', file: { name: 'price-list.pdf', data_url: 'data:application/pdf;base64,QUJD' } });
    expect(bodies).toContainEqual({ kind: 'link', url: 'https://www.bloomhair.example/shop' });
    expect(bodies).toContainEqual({ kind: 'text', text: 'Sea Salt Spray £16' });
    expect(mockRead.mock.calls.every((c) => c[1] === 'token-A')).toBe(true);

    // The review.
    expect(screen.getByText('1 product found. 0 added, 0 skipped, 1 still to check.')).toBeTruthy();
    expect(screen.getByText(/Things we noticed while reading/)).toBeTruthy();
    expect(screen.getByText('Repair Shampoo')).toBeTruthy();
  });

  it('says how to turn the camera back on when it was refused', async () => {
    camera.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied', expires: 'never' } as never);
    await show();
    await press('Photos');
    await press('Take a photo');
    expect(camera.launchCameraAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText("ResNeo can't use your camera. Turn on camera access for ResNeo in your phone's settings, or choose photos instead."),
    ).toBeTruthy();
    expect(screen.getByText('Open settings')).toBeTruthy();
  });

  it('refuses a file the reader does not take, and a link that is not one', async () => {
    await show();
    await press('A price list or invoice');
    documents.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///old.xls', name: 'old.xls', size: 3, mimeType: 'application/vnd.ms-excel' }],
    } as never);
    await press('Choose a file');
    expect(screen.getByText('Choose a PDF, Excel (.xlsx), CSV or Word (.docx) file.')).toBeTruthy();
    await press('A link');
    await type('Link to your products', 'not a link');
    await press('Add link');
    expect(screen.getByText("That doesn't look like a web address. Check it and try again.")).toBeTruthy();
    expect(screen.queryByText(/What we'll read/)).toBeNull();
  });

  it("keeps a source whose read failed, with the server's reason, and tries it again", async () => {
    await show();
    await press('Type or paste a list');
    await type('Your products', 'Wax 12.00');
    await press('Add this list');
    mockRead.mockResolvedValueOnce({ ok: false, error: "You've read a lot in a short time. Please wait 5 minutes and try again.", status: 429 });
    await press('Find my products');
    expect(screen.getByText("Last try: You've read a lot in a short time. Please wait 5 minutes and try again.")).toBeTruthy();
    expect(screen.queryByText(/products found/)).toBeNull();
    mockRead.mockResolvedValueOnce(answer([shampoo]));
    await press('Try again');
    expect(screen.getByText('1 product found. 0 added, 0 skipped, 1 still to check.')).toBeTruthy();
  });

  it('shows each product with its level and notes, and lets the owner fix one', async () => {
    await show();
    await readList([shampoo, mask, spray]);
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Check')).toBeTruthy();
    expect(screen.getByText('Fix')).toBeTruthy();
    expect(screen.getByText('2 options, from £18.50 · Hair care')).toBeTruthy();
    expect(screen.getByText('250 ml, 1 litre')).toBeTruthy();
    expect(screen.getByText(AI_REVIEW.priceMaybeTrade)).toBeTruthy();
    expect(screen.getByText(AI_REVIEW.priceMissing)).toBeTruthy();
    expect(screen.getByText('Add all ready (1)')).toBeTruthy();
    // A product with something to fix can't be added until it is fixed.
    const adds = screen.getAllByText('Add product');
    expect(adds).toHaveLength(3);

    // Give the spray a price: it is ready now.
    const edits = screen.getAllByText('Edit');
    await act(async () => {
      fireEvent.press(edits[2]!);
    });
    await type('Option 1: Price', '16');
    expect(screen.queryAllByText(AI_REVIEW.priceMissing)).toHaveLength(1);
    await press('Done editing');
    expect(screen.queryByText(AI_REVIEW.priceMissing)).toBeNull();
    expect(screen.getByText('Add all ready (2)')).toBeTruthy();

    // Setting the mask's price makes it the owner's, not a possible trade price.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Edit')[1]!);
    });
    await type('Option 1: Price', '28');
    await press('Done editing');
    expect(screen.queryByText(AI_REVIEW.priceMaybeTrade)).toBeNull();
    expect(screen.getByText('Add all ready (3)')).toBeTruthy();

    // Skipping, and bringing it back.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Skip')[0]!);
    });
    expect(screen.getByText("Skipped, it won't be added")).toBeTruthy();
    await press('Skipped (1)');
    await press('Bring back');
    expect(screen.queryByText("Skipped, it won't be added")).toBeNull();
  });

  it('adds every ready product through the products route, finding or adding its brand and category', async () => {
    const { onAdded, onClose } = await show();
    await readList([shampoo, mask]);
    mockAddNamed.mockResolvedValue({ id: 'cat-1', name: 'Hair care' });
    mockSave.mockResolvedValue({ id: 'prod-1' });
    await press('Add all ready (1)');
    expect(screen.getByText('Add 1 product?')).toBeTruthy();
    await press('Add 1 product');

    // The brand is the venue's own; the category is new.
    expect(mockAddNamed).toHaveBeenCalledTimes(1);
    expect(mockAddNamed).toHaveBeenCalledWith({ kind: 'categories', name: 'Hair care' });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const input = mockSave.mock.calls[0]![0] as { kind: string; body: Record<string, unknown>; clientRequestId: string };
    expect(input.kind).toBe('create');
    expect(input.clientRequestId).toMatch(/^ai-.+-d/);
    expect(input.body).toEqual({
      client_request_id: input.clientRequestId,
      name: 'Repair Shampoo',
      brand_id: 'brand-1',
      category_id: 'cat-1',
      usage: 'retail',
      variants: [
        { option_name: '250 ml', price_pence: 1850, cost_pence: 925, sort_order: 0 },
        { option_name: '1 litre', price_pence: 4200, sort_order: 1 },
      ],
    });
    expect(screen.getByText('Added · 2 options, from £18.50 · Hair care')).toBeTruthy();

    // The one to check can still be added on its own, the owner's call.
    mockAddNamed.mockResolvedValue({ id: 'cat-2', name: 'Treatments' });
    await press('Add product');
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect((mockSave.mock.calls[1]![0] as { body: { name: string } }).body.name).toBe('Colour Protect Mask');

    await press('Finish');
    expect(screen.getByText('Done: 2 products added')).toBeTruthy();
    await press('Done');
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onAdded).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('adds a product the venue may already have as a new one, and shows a refusal on its card', async () => {
    await show();
    await readList([{ ...shampoo, brand: null, category: null, duplicate_of: 'prod-9', level: 'check', notes: [AI_REVIEW.duplicate] }]);
    expect(screen.getByText(AI_REVIEW.duplicate)).toBeTruthy();
    mockSave.mockRejectedValueOnce(
      new ApiError('That barcode is already on Repair Shampoo.', 409, { error: 'That barcode is already on Repair Shampoo.', code: 'RETAIL_BARCODE_TAKEN' }),
    );
    await press('Add as a new product');
    expect(screen.getByText('That barcode is already on Repair Shampoo.')).toBeTruthy();
    expect(screen.queryByText(/^Added · /)).toBeNull();
    expect(screen.getByText('Add as a new product')).toBeTruthy();
  });

  it('stops "Add all ready" after three failures in a row', async () => {
    await show();
    const four = [1, 2, 3, 4].map((i) => ({ ...shampoo, key: `p${i}`, name: `Product ${i}`, brand: null, category: null }));
    await readList(four);
    mockSave.mockRejectedValue(new ApiError('Something went wrong.', 500, { error: 'Something went wrong.' }));
    await press('Add all ready (4)');
    await press('Add 4 products');
    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText("Several products in a row couldn't be added, so we stopped. Check the messages on them, then try again."),
    ).toBeTruthy();
  });

  it('asks before leaving with products still to check', async () => {
    await show();
    await readList([shampoo]);
    const prevent = jest.fn();
    await act(async () => {
      mockListeners.at(-1)!({ preventDefault: prevent, data: { action: { type: 'GO_BACK' } } });
    });
    expect(prevent).toHaveBeenCalled();
    expect(screen.getByText('Leave without adding the rest?')).toBeTruthy();
    await press('Leave');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('offers nothing to try when the server does not offer it (no AI key, or switched off)', async () => {
    mockOffered = false;
    const { onClose } = await show();
    expect(
      screen.getByText("Adding products with AI isn't available right now. You can still add products yourself, or import a spreadsheet."),
    ).toBeTruthy();
    expect(screen.queryByText('Photos')).toBeNull();
    expect(screen.queryByText(/Find my products/)).toBeNull();
    await press('Done');
    expect(onClose).toHaveBeenCalled();
    expect(mockRead).not.toHaveBeenCalled();
  });
});
