export type Point = { x: number; y: number };
export type Role = 'S' | 'G' | 'L' | 'W' | 'K';
export type Token = Point & { id: string; team: 'blue' | 'red'; role: Role };
export type Stroke = { color: string; arrow: boolean; points: Point[] };
export type Board = { tokens: Token[]; strokes: Stroke[] };
export type Formation = 'default' | 'attack' | 'defend';
export const ROLE_COLORS: Record<Role, string> = { S: '#63e69a', G: '#f5a2d4', L: '#7dd9ff', W: '#ffe083', K: '#ffffff' };
export const PEN_COLORS = ['#ffffff', '#ffe083', '#63e69a'];
export function clampPoint(point: Point): Point {
  return { x: Math.max(0, Math.min(1, Number.isFinite(point.x) ? point.x : 0.5)), y: Math.max(0, Math.min(1, Number.isFinite(point.y) ? point.y : 0.5)) };
}
export function createBoard(formation: Formation = 'default'): Board {
  const positions: Record<Formation, Point[]> = {
    default: [{ x: .34, y: .5 }, { x: .25, y: .24 }, { x: .25, y: .76 }, { x: .17, y: .5 }, { x: .09, y: .5 }],
    attack: [{ x: .76, y: .5 }, { x: .62, y: .23 }, { x: .55, y: .77 }, { x: .37, y: .5 }, { x: .09, y: .5 }],
    defend: [{ x: .4, y: .5 }, { x: .25, y: .2 }, { x: .25, y: .8 }, { x: .19, y: .5 }, { x: .09, y: .5 }],
  };
  const roles: Role[] = ['S', 'G', 'L', 'W', 'K'];
  return { tokens: (['blue', 'red'] as const).flatMap(team => roles.map((role, i) => ({ id: `${team}-${role}`, team, role, x: team === 'blue' ? positions[formation][i].x : 1 - positions[formation][i].x, y: positions[formation][i].y }))), strokes: [] };
}
export function moveToken(board: Board, id: string, point: Point): Board {
  return { ...board, tokens: board.tokens.map(token => token.id === id ? { ...token, ...clampPoint(point) } : token) };
}
export function addStroke(board: Board, stroke: Stroke): Board {
  if (stroke.points.length < 2) return board;
  return { ...board, strokes: [...board.strokes, { ...stroke, points: stroke.points.map(clampPoint) }] };
}
export function serializeBoard(board: Board): string { return JSON.stringify({ version: 1, board }); }
export function deserializeBoard(raw: string): Board | null {
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.board || !Array.isArray(data.board.tokens) || !Array.isArray(data.board.strokes)) return null;
    const base = createBoard();
    if (data.board.tokens.length !== 10 || data.board.strokes.length > 5000) return null;
    const tokens = base.tokens.map(token => {
      const matches = data.board.tokens.filter((value: Token) => value?.id === token.id);
      if (matches.length !== 1 || !Number.isFinite(matches[0].x) || !Number.isFinite(matches[0].y)) throw new Error('Invalid token');
      return { ...token, ...clampPoint(matches[0]) };
    });
    const strokes: Stroke[] = data.board.strokes.map((stroke: Stroke) => {
      if (!stroke || !PEN_COLORS.includes(stroke.color) || typeof stroke.arrow !== 'boolean' || !Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 20000) throw new Error('Invalid stroke');
      return { color: stroke.color, arrow: stroke.arrow, points: stroke.points.map(point => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid point');
        return clampPoint(point);
      }) };
    });
    return { tokens, strokes };
  } catch { return null; }
}
/** Distance in display coordinates, so erasing stays accurate on wide arenas. */
export function strokeDistance(stroke: Stroke, point: Point, width: number, height: number): number {
  let best = Infinity;
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i];
    const dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;
    const px = (point.x - a.x) * width, py = (point.y - a.y) * height;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }
  return best;
}
