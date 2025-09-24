// Simple 2D Canvas engine matching the draggable triangle API of the WebGL/WebGPU engines.
// Public API: EngineCanvas.create({canvas}), start(), stop(), dispose().

export interface EngineCanvasOptions { canvas: HTMLCanvasElement }

interface PointerState { dragging: boolean; lastX: number; lastY: number }

export class EngineCanvas {
  private canvas: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private running = false
  private animationFrame: number | null = null
  private translation = { x: 0, y: 0 } // in clip space units (same semantics as other engines)
  private pointer: PointerState = { dragging: false, lastX: 0, lastY: 0 }

  private constructor(opts: EngineCanvasOptions) { this.canvas = opts.canvas }

  static async create(opts: EngineCanvasOptions): Promise<EngineCanvas> {
    const e = new EngineCanvas(opts)
    e.init()
    return e
  }

  private init() {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) { console.error('2D canvas not supported'); return }
    this.ctx = ctx
    this.setupEvents()
  }

  private setupEvents() {
    const c = this.canvas
    const onPointerDown = (e: PointerEvent) => { c.setPointerCapture(e.pointerId); this.pointer.dragging = true; this.pointer.lastX = e.clientX; this.pointer.lastY = e.clientY }
    const onPointerMove = (e: PointerEvent) => {
      if (!this.pointer.dragging) return
      const dx = e.clientX - this.pointer.lastX
      const dy = e.clientY - this.pointer.lastY
      this.pointer.lastX = e.clientX
      this.pointer.lastY = e.clientY
      const w = this.canvas.clientWidth
      const h = this.canvas.clientHeight
      this.translation.x += dx / (w / 2)
      this.translation.y -= dy / (h / 2) // invert y like other engines
      this.translation.x = Math.max(-2, Math.min(2, this.translation.x))
      this.translation.y = Math.max(-2, Math.min(2, this.translation.y))
    }
    const endDrag = (e: PointerEvent) => { if (this.pointer.dragging) { try { c.releasePointerCapture(e.pointerId) } catch { } } this.pointer.dragging = false }
    c.addEventListener('pointerdown', onPointerDown)
    c.addEventListener('pointermove', onPointerMove)
    c.addEventListener('pointerup', endDrag)
    c.addEventListener('pointerleave', endDrag)
    const onResize = () => { /* canvas sized via attributes & CSS; no special handling */ }
    window.addEventListener('resize', onResize)
    ;(this.canvas as any)._engineCleanupCanvas = () => {
      c.removeEventListener('pointerdown', onPointerDown)
      c.removeEventListener('pointermove', onPointerMove)
      c.removeEventListener('pointerup', endDrag)
      c.removeEventListener('pointerleave', endDrag)
      window.removeEventListener('resize', onResize)
    }
  }

  start() {
    if (this.running) return
    this.running = true
    const frame = () => { if (!this.running) return; this.draw(); this.animationFrame = requestAnimationFrame(frame) }
    frame()
  }
  stop() { this.running = false; if (this.animationFrame) cancelAnimationFrame(this.animationFrame); this.animationFrame = null }
  dispose() { this.stop(); const cleanup = (this.canvas as any)._engineCleanupCanvas; if (cleanup) cleanup() }

  private clear() {
    this.ctx.fillStyle = '#141418'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private clipToPixel(x: number, y: number) {
    // Clip space (-1..1) to canvas pixels; y up in clip, down in canvas
    const px = (x + 1) * 0.5 * this.canvas.width
    const py = (1 - (y)) * 0.5 * this.canvas.height
    return { x: px, y: py }
  }

  private drawTriangle() {
    // Same base vertices as other engines
    const verts = [
      [0.0, 0.3],
      [-0.3, -0.3],
      [0.3, -0.3]
    ] as const
    const t = this.translation
    const p0 = this.clipToPixel(verts[0][0] + t.x, verts[0][1] + t.y)
    const p1 = this.clipToPixel(verts[1][0] + t.x, verts[1][1] + t.y)
    const p2 = this.clipToPixel(verts[2][0] + t.x, verts[2][1] + t.y)

    this.ctx.beginPath()
    this.ctx.moveTo(p0.x, p0.y)
    this.ctx.lineTo(p1.x, p1.y)
    this.ctx.lineTo(p2.x, p2.y)
    this.ctx.closePath()
    // Flat fill color (approx average of the RGB corners for visual similarity)
    this.ctx.fillStyle = '#5a55d6'
    this.ctx.fill()
  }

  private draw() {
    // Ensure internal canvas size matches displayed size (like WebGPU DPR logic not strictly needed but helpful)
    const dpr = window.devicePixelRatio || 1
    const w = Math.floor(this.canvas.clientWidth * dpr)
    const h = Math.floor(this.canvas.clientHeight * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h
    }
    this.clear()
    this.drawTriangle()
  }
}
