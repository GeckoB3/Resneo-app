/**
 * Which columns of the multi-calendar grid a hold-drag may carry a booking
 * onto.
 *
 * A booking never changes venue (web `handleDragEnd`: "A booking can only be
 * moved within the same venue"), so the columns fall into groups: every own
 * column is one group, and a partner's calendars are a group of their own. A
 * drag may land on any column of the bar's group and on no other; the block
 * clamps its horizontal travel to that range, and a drop past it is refused.
 *
 * The range is by index, since the block converts finger travel into a column
 * delta. Callers order the columns so a group is contiguous (own columns first,
 * then each partner's calendars together); a stray column inside a group's
 * span would be reachable, which is why the grid checks the group again at the
 * drop.
 */
export interface ColumnMoveRange {
  /** First column index a bar of this column may be dropped on (inclusive). */
  min: number;
  /** Last column index (inclusive). A range of one column allows no cross-column move. */
  max: number;
}

export interface MoveGroupedColumn {
  /** A partner's column; own columns share one group regardless of `moveGroup`. */
  linked?: boolean;
  /**
   * The partner's venue, so its calendars accept each other's bars. A linked
   * column without one (the venue-level column, which names no calendar) is a
   * group of its own and never takes or gives a cross-column move.
   */
  moveGroup?: string;
}

/** The group key a column belongs to; `null` for a column that is alone. */
export function columnMoveGroup(column: MoveGroupedColumn): string | null {
  if (!column.linked) return 'own';
  return column.moveGroup ? `linked:${column.moveGroup}` : null;
}

/** Per column, the index range of the columns a bar of it may move onto. */
export function columnMoveRanges(columns: readonly MoveGroupedColumn[]): ColumnMoveRange[] {
  const spans = new Map<string, ColumnMoveRange>();
  columns.forEach((column, index) => {
    const group = columnMoveGroup(column);
    if (group == null) return;
    const span = spans.get(group);
    if (!span) spans.set(group, { min: index, max: index });
    else span.max = index;
  });
  return columns.map((column, index) => {
    const group = columnMoveGroup(column);
    const span = group == null ? undefined : spans.get(group);
    return span ? { min: span.min, max: span.max } : { min: index, max: index };
  });
}
