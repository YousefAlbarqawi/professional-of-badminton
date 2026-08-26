/**
 * Two pure pieces of the court board: which way a row runs, and what a drag
 * was dropped on. Both are here rather than in a component so they can be
 * tested without a gesture or a renderer.
 */

/**
 * BUILD-SPEC 16.2: "The court board does not mirror. Court 1 stays leftmost in
 * both languages, because the coach reads it against the physical hall."
 *
 * React Native flips `row` into `row-reverse` for itself when the app is laid
 * out right to left, so asking for `row-reverse` in Arabic is what produces a
 * left-to-right row on the screen. The double negative is the point: this is
 * the one surface in the app that must not follow the writing direction.
 */
export function boardRowDirection(isRTL: boolean): 'row' | 'row-reverse' {
  return isRTL ? 'row-reverse' : 'row';
}

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Which tile a drag was released over, in window coordinates. 13.9: "Drag a
 * player tile onto another player tile to swap them. Cross-court and same-court
 * both work."
 *
 * The dragged tile is excluded, so releasing over your own starting position
 * is a no-op rather than a swap with yourself. Releasing over nothing is also
 * a no-op: the spring in `CourtTile` puts the tile back and no write happens.
 */
export function findDropTarget(
  rects: ReadonlyMap<string, TileRect>,
  x: number,
  y: number,
  draggedBookingId: string,
): string | null {
  for (const [bookingId, rect] of rects) {
    if (bookingId === draggedBookingId) continue;
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return bookingId;
    }
  }
  return null;
}
