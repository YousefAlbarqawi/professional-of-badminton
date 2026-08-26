/**
 * The two pure pieces of the board: which way a row runs (16.2) and what a
 * drag landed on (13.9).
 */
import { boardRowDirection, findDropTarget, type TileRect } from '../boardLayout';

describe('boardRowDirection, 16.2', () => {
  it('keeps court 1 leftmost in both languages', () => {
    // React Native flips `row` for itself under RTL, so asking for the
    // reverse is what produces a left-to-right row on an Arabic phone.
    expect(boardRowDirection(false)).toBe('row');
    expect(boardRowDirection(true)).toBe('row-reverse');
  });
});

describe('findDropTarget, 13.9', () => {
  const rects = new Map<string, TileRect>([
    ['a', { x: 0, y: 0, width: 100, height: 60 }],
    ['b', { x: 120, y: 0, width: 100, height: 60 }],
    ['c', { x: 0, y: 80, width: 100, height: 60 }],
  ]);

  it('finds the tile under the release point', () => {
    expect(findDropTarget(rects, 150, 30, 'a')).toBe('b');
    expect(findDropTarget(rects, 50, 100, 'a')).toBe('c');
  });

  it('ignores the tile being dragged, so a drop on yourself does nothing', () => {
    expect(findDropTarget(rects, 50, 30, 'a')).toBeNull();
  });

  it('answers null for a release over empty space', () => {
    expect(findDropTarget(rects, 500, 500, 'a')).toBeNull();
    expect(findDropTarget(rects, 110, 30, 'a')).toBeNull();
  });

  it('counts the edges as inside', () => {
    expect(findDropTarget(rects, 120, 0, 'a')).toBe('b');
    expect(findDropTarget(rects, 220, 60, 'a')).toBe('b');
  });

  it('answers null when nothing has been measured', () => {
    expect(findDropTarget(new Map(), 10, 10, 'a')).toBeNull();
  });
});
