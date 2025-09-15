// Basic WebGPU engine that draws a draggable triangle.
// Public API: Engine.start() / Engine.stop(); translation controlled via pointer drag on canvas.

// Minimal ambient declarations for WebGPU if TS lib isn't present.
// (When targeting a TS version with built-in webgpu lib, these are ignored.)
// You can replace by adding  "lib": ["DOM", "DOM.Iterable", "ES2022", "WebGPU"] in tsconfig once stable.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface GPU { }
interface GPUAdapter { requestDevice(): Promise<GPUDevice>; }
interface GPUDevice { createShaderModule(desc: any): GPUShaderModule; createRenderPipeline(desc: any): GPURenderPipeline; createBuffer(desc: any): GPUBuffer; queue: { writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBuffer, dataOffset?: number, size?: number): void; submit(cmds: GPUCommandBuffer[]): void; }; createBindGroup(desc: any): GPUBindGroup; createCommandEncoder(): GPUCommandEncoder; }
interface GPUCanvasContext { configure(desc: any): void; getCurrentTexture(): { createView(): any }; }
interface GPUShaderModule { }
interface GPURenderPipeline { getBindGroupLayout(index: number): any }
interface GPUBuffer { }
interface GPUBindGroup { }
interface GPUCommandEncoder { beginRenderPass(desc: any): GPURenderPassEncoder; finish(): GPUCommandBuffer; }
interface GPUCommandBuffer { }
interface GPURenderPassEncoder { setPipeline(p: GPURenderPipeline): void; setBindGroup(index: number, bg: GPUBindGroup): void; setVertexBuffer(slot: number, buffer: GPUBuffer): void; draw(vCount: number, instCount: number, firstVertex: number, firstInstance: number): void; end(): void; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Navigator { gpu?: any }
// GPU constants placeholder
// Removed runtime mock of GPUBufferUsage; will fall back to numeric literals inline where needed if types not present.
// Proper fallback constant values (spec):
// MAP_READ:0x0001, MAP_WRITE:0x0002, COPY_SRC:0x0004, COPY_DST:0x0008,
// INDEX:0x0010, VERTEX:0x0020, UNIFORM:0x0040, STORAGE:0x0080,
// INDIRECT:0x0100, QUERY_RESOLVE:0x0200
const FallbackGPUBufferUsage = {
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
};

export interface EngineOptions {
    canvas: HTMLCanvasElement;
    animate?: boolean; // default true
}

interface PointerState {
    dragging: boolean;
    lastX: number;
    lastY: number;
}

export class Engine {
    private canvas: HTMLCanvasElement;
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private format!: any;
    private pipeline!: GPURenderPipeline;
    private uniformBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;
    private animationFrame: number | null = null;
    private running = false;
    private translation: { x: number; y: number } = { x: 0, y: 0 };
    private pointer: PointerState = { dragging: false, lastX: 0, lastY: 0 };
    private needsUpload = true; // flag to re-upload uniform only when changed

    private constructor(opts: EngineOptions) {
        this.canvas = opts.canvas;
    }

    static async create(opts: EngineOptions): Promise<Engine> {
        const engine = new Engine(opts);
        await engine.init();
        return engine;
    }

    private async init() {
        if (!('gpu' in navigator)) {
            console.error('WebGPU not supported in this browser.');
            return;
        }

        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter) {
            console.error('Failed to get GPU adapter');
            return;
        }
        const device = await adapter.requestDevice();
        this.device = device;

        const context = this.canvas.getContext('webgpu') as unknown as GPUCanvasContext;
        if (!context) {
            console.error('Unable to acquire WebGPU context from canvas');
            return;
        }
        this.context = context;
        this.format = (navigator as any).gpu.getPreferredCanvasFormat();
        this.configureContext();

        this.createPipeline();
        this.createUniforms();
        this.setupEvents();
    }

    private configureContext() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(this.canvas.clientWidth * dpr);
        const height = Math.floor(this.canvas.clientHeight * dpr);
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque'
        });
    }

    private createPipeline() {
        const vertexWGSL = /* wgsl */ `
      struct VSOut {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec3<f32>,
      };

      struct Uniforms {
        translation: vec2<f32>,
      };
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn main(@location(0) pos: vec2<f32>, @location(1) color: vec3<f32>) -> VSOut {
        var out: VSOut;
        let translated = pos + uniforms.translation;
        out.position = vec4<f32>(translated, 0.0, 1.0);
        out.color = color;
        return out;
      }
    `;

        const fragmentWGSL = /* wgsl */ `
      @fragment
      fn main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
        return vec4<f32>(color, 1.0);
      }
    `;

        const moduleVert = this.device.createShaderModule({ code: vertexWGSL });
        const moduleFrag = this.device.createShaderModule({ code: fragmentWGSL });

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: moduleVert,
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 5 * 4, // 2 pos + 3 color
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x2' },
                            { shaderLocation: 1, offset: 2 * 4, format: 'float32x3' }
                        ]
                    }
                ]
            },
            fragment: {
                module: moduleFrag,
                entryPoint: 'main',
                targets: [{ format: this.format }]
            },
            primitive: { topology: 'triangle-list' }
        });
    }

    private createUniforms() {
        // Uniform buffer: 2 floats (vec2) aligned to 8 bytes; std140-like rules for WGSL uniforms require 16-byte alignment for struct size.
        const uniformBufferSize = 16; // pad to 16 bytes
        this.uniformBuffer = this.device.createBuffer({
            size: uniformBufferSize,
            usage: FallbackGPUBufferUsage.UNIFORM | FallbackGPUBufferUsage.COPY_DST
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } }
            ]
        });
        this.uploadUniforms();
    }

    private uploadUniforms() {
        // Write translation (x,y) and pad.
        const array = new Float32Array([this.translation.x, this.translation.y, 0, 0]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, array.buffer, array.byteOffset, array.byteLength);
        this.needsUpload = false;
    }

    private setupEvents() {
        const c = this.canvas;

        const onPointerDown = (e: PointerEvent) => {
            c.setPointerCapture(e.pointerId);
            this.pointer.dragging = true;
            this.pointer.lastX = e.clientX;
            this.pointer.lastY = e.clientY;
        };
        const onPointerMove = (e: PointerEvent) => {
            if (!this.pointer.dragging) return;
            const dx = e.clientX - this.pointer.lastX;
            const dy = e.clientY - this.pointer.lastY;
            this.pointer.lastX = e.clientX;
            this.pointer.lastY = e.clientY;

            // Convert pixel delta to clip space ([-1,1])
            const w = this.canvas.clientWidth; // use CSS size for pointer delta normalization
            const h = this.canvas.clientHeight;
            this.translation.x += dx / (w / 2);
            this.translation.y -= dy / (h / 2); // invert Y
            // Clamp to something reasonable so it doesn't go too far.
            this.translation.x = Math.max(-2, Math.min(2, this.translation.x));
            this.translation.y = Math.max(-2, Math.min(2, this.translation.y));
            this.needsUpload = true;
        };
        const endDrag = (e: PointerEvent) => {
            if (this.pointer.dragging) {
                try { c.releasePointerCapture(e.pointerId); } catch { }
            }
            this.pointer.dragging = false;
        };

        c.addEventListener('pointerdown', onPointerDown);
        c.addEventListener('pointermove', onPointerMove);
        c.addEventListener('pointerup', endDrag);
        c.addEventListener('pointerleave', endDrag);

        // resize
        const onResize = () => {
            this.configureContext();
        };
        window.addEventListener('resize', onResize);

        // Store cleanup on canvas dataset for external disposal (simple approach)
        (this.canvas as any)._engineCleanup = () => {
            c.removeEventListener('pointerdown', onPointerDown);
            c.removeEventListener('pointermove', onPointerMove);
            c.removeEventListener('pointerup', endDrag);
            c.removeEventListener('pointerleave', endDrag);
            window.removeEventListener('resize', onResize);
        };
    }

    start() {
        if (this.running) return;
        this.running = true;
        const frame = () => {
            if (!this.running) return;
            this.drawFrame();
            this.animationFrame = requestAnimationFrame(frame);
        };
        frame();
    }

    stop() {
        this.running = false;
        if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
    }

    dispose() {
        this.stop();
        const cleanup = (this.canvas as any)._engineCleanup;
        if (cleanup) cleanup();
    }

    private drawFrame() {
        if (this.needsUpload) this.uploadUniforms();

        const encoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        // Triangle vertex data (static - could be cached in a vertex buffer; for simplicity we recreate once and store)
        if (!this._vertexBuffer) this.createVertexBuffer();

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.08, g: 0.08, b: 0.1, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this._vertexBuffer!);
        renderPass.draw(3, 1, 0, 0);
        renderPass.end();

        this.device.queue.submit([encoder.finish()]);
    }

    private _vertexBuffer: GPUBuffer | null = null;

    private createVertexBuffer() {
        // Interleaved pos(x,y), color(r,g,b). Triangle centered at origin.
        const vertices = new Float32Array([
            //   x,    y,    r,   g,   b
            0.0, 0.3, 1, 0, 0,
            -0.3, -0.3, 0, 1, 0,
            0.3, -0.3, 0, 0, 1,
        ]);
        this._vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: FallbackGPUBufferUsage.VERTEX | FallbackGPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this._vertexBuffer, 0, vertices.buffer, vertices.byteOffset, vertices.byteLength);
    }
}
