/**
 * Purchase orders' pure parts (POS app step 4b, UX spec §6.13): a draft's lines as typed and as
 * PATCH takes them, and a delivery as it is scanned or typed in.
 */
import {
  addToDraft,
  draftChanged,
  draftFromLines,
  draftLinesBody,
  draftTotal,
  overBy,
  poStatusId,
  receiveBody,
  receiveLineForCode,
  stillToCome,
} from '@/lib/retail/purchasing';
import type { PickerVariant, PurchaseOrderLine } from '@/types/retail';

function line(over: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return {
    id: 'l1',
    variant_id: 'v1',
    product_id: 'p1',
    name: 'Shampoo, 250ml',
    sku: 'SH-250',
    quantity_ordered: 6,
    quantity_received: 2,
    unit_cost_pence: 450,
    line_total_pence: 2700,
    added_at_receipt: false,
    exists: true,
    track_stock: true,
    pack_size: 6,
    on_hand: 1,
    cost_pence: 450,
    barcodes: ['012345678905'],
    ...over,
  };
}

const PICKED: PickerVariant = {
  variant_id: 'v2',
  product_id: 'p2',
  product_name: 'Conditioner',
  option_name: null,
  sku: 'CO-1',
  usage: 'retail',
  supplier_id: 's1',
  supplier_name: 'Wella',
  brand_name: null,
  on_hand: 0,
  cost_pence: 512.5,
  pack_size: 12,
  reorder_level: 3,
  barcodes: [],
};

describe('a draft', () => {
  it('starts from the saved lines, adds a pack at the average cost, and one more pack when added again', () => {
    const draft = draftFromLines([line()]);
    expect(draft).toEqual([{ variant_id: 'v1', name: 'Shampoo, 250ml', sku: 'SH-250', qty: '6', cost: '4.50', exists: true }]);
    const added = addToDraft(draft, PICKED, 'Conditioner');
    expect(added[1]).toMatchObject({ variant_id: 'v2', qty: '12', cost: '5.13' });
    expect(addToDraft(added, PICKED, 'Conditioner')[1]!.qty).toBe('24');
    expect(draftChanged(draft, [line()])).toBe(false);
    expect(draftChanged(added, [line()])).toBe(true);
  });

  it('sends whole quantities and pence, and says which line is not right', () => {
    expect(draftLinesBody([{ variant_id: 'v1', name: 'Shampoo', sku: null, qty: '6', cost: '4.50', exists: true }])).toEqual({
      lines: [{ variant_id: 'v1', quantity: 6, unit_cost_pence: 450 }],
      problem: null,
    });
    expect(draftLinesBody([{ variant_id: 'v1', name: 'Shampoo', sku: null, qty: '0', cost: '', exists: true }]).problem).toEqual({
      kind: 'qty',
      name: 'Shampoo',
    });
    expect(draftLinesBody([{ variant_id: 'v1', name: 'Shampoo', sku: null, qty: '2', cost: 'cheap', exists: true }]).problem).toEqual({
      kind: 'cost',
      name: 'Shampoo',
    });
    expect(draftTotal([{ variant_id: 'v1', name: 'Shampoo', sku: null, qty: '6', cost: '4.50', exists: true }])).toBe(2700);
  });

  it('reads its status', () => {
    expect(poStatusId('part_received')).toBe('po.status.part_received');
  });
});

describe('a delivery', () => {
  it('finds the line a scan names, in either UPC-A form or by SKU', () => {
    expect(receiveLineForCode([line()], '0012345678905')?.id).toBe('l1');
    expect(receiveLineForCode([line()], 'sh-250')?.id).toBe('l1');
    expect(receiveLineForCode([line()], '999')).toBeNull();
  });

  it('sends the lines that arrived, a changed cost, and the extras, and counts the units', () => {
    const body = receiveBody([line(), line({ id: 'l2', variant_id: 'v3' })], { l1: '4', l2: '0' }, { l1: '4.80', l2: '4.50' }, [
      { variant_id: 'v9', name: 'Gloves', qty: '2', cost: '' },
    ]);
    expect(body).toEqual({
      lines: [{ line_id: 'l1', quantity: 4, unit_cost_pence: 480 }],
      extras: [{ variant_id: 'v9', quantity: 2 }],
      units: 6,
      problem: null,
    });
  });

  it('needs at least one unit, and whole numbers', () => {
    expect(receiveBody([line()], {}, {}, []).problem).toEqual({ kind: 'nothing', name: null });
    expect(receiveBody([line()], { l1: '1.5' }, {}, []).problem).toEqual({ kind: 'qty', name: 'Shampoo, 250ml' });
  });

  it('says how many more than ordered arrived', () => {
    expect(stillToCome(line())).toBe(4);
    expect(overBy(line(), '6')).toBe(2);
    expect(overBy(line(), '3')).toBe(0);
  });
});
