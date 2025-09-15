// Minimal WebGL (2 if available else 1) engine replicating the draggable triangle API of the WebGPU Engine.
// Public API mirrors Engine: EngineGL.create({canvas}), start(), stop(), dispose().

export interface EngineGLOptions { canvas: HTMLCanvasElement }

export class EngineGL {
    private canvas: HTMLCanvasElement
    private gl!: WebGLRenderingContext | WebGL2RenderingContext
    private program!: WebGLProgram
    private positionLoc!: number
    private colorLoc!: number
    private translationLoc!: WebGLUniformLocation | null
    private buffer!: WebGLBuffer
    private running = false
    private animationFrame: number | null = null
    private translation = { x: 0, y: 0 }
    private pointer = { dragging: false, lastX: 0, lastY: 0 }

    private constructor(opts: EngineGLOptions) { this.canvas = opts.canvas }

    static async create(opts: EngineGLOptions): Promise<EngineGL> {
        const e = new EngineGL(opts)
        e.init()
        return e
    }

    private init() {
        const gl = (this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null
        if (!gl) {
            console.error('WebGL not supported')
            return
        }
        this.gl = gl
        this.setupGL()
        this.setupEvents()
    }

    private setupGL() {
        const gl = this.gl
        const vs = gl.createShader(gl.VERTEX_SHADER)!
        gl.shaderSource(vs, `attribute vec2 a_position;\nattribute vec3 a_color;\nvarying vec3 v_color;\nuniform vec2 u_translation;\nvoid main(){\n  vec2 pos = a_position + u_translation;\n  gl_Position = vec4(pos,0.0,1.0);\n  v_color = a_color;\n}`)
        gl.compileShader(vs)
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs))

        const fs = gl.createShader(gl.FRAGMENT_SHADER)!
        gl.shaderSource(fs, `precision mediump float;\nvarying vec3 v_color;\nvoid main(){\n  gl_FragColor = vec4(v_color,1.0);\n}`)
        gl.compileShader(fs)
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs))

        const prog = gl.createProgram()!
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog))

        this.program = prog
        gl.useProgram(this.program)

        this.positionLoc = gl.getAttribLocation(prog, 'a_position')
        this.colorLoc = gl.getAttribLocation(prog, 'a_color')
        this.translationLoc = gl.getUniformLocation(prog, 'u_translation')

        // Interleaved buffer same layout as WebGPU version
        const verts = new Float32Array([
            0.0, 0.3, 1, 0, 0,
            -0.3, -0.3, 0, 1, 0,
            0.3, -0.3, 0, 0, 1
        ])
        const buf = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
        this.buffer = buf

        gl.enableVertexAttribArray(this.positionLoc)
        gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 5 * 4, 0)
        gl.enableVertexAttribArray(this.colorLoc)
        gl.vertexAttribPointer(this.colorLoc, 3, gl.FLOAT, false, 5 * 4, 2 * 4)

        gl.clearColor(0.08, 0.08, 0.10, 1)
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
            this.translation.y -= dy / (h / 2)
            this.translation.x = Math.max(-2, Math.min(2, this.translation.x))
            this.translation.y = Math.max(-2, Math.min(2, this.translation.y))
        }
        const endDrag = (e: PointerEvent) => { if (this.pointer.dragging) { try { c.releasePointerCapture(e.pointerId) } catch { } } this.pointer.dragging = false }
        c.addEventListener('pointerdown', onPointerDown)
        c.addEventListener('pointermove', onPointerMove)
        c.addEventListener('pointerup', endDrag)
        c.addEventListener('pointerleave', endDrag)
        const onResize = () => { /* no special handling; canvas sized via CSS */ }
        window.addEventListener('resize', onResize)
            ; (this.canvas as any)._engineCleanupGL = () => {
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
    dispose() { this.stop(); const cleanup = (this.canvas as any)._engineCleanupGL; if (cleanup) cleanup() }

    private draw() {
        const gl = this.gl
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(this.program)
        gl.uniform2f(this.translationLoc, this.translation.x, this.translation.y)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
        gl.enableVertexAttribArray(this.positionLoc)
        gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 5 * 4, 0)
        gl.enableVertexAttribArray(this.colorLoc)
        gl.vertexAttribPointer(this.colorLoc, 3, gl.FLOAT, false, 5 * 4, 2 * 4)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
}
