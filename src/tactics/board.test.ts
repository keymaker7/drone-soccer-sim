import { describe, expect, it } from 'vitest';
import { addStroke, clampPoint, createBoard, deserializeBoard, moveToken, serializeBoard, strokeDistance } from './board';
describe('tactics board', () => {
  it.each(['default', 'attack', 'defend'] as const)('%s is mirrored and has all 10 roles', formation => {
    const board = createBoard(formation);
    expect(board.tokens).toHaveLength(10);
    for (const token of board.tokens.filter(t => t.team === 'blue')) {
      const opposite = board.tokens.find(t => t.id === `red-${token.role}`)!;
      expect(opposite.x).toBeCloseTo(1 - token.x);
      expect(opposite.y).toBe(token.y);
    }
  });
  it('round trips positions and ink without sharing state', () => {
    const board = addStroke(moveToken(createBoard(), 'blue-S', { x: .83, y: .12 }), { color: '#ffffff', arrow: true, points: [{ x: .2, y: .4 }, { x: .8, y: .7 }] });
    expect(deserializeBoard(serializeBoard(board))).toEqual(board);
    expect(deserializeBoard(serializeBoard(board))).not.toBe(board);
  });
  it('clamps moved and loaded coordinates', () => {
    expect(clampPoint({ x: -2, y: 4 })).toEqual({ x: 0, y: 1 });
    expect(clampPoint({ x: NaN, y: Infinity })).toEqual({ x: .5, y: .5 });
    const board = createBoard(); board.tokens[0].x = 4;
    expect(deserializeBoard(serializeBoard(board))?.tokens[0].x).toBe(1);
    expect(moveToken(board, 'blue-S', { x: -4, y: 5 }).tokens[0]).toMatchObject({ x: 0, y: 1 });
  });
  it('rejects corrupt storage', () => {
    expect(deserializeBoard('no')).toBeNull();
    expect(deserializeBoard('{"version":1,"board":{"tokens":[],"strokes":[]}}')).toBeNull();
    const board = createBoard(); board.tokens[1] = board.tokens[0];
    expect(deserializeBoard(serializeBoard(board))).toBeNull();
  });
  it('measures whole strokes in display coordinates', () => {
    const stroke = { color: '#ffffff', arrow: false, points: [{ x: .1, y: .5 }, { x: .9, y: .5 }] };
    expect(strokeDistance(stroke, { x: .5, y: .6 }, 1000, 400)).toBeCloseTo(40);
    expect(strokeDistance(stroke, { x: .5, y: .5 }, 1000, 400)).toBe(0);
  });
});
