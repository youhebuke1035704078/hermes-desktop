/**
 * Pixel-art office rendering engine using Canvas2D + Clawket sprite sheets.
 * Reproduces the exact Clawket visual style: 15×35 tile grid, 16px tiles,
 * 240×560 virtual pixels, Y-sorted furniture/character rendering.
 */

import {
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  WORLD_W,
  WORLD_H,
  TILE_SPRITE,
  FURNITURE_SPRITE,
  tileMap,
  furnitureList,
  DESK_WAYPOINTS,
  IDLE_WAYPOINTS,
  isPassable,
  findPath,
  type Waypoint,
} from './office-layout'

import tilesUrl from '@/assets/sprites/tiles.png'
import furnitureUrl from '@/assets/sprites/furniture.png'
import charactersUrl from '@/assets/sprites/characters.png'
import spriteData from '@/assets/sprites/sprites.json'

/* ── Types ─────────────────────────────────────────── */

export interface CharacterData {
  id: string
  name: string
  emoji: string
  color: number
  status: 'idle' | 'working' | 'walking' | 'talking'
}

interface SpriteFrame {
  x: number
  y: number
  w: number
  h: number
}

interface InternalChar {
  data: CharacterData
  px: number
  py: number
  tx: number
  ty: number
  path: Waypoint[]
  direction: 'down' | 'up' | 'left' | 'right'
  walkFrame: number
  walkTimer: number
  deskSlotIdx: number
  skin: string
}

interface Workstation {
  chairIdx: number
  deskIdx: number
  monitorIdx: number
  characterId: string | null
  deskSlotIdx: number
}

export type PixelEngineEvent =
  | { type: 'click-character'; id: string }
  | { type: 'click-floor'; tx: number; ty: number }

type EventHandler = (evt: PixelEngineEvent) => void

/* ── Character skins (matching sprites.json rows) ─── */

const CHARACTER_SKINS = [
  'boss', 'assistant', 'worker_1', 'worker_2',
  'worker_3', 'worker_4', 'worker_5', 'worker_6',
]

const MONITOR_ANIM_FRAMES = [
  'monitor_standalone_blue',
  'monitor_standalone_green',
  'monitor_standalone_bright',
]

/* ── Engine ─────────────────────────────────────────── */

export class PixelEngine {
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private containerEl!: HTMLElement

  private tilesImg!: HTMLImageElement
  private furnitureImg!: HTMLImageElement
  private charsImg!: HTMLImageElement
  private tileFrames: Record<string, SpriteFrame>
  private furnitureFrames: Record<string, SpriteFrame>
  private charFrames: Record<string, SpriteFrame>

  private characters = new Map<string, InternalChar>()
  private usedDesks = new Set<number>()
  private handlers: EventHandler[] = []
  private cleanupFns: (() => void)[] = []

  private scale = 1
  private camX = 0
  private camY = 0
  private dragging = false
  private dragStart = { x: 0, y: 0 }
  private dragCamStart = { x: 0, y: 0 }

  private disposed = false
  private rafId = 0
  private lastTime = 0
  private screenAnimIdx = 0
  private screenAnimTimer = 0

  constructor() {
    this.tileFrames = spriteData.tiles as Record<string, SpriteFrame>
    this.furnitureFrames = spriteData.furniture as Record<string, SpriteFrame>
    this.charFrames = spriteData.characters as Record<string, SpriteFrame>
  }

  /* ── Public API ──────────────────────────────────── */

  async init(container: HTMLElement) {
    this.containerEl = container

    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    this.canvas.style.imageRendering = 'pixelated'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot get 2d context')
    this.ctx = ctx

    const [tiles, furniture, chars] = await Promise.all([
      loadImage(tilesUrl),
      loadImage(furnitureUrl),
      loadImage(charactersUrl),
    ])
    this.tilesImg = tiles
    this.furnitureImg = furniture
    this.charsImg = chars

    this.resize()

    const ro = new ResizeObserver(() => this.resize())
    ro.observe(container)
    this.cleanupFns.push(() => ro.disconnect())

    this.setupInteraction()

    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this.loop)
  }

  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    for (const fn of this.cleanupFns) fn()
    this.cleanupFns = []
    this.canvas.remove()
  }

  on(handler: EventHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  setCharacter(data: CharacterData) {
    let ch = this.characters.get(data.id)
    if (ch) {
      ch.data = data
      if (data.status === 'working' && ch.deskSlotIdx >= 0 && ch.path.length === 0) {
        const wp = DESK_WAYPOINTS[ch.deskSlotIdx]
        if (wp && (ch.tx !== wp.x || ch.ty !== wp.y)) {
          this.walkTo(ch, wp.x, wp.y)
        }
      }
    } else {
      ch = this.createCharacter(data)
      this.characters.set(data.id, ch)
    }
  }

  removeCharacter(id: string) {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.deskSlotIdx >= 0) this.usedDesks.delete(ch.deskSlotIdx)
    this.characters.delete(id)
  }

  clearCharacters() {
    this.characters.clear()
    this.usedDesks.clear()
  }

  getScale() { return this.scale }

  setScale(s: number) {
    const cw = this.canvas.width
    const ch = this.canvas.height
    const centerX = cw / 2
    const centerY = ch / 2
    const oldScale = this.scale
    this.scale = Math.max(0.5, Math.min(6, s))
    this.camX = centerX - (centerX - this.camX) * (this.scale / oldScale)
    this.camY = centerY - (centerY - this.camY) * (this.scale / oldScale)
  }

  resetCamera() {
    this.autoFit()
  }

  wanderCharacter(id: string) {
    const ch = this.characters.get(id)
    if (!ch || ch.data.status !== 'idle' || ch.path.length > 0) return
    const wp = IDLE_WAYPOINTS[Math.floor(Math.random() * IDLE_WAYPOINTS.length)]
    if (wp && isPassable(wp.x, wp.y)) {
      this.walkTo(ch, wp.x, wp.y)
    }
  }

  /* ── Character management ────────────────────────── */

  private createCharacter(data: CharacterData): InternalChar {
    const deskIdx = this.findFreeDeskIndex()
    let startX: number, startY: number

    if (deskIdx >= 0) {
      this.usedDesks.add(deskIdx)
      const wp = DESK_WAYPOINTS[deskIdx]
      startX = wp.x
      startY = wp.y
    } else {
      const wp = IDLE_WAYPOINTS[Math.floor(Math.random() * IDLE_WAYPOINTS.length)]
      startX = wp.x
      startY = wp.y
    }

    const skinIdx = deskIdx >= 0
      ? deskIdx
      : hashStr(data.id) % CHARACTER_SKINS.length
    const skin = CHARACTER_SKINS[skinIdx % CHARACTER_SKINS.length]

    return {
      data,
      px: startX * TILE_SIZE,
      py: startY * TILE_SIZE,
      tx: startX,
      ty: startY,
      path: [],
      direction: 'down',
      walkFrame: 0,
      walkTimer: 0,
      deskSlotIdx: deskIdx,
      skin,
    }
  }

  private walkTo(ch: InternalChar, tx: number, ty: number) {
    const curTx = Math.round(ch.px / TILE_SIZE)
    const curTy = Math.round(ch.py / TILE_SIZE)
    const path = findPath(curTx, curTy, tx, ty)
    if (path.length > 0) ch.path = path
  }

  /** Public API: move a character by id to the given tile */
  moveCharacterTo(id: string, tx: number, ty: number): boolean {
    const ch = this.characters.get(id)
    if (!ch) return false
    this.walkTo(ch, tx, ty)
    return true
  }

  private findFreeDeskIndex(): number {
    for (let i = 0; i < DESK_WAYPOINTS.length; i++) {
      if (!this.usedDesks.has(i)) return i
    }
    return -1
  }

  /* ── Resize / Camera ─────────────────────────────── */

  private resize() {
    const w = this.containerEl.clientWidth
    const h = this.containerEl.clientHeight
    this.canvas.width = w
    this.canvas.height = h
    this.autoFit()
  }

  private autoFit() {
    const cw = this.canvas.width
    const ch = this.canvas.height
    this.scale = Math.min(cw / WORLD_W, ch / WORLD_H)
    this.camX = (cw - WORLD_W * this.scale) / 2
    this.camY = (ch - WORLD_H * this.scale) / 2
  }

  /* ── Animation loop ──────────────────────────────── */

  private loop = (now: number) => {
    if (this.disposed) return
    const dt = Math.min(now - this.lastTime, 100)
    this.lastTime = now

    this.updateCharacters(dt)
    this.updateScreenAnim(dt)
    this.render()

    this.rafId = requestAnimationFrame(this.loop)
  }

  private updateScreenAnim(dt: number) {
    this.screenAnimTimer += dt
    if (this.screenAnimTimer > 500) {
      this.screenAnimTimer = 0
      this.screenAnimIdx = (this.screenAnimIdx + 1) % 3
    }
  }

  private updateCharacters(dt: number) {
    const speed = 0.06 // px per ms

    for (const ch of this.characters.values()) {
      if (ch.path.length === 0) continue

      const target = ch.path[0]
      const tpx = target.x * TILE_SIZE
      const tpy = target.y * TILE_SIZE
      const dx = tpx - ch.px
      const dy = tpy - ch.py
      const dist = Math.sqrt(dx * dx + dy * dy)
      const step = speed * dt

      if (Math.abs(dx) > Math.abs(dy)) {
        ch.direction = dx > 0 ? 'right' : 'left'
      } else {
        ch.direction = dy > 0 ? 'down' : 'up'
      }

      if (dist < step) {
        ch.px = tpx
        ch.py = tpy
        ch.tx = target.x
        ch.ty = target.y
        ch.path.shift()
        ch.walkFrame = 0
      } else {
        ch.px += (dx / dist) * step
        ch.py += (dy / dist) * step
        ch.walkTimer += dt
        if (ch.walkTimer > 150) {
          ch.walkTimer = 0
          ch.walkFrame = (ch.walkFrame + 1) % 3
        }
      }
    }
  }

  /* ── Rendering ───────────────────────────────────── */

  private render() {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, cw, ch)

    ctx.save()
    ctx.translate(this.camX, this.camY)
    ctx.scale(this.scale, this.scale)
    ctx.imageSmoothingEnabled = false

    this.drawFloor()
    this.drawFurnitureAndCharacters()

    ctx.restore()
  }

  private drawFloor() {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const spriteName = TILE_SPRITE[tileMap[row][col]]
        if (!spriteName) continue
        const frame = this.tileFrames[spriteName]
        if (!frame) continue
        this.drawSprite(this.tilesImg, frame, col * TILE_SIZE, row * TILE_SIZE)
      }
    }
  }

  private drawFurnitureAndCharacters() {
    const workstations = this.buildWorkstations()
    const wsIndices = new Set<number>()
    for (const ws of workstations) {
      wsIndices.add(ws.chairIdx)
      wsIndices.add(ws.deskIdx)
      if (ws.monitorIdx >= 0) wsIndices.add(ws.monitorIdx)
    }

    // 1) Draw workstations sorted by desk Y (chair → character → desk → monitor)
    const sortedWs = [...workstations].sort(
      (a, b) => furnitureList[a.deskIdx].y - furnitureList[b.deskIdx].y,
    )
    for (const ws of sortedWs) {
      this.drawWorkstation(ws)
    }

    // 2) Collect non-workstation furniture + walking characters for Y-sort
    const items: { sortY: number; draw: () => void }[] = []

    for (let fi = 0; fi < furnitureList.length; fi++) {
      if (wsIndices.has(fi)) continue
      const f = furnitureList[fi]
      const spriteName = FURNITURE_SPRITE[f.type]
      if (!spriteName) continue
      const frame = this.furnitureFrames[spriteName]
      if (!frame) continue

      const fx = f.x * TILE_SIZE + (f.offsetX ?? 0)
      const fy = f.y * TILE_SIZE + (f.offsetY ?? 0)
      items.push({
        sortY: fy + frame.h,
        draw: () => this.drawSprite(this.furnitureImg, frame, fx, fy),
      })
    }

    for (const ch of this.characters.values()) {
      // Skip seated workers (drawn in workstation pass)
      if (ch.data.status === 'working' && ch.deskSlotIdx >= 0 && ch.path.length === 0) continue
      const frameName = this.getWalkFrame(ch)
      const frame = this.charFrames[frameName]
      if (!frame) continue

      const dx = Math.round(ch.px + (TILE_SIZE - frame.w) / 2)
      const dy = Math.round(ch.py + TILE_SIZE - frame.h)
      items.push({
        sortY: ch.py + TILE_SIZE,
        draw: () => this.drawSprite(this.charsImg, frame, dx, dy),
      })
    }

    items.sort((a, b) => a.sortY - b.sortY)
    for (const item of items) item.draw()
  }

  private buildWorkstations(): Workstation[] {
    const result: Workstation[] = []

    for (let slotIdx = 0; slotIdx < DESK_WAYPOINTS.length; slotIdx++) {
      const wp = DESK_WAYPOINTS[slotIdx]
      let chairIdx = -1
      let deskIdx = -1
      let monitorIdx = -1

      for (let i = 0; i < furnitureList.length; i++) {
        const f = furnitureList[i]
        if (f.type === 'chair' && f.x === wp.x && f.y === wp.y) chairIdx = i
        if (f.type.includes('desk_only') && f.y === wp.y + 1 && wp.x >= f.x && wp.x < f.x + f.tileWidth)
          deskIdx = i
        if (f.type === 'monitor' && f.y === wp.y + 1 && f.x === wp.x)
          monitorIdx = i
      }

      if (chairIdx >= 0 && deskIdx >= 0) {
        let characterId: string | null = null
        for (const [id, ch] of this.characters) {
          if (ch.deskSlotIdx === slotIdx) { characterId = id; break }
        }
        result.push({ chairIdx, deskIdx, monitorIdx, characterId, deskSlotIdx: slotIdx })
      }
    }
    return result
  }

  private drawWorkstation(ws: Workstation) {
    const ctx = this.ctx
    const chair = furnitureList[ws.chairIdx]
    const desk = furnitureList[ws.deskIdx]

    // 1) Chair (bottom-aligned to tile)
    const chairSprite = FURNITURE_SPRITE[chair.type]
    if (chairSprite) {
      const frame = this.furnitureFrames[chairSprite]
      if (frame) {
        this.drawSprite(
          this.furnitureImg,
          frame,
          chair.x * TILE_SIZE + (chair.offsetX ?? 0),
          chair.y * TILE_SIZE + TILE_SIZE - frame.h + (chair.offsetY ?? 0),
        )
      }
    }

    // 2) Seated character (if working at desk)
    if (ws.characterId) {
      const ch = this.characters.get(ws.characterId)
      if (ch && ch.data.status === 'working' && ch.path.length === 0) {
        const isTyping = this.screenAnimIdx > 0
        const frameName = `${ch.skin}_${isTyping ? 'type' : 'sit'}`
        const frame = this.charFrames[frameName]
        if (frame) {
          const dx = Math.round(ch.px + (TILE_SIZE - frame.w) / 2)
          const dy = Math.round(ch.py)
          this.drawSprite(this.charsImg, frame, dx, dy)
        }
      }
    }

    // 3) Desk (bottom-aligned to tile)
    const deskSprite = FURNITURE_SPRITE[desk.type]
    let deskDx = 0
    let deskDy = 0
    let deskFrame: SpriteFrame | undefined
    if (deskSprite) {
      deskFrame = this.furnitureFrames[deskSprite]
      if (deskFrame) {
        deskDx = desk.x * TILE_SIZE + (desk.offsetX ?? 0)
        deskDy = desk.y * TILE_SIZE + TILE_SIZE - deskFrame.h + (desk.offsetY ?? 0)
        this.drawSprite(this.furnitureImg, deskFrame, deskDx, deskDy)

        // Desk label (agent name)
        if (ws.characterId) {
          const ch = this.characters.get(ws.characterId)
          if (ch) {
            const label = shortLabel(ch.data.name)
            ctx.save()
            ctx.font = 'bold 6px monospace'
            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(label, deskDx + deskFrame.w / 2, deskDy + deskFrame.h - 7)
            ctx.restore()
          }
        }
      }
    }

    // 4) Monitor
    if (ws.monitorIdx >= 0) {
      const monitor = furnitureList[ws.monitorIdx]
      const ch = ws.characterId ? this.characters.get(ws.characterId) : null
      const isWorking = ch != null && ch.data.status === 'working' && ch.path.length === 0

      const monitorSpriteName = isWorking
        ? MONITOR_ANIM_FRAMES[this.screenAnimIdx]
        : 'monitor_standalone_off'
      const frame = this.furnitureFrames[monitorSpriteName]
      if (frame) {
        this.drawSprite(
          this.furnitureImg,
          frame,
          monitor.x * TILE_SIZE + (TILE_SIZE - frame.w) / 2 + (monitor.offsetX ?? 0),
          monitor.y * TILE_SIZE + TILE_SIZE - frame.h - 6 + (monitor.offsetY ?? 0),
        )
      }
    }
  }

  private getWalkFrame(ch: InternalChar): string {
    if (ch.path.length > 0) {
      return `${ch.skin}_walk_${ch.direction}_${ch.walkFrame}`
    }
    return `${ch.skin}_idle_${this.screenAnimIdx % 2}`
  }

  private drawSprite(img: HTMLImageElement, f: SpriteFrame, x: number, y: number) {
    this.ctx.drawImage(img, f.x, f.y, f.w, f.h, x, y, f.w, f.h)
  }

  /* ── Interaction ─────────────────────────────────── */

  private setupInteraction() {
    const canvas = this.canvas

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const oldScale = this.scale
      const factor = e.deltaY > 0 ? 0.85 : 1.18
      this.scale = Math.max(0.5, Math.min(6, this.scale * factor))

      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      this.camX = mx - (mx - this.camX) * (this.scale / oldScale)
      this.camY = my - (my - this.camY) * (this.scale / oldScale)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    this.cleanupFns.push(() => canvas.removeEventListener('wheel', onWheel))

    let clickCandidate = false
    let clickX = 0
    let clickY = 0

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      this.dragging = true
      clickCandidate = true
      clickX = e.clientX
      clickY = e.clientY
      this.dragStart = { x: e.clientX, y: e.clientY }
      this.dragCamStart = { x: this.camX, y: this.camY }
    }
    canvas.addEventListener('pointerdown', onDown)
    this.cleanupFns.push(() => canvas.removeEventListener('pointerdown', onDown))

    const onMove = (e: PointerEvent) => {
      if (!this.dragging) return
      if (Math.abs(e.clientX - clickX) > 4 || Math.abs(e.clientY - clickY) > 4)
        clickCandidate = false
      this.camX = this.dragCamStart.x + (e.clientX - this.dragStart.x)
      this.camY = this.dragCamStart.y + (e.clientY - this.dragStart.y)
    }
    window.addEventListener('pointermove', onMove)
    this.cleanupFns.push(() => window.removeEventListener('pointermove', onMove))

    const onUp = (e: PointerEvent) => {
      if (!this.dragging) return
      this.dragging = false
      if (!clickCandidate) return

      const rect = canvas.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - this.camX) / this.scale
      const worldY = (e.clientY - rect.top - this.camY) / this.scale

      const hitId = this.hitTestCharacter(worldX, worldY)
      if (hitId) {
        this.emit({ type: 'click-character', id: hitId })
      } else {
        const tx = Math.floor(worldX / TILE_SIZE)
        const ty = Math.floor(worldY / TILE_SIZE)
        this.emit({ type: 'click-floor', tx, ty })
      }
    }
    window.addEventListener('pointerup', onUp)
    this.cleanupFns.push(() => window.removeEventListener('pointerup', onUp))
  }

  private hitTestCharacter(worldX: number, worldY: number): string | null {
    // Check workstation desk areas (for seated agents)
    for (const [id, ch] of this.characters) {
      if (ch.deskSlotIdx < 0) continue
      const wp = DESK_WAYPOINTS[ch.deskSlotIdx]
      if (!wp) continue
      const left = (wp.x - 1) * TILE_SIZE
      const right = (wp.x + 2) * TILE_SIZE
      const top = wp.y * TILE_SIZE
      const bottom = (wp.y + 2) * TILE_SIZE
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return id
      }
    }
    // Check walking/idle characters
    for (const [id, ch] of this.characters) {
      if (worldX >= ch.px && worldX <= ch.px + TILE_SIZE &&
          worldY >= ch.py - 8 && worldY <= ch.py + TILE_SIZE) {
        return id
      }
    }
    return null
  }

  /* ── Helpers ─────────────────────────────────────── */

  private emit(evt: PixelEngineEvent) {
    for (const h of this.handlers) h(evt)
  }
}

/* ── Utility ───────────────────────────────────────── */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function shortLabel(name: string): string {
  if (name.length <= 6) return name
  return name.slice(0, 5) + '.'
}
