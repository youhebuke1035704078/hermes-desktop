/**
 * Desktop office layout — adapted from Clawket to landscape format.
 * Grid: 36 cols × 18 rows, each tile 16×16 px → 576×288 virtual pixels.
 *
 * Layout:
 *   Left wing  (cols 1-9):   Boss office + secretary (carpet)
 *   Center     (cols 11-24): Worker bullpen, 6 desks (floor)
 *   Right wing (cols 26-34): Kitchen + lounge
 *   Bottom     (rows 10-17): Outdoor (pavement, road, grass)
 */

export const TILE_SIZE = 16
export const GRID_COLS = 36
export const GRID_ROWS = 18
export const WORLD_W = GRID_COLS * TILE_SIZE  // 576
export const WORLD_H = GRID_ROWS * TILE_SIZE  // 288

/* ── Tile types ────────────────────────────────────── */

export const enum TileType {
  Floor = 0,
  Carpet = 1,
  Wall = 2,
  WindowWall = 3,
  DoorWall = 4,
  KitchenTile = 5,
  Grass = 6,
  Pavement = 7,
  Tree = 8,
  WindowWallRight = 9,
  WindowWallTop = 10,
  WallTop = 11,
  WallLeft = 12,
  WallRight = 13,
  WindowWallBottom = 14,
}

/** Map tile type → sprite name in tiles.png */
export const TILE_SPRITE: Record<number, string> = {
  [TileType.Floor]: 'floor_plain',
  [TileType.Carpet]: 'carpet',
  [TileType.Wall]: 'wall',
  [TileType.WallTop]: 'wall_top',
  [TileType.WallLeft]: 'wall_left',
  [TileType.WallRight]: 'wall_right',
  [TileType.WindowWall]: 'wall_window',
  [TileType.WindowWallRight]: 'wall_window_right',
  [TileType.WindowWallTop]: 'wall_window_top',
  [TileType.WindowWallBottom]: 'wall_window_bottom',
  [TileType.DoorWall]: 'wall_door',
  [TileType.KitchenTile]: 'kitchen_tile',
  [TileType.Grass]: 'grass',
  [TileType.Pavement]: 'pavement',
  [TileType.Tree]: 'tree',
}

/* ── Tile map (18 rows × 36 cols) ─────────────────── */
/* Legend: F=0 C=1 W=2 WW=3 DW=4 KT=5 G=6 PV=7 TR=8 WWR=9 WWT=10 WT=11 WL=12 WR=13 WWB=14 */

export const tileMap: number[][] = [
  // Row 0: grass border
  [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
  // Row 1: top wall with windows
  [11,10,11,11,10,11,11,10,11,11,2,11,10,11,11,10,11,11,10,11,11,10,11,11,10,2,11,10,11,11,10,11,11,10,11,11],
  // Row 2: indoor start — boss office (carpet) | wall | worker area (floor) | wall | kitchen
  [12,1,1,1,1,1,1,1,1,1,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,5,5,5,5,5,5,5,5,5,13],
  // Row 3
  [3,1,1,1,1,1,1,1,1,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,5,5,5,5,5,5,5,5,5,9],
  // Row 4 — door in divider walls
  [12,1,1,1,1,1,1,1,1,1,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,5,5,5,5,5,5,5,5,5,13],
  // Row 5
  [3,1,1,1,1,1,1,1,1,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,9],
  // Row 6
  [12,1,1,1,1,1,1,1,1,1,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,13],
  // Row 7
  [3,1,1,1,1,1,1,1,1,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,9],
  // Row 8
  [12,1,1,1,1,1,1,1,1,1,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,13],
  // Row 9: bottom wall with doors
  [2,2,14,2,2,14,2,2,2,2,2,2,2,14,2,2,2,0,0,2,2,2,14,2,2,2,2,2,14,2,2,14,2,2,2,2],
  // Row 10: pavement walkway
  [6,6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,6,6],
  // Row 11: grass with trees
  [6,6,6,8,6,6,6,6,6,6,8,6,6,6,6,6,6,6,6,6,6,6,6,6,6,8,6,6,6,6,6,6,8,6,6,6],
  // Row 12: road
  [6,6,6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,6,6,6],
  // Row 13: grass
  [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
  // Rows 14-17: grass
  [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
  [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
  [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
  [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
]

/* ── Furniture ─────────────────────────────────────── */

export interface FurnitureItem {
  type: string
  x: number
  y: number
  tileWidth: number
  tileHeight: number
  offsetX?: number
  offsetY?: number
}

/** Map furniture type → sprite name in furniture.png */
export const FURNITURE_SPRITE: Record<string, string> = {
  desk_only: 'desk_only',
  boss_desk_only: 'boss_desk_only',
  secretary_desk_only: 'secretary_desk_only',
  monitor: 'monitor_standalone_blue',
  bookshelf: 'bookshelf',
  filing_cabinet: 'filing_cabinet',
  chair: 'chair_front',
  foosball: 'foosball',
  coffee_machine: 'coffee_machine',
  plant_1: 'plant_1',
  plant_2: 'plant_2',
  plant_3: 'plant_3',
  tree: 'tree',
  car: 'car',
  bench: 'bench',
  signal_tower: 'signal_tower',
  office_clock: 'office_clock',
  whiteboard: 'whiteboard',
  mailbox: 'mailbox',
  wall_calendar: 'wall_calendar',
  toolbox: 'toolbox',
}

export const furnitureList: FurnitureItem[] = [
  // ── Boss office (carpet area, cols 1-9) ──
  { type: 'bookshelf', x: 2, y: 2, tileWidth: 2, tileHeight: 1 },
  { type: 'plant_1', x: 1, y: 2, tileWidth: 1, tileHeight: 1 },
  { type: 'plant_2', x: 9, y: 2, tileWidth: 1, tileHeight: 1 },
  { type: 'wall_calendar', x: 1, y: 3, tileWidth: 1, tileHeight: 1 },
  { type: 'chair', x: 5, y: 4, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'boss_desk_only', x: 4, y: 5, tileWidth: 3, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 5, y: 5, tileWidth: 1, tileHeight: 1, offsetY: -5 },
  { type: 'filing_cabinet', x: 1, y: 5, tileWidth: 1, tileHeight: 1 },
  // Secretary
  { type: 'chair', x: 7, y: 6, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'secretary_desk_only', x: 6, y: 7, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 7, y: 7, tileWidth: 1, tileHeight: 1, offsetY: -5 },
  { type: 'plant_1', x: 9, y: 7, tileWidth: 1, tileHeight: 1 },

  // ── Worker bullpen (cols 11-24) — Row 1 ──
  { type: 'chair', x: 13, y: 2, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'desk_only', x: 12, y: 3, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 13, y: 3, tileWidth: 1, tileHeight: 1, offsetY: -5 },

  { type: 'chair', x: 18, y: 2, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'desk_only', x: 17, y: 3, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 18, y: 3, tileWidth: 1, tileHeight: 1, offsetY: -5 },

  { type: 'chair', x: 23, y: 2, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'desk_only', x: 22, y: 3, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 23, y: 3, tileWidth: 1, tileHeight: 1, offsetY: -5 },

  // ── Worker bullpen — Row 2 ──
  { type: 'chair', x: 13, y: 5, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'desk_only', x: 12, y: 6, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 13, y: 6, tileWidth: 1, tileHeight: 1, offsetY: -5 },

  { type: 'chair', x: 18, y: 5, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'desk_only', x: 17, y: 6, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 18, y: 6, tileWidth: 1, tileHeight: 1, offsetY: -5 },

  { type: 'chair', x: 23, y: 5, tileWidth: 1, tileHeight: 1, offsetY: 10, offsetX: -3 },
  { type: 'desk_only', x: 22, y: 6, tileWidth: 2, tileHeight: 1, offsetY: 3 },
  { type: 'monitor', x: 23, y: 6, tileWidth: 1, tileHeight: 1, offsetY: -5 },

  // Office clock + toolbox
  { type: 'office_clock', x: 16, y: 4, tileWidth: 1, tileHeight: 2 },
  { type: 'toolbox', x: 24, y: 8, tileWidth: 1, tileHeight: 1 },

  // ── Kitchen / Break room (cols 26-34) ──
  { type: 'coffee_machine', x: 26, y: 2, tileWidth: 1, tileHeight: 1, offsetY: 2 },
  { type: 'coffee_machine', x: 28, y: 2, tileWidth: 1, tileHeight: 1, offsetY: 2 },
  { type: 'whiteboard', x: 30, y: 2, tileWidth: 5, tileHeight: 2 },
  { type: 'plant_2', x: 34, y: 4, tileWidth: 1, tileHeight: 1 },
  // Lounge
  { type: 'foosball', x: 27, y: 7, tileWidth: 3, tileHeight: 1 },
  { type: 'plant_1', x: 26, y: 7, tileWidth: 1, tileHeight: 1 },
  { type: 'plant_1', x: 34, y: 7, tileWidth: 1, tileHeight: 1 },

  // ── Outdoor ──
  { type: 'tree', x: 3, y: 11, tileWidth: 1, tileHeight: 2 },
  { type: 'tree', x: 10, y: 11, tileWidth: 1, tileHeight: 2 },
  { type: 'tree', x: 25, y: 11, tileWidth: 1, tileHeight: 2 },
  { type: 'tree', x: 32, y: 11, tileWidth: 1, tileHeight: 2 },
  { type: 'plant_3', x: 16, y: 10, tileWidth: 1, tileHeight: 1 },
  { type: 'plant_3', x: 19, y: 10, tileWidth: 1, tileHeight: 1 },
  { type: 'mailbox', x: 20, y: 10, tileWidth: 1, tileHeight: 1 },
  { type: 'bench', x: 6, y: 13, tileWidth: 2, tileHeight: 1 },
  { type: 'bench', x: 28, y: 13, tileWidth: 2, tileHeight: 1 },
  { type: 'car', x: 7, y: 12, tileWidth: 2, tileHeight: 1 },
  { type: 'car', x: 14, y: 12, tileWidth: 2, tileHeight: 1 },
  { type: 'car', x: 22, y: 12, tileWidth: 2, tileHeight: 1 },
  { type: 'car', x: 30, y: 12, tileWidth: 2, tileHeight: 1 },
  { type: 'signal_tower', x: 34, y: 13, tileWidth: 2, tileHeight: 3 },
]

/* ── Waypoints (desk positions) ────────────────────── */

export interface Waypoint { x: number; y: number }

/** Desk waypoints — chair position for each workstation slot.
 *  Slot 0: boss, 1: secretary, 2-7: worker desks */
export const DESK_WAYPOINTS: Waypoint[] = [
  { x: 5, y: 4 },    // slot 0: boss
  { x: 7, y: 6 },    // slot 1: secretary
  { x: 13, y: 2 },   // slot 2: worker top-left
  { x: 18, y: 2 },   // slot 3: worker top-center
  { x: 23, y: 2 },   // slot 4: worker top-right
  { x: 13, y: 5 },   // slot 5: worker bottom-left
  { x: 18, y: 5 },   // slot 6: worker bottom-center
  { x: 23, y: 5 },   // slot 7: worker bottom-right
]

export const IDLE_WAYPOINTS: Waypoint[] = [
  { x: 30, y: 6 },   // lounge area
  { x: 27, y: 4 },   // kitchen
  { x: 3, y: 8 },    // boss office corner
  { x: 16, y: 8 },   // worker area hallway
  { x: 17, y: 10 },  // entrance
  { x: 8, y: 10 },   // outdoor walk left
  { x: 28, y: 10 },  // outdoor walk right
]

/* ── Walkability ───────────────────────────────────── */

const furnitureOccupied = new Set<string>()
for (const f of furnitureList) {
  for (let dy = 0; dy < f.tileHeight; dy++)
    for (let dx = 0; dx < f.tileWidth; dx++)
      furnitureOccupied.add(`${f.x + dx},${f.y + dy}`)
}

export function isWalkable(col: number, row: number): boolean {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false
  const t = tileMap[row]![col]!
  return t === TileType.Floor || t === TileType.Carpet
    || t === TileType.KitchenTile || t === TileType.DoorWall
    || t === TileType.Pavement || t === TileType.Grass
}

export function isPassable(col: number, row: number): boolean {
  return isWalkable(col, row) && !furnitureOccupied.has(`${col},${row}`)
}

/* ── A* pathfinding ────────────────────────────────── */

export function findPath(sx: number, sy: number, ex: number, ey: number, maxIter = 800): Waypoint[] {
  if (!isPassable(ex, ey) || (sx === ex && sy === ey)) return []
  const key = (x: number, y: number) => (x << 16) | y
  const open = new Map<number, { x: number; y: number; g: number; f: number }>()
  const closed = new Set<number>()
  const from = new Map<number, number>()
  const h = (x: number, y: number) => Math.abs(x - ex) + Math.abs(y - ey)
  const sk = key(sx, sy)
  open.set(sk, { x: sx, y: sy, g: 0, f: h(sx, sy) })
  let iter = 0
  while (open.size > 0 && iter++ < maxIter) {
    let bk = 0, bf = Infinity
    for (const [k, v] of open) { if (v.f < bf) { bf = v.f; bk = k } }
    const cur = open.get(bk)!
    open.delete(bk)
    closed.add(bk)
    if (cur.x === ex && cur.y === ey) {
      const path: Waypoint[] = []
      let k = key(ex, ey)
      while (k !== sk) { path.unshift({ x: (k >> 16) & 0xffff, y: k & 0xffff }); k = from.get(k)! }
      return path
    }
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = cur.x + dx, ny = cur.y + dy
      const nk = key(nx, ny)
      if (closed.has(nk) || !isPassable(nx, ny)) continue
      const ng = cur.g + 1
      const ex2 = open.get(nk)
      if (!ex2 || ng < ex2.g) {
        open.set(nk, { x: nx, y: ny, g: ng, f: ng + h(nx, ny) })
        from.set(nk, bk)
      }
    }
  }
  return []
}
