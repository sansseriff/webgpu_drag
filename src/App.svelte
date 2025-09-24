<script lang="ts">
  import svelteLogo from "./assets/svelte.svg";
  import viteLogo from "/vite.svg";
  import Counter from "./lib/Counter.svelte";
  import { onMount, onDestroy } from "svelte";
  import { Engine as EngineGPU } from "./lib/engine";
  import { EngineGL } from "./lib/engine_gl";
  import { EngineCanvas } from "./lib/engine_canvas";

  type Mode = "webgpu" | "webgl" | "canvas";
  let preferred: Mode = "webgpu";
  let mode: Mode = "webgpu";
  let canvas: HTMLCanvasElement;
  let engine: any = null;
  let supportedWebGPU = false;

  async function initEngine() {
    engine?.dispose?.();
    engine = null;
    if (mode === "webgpu") {
      if (!supportedWebGPU) {
        // Fallback to next mode in cycle when WebGPU unsupported
        mode = "webgl";
        return initEngine();
      }
      engine = await EngineGPU.create({ canvas });
    } else if (mode === "webgl") {
      engine = await EngineGL.create({ canvas });
    } else {
      engine = await EngineCanvas.create({ canvas });
    }
    engine.start();
  }

  function nextMode(current: Mode): Mode {
    // Cycle order requested: webgl -> webgpu -> canvas
    if (current === "webgl") return "webgpu";
    if (current === "webgpu") return "canvas";
    return "webgl"; // canvas -> webgl
  }

  function toggle() {
    mode = nextMode(mode);
    canvasKey = `${mode}-${Date.now()}`; // force new canvas & engine recreation
  }

  let canvasKey = `${mode}`;

  onMount(async () => {
    supportedWebGPU = "gpu" in navigator;
    if (!supportedWebGPU) mode = "webgl";
  });
  $: if (canvas) initEngine();

  onDestroy(() => {
    engine?.dispose?.();
  });
</script>

<main>
  <h1>Triangle + Drag ({mode.toUpperCase()})</h1>
  <div class="actions">
    <button on:click={toggle}>
      {#if mode === 'webgl'}Switch to WebGPU{/if}
      {#if mode === 'webgpu'}Switch to Canvas{/if}
      {#if mode === 'canvas'}Switch to WebGL{/if}
    </button>
    {#if mode === "webgpu" && !supportedWebGPU}
      <span class="warn">WebGPU not supported, fell back to WebGL.</span>
    {/if}
  </div>
  <div class="gpu-wrapper">
    {#key canvasKey}
      <canvas bind:this={canvas} class="gpu-canvas" width={640} height={400}
      ></canvas>
    {/key}
  </div>
  <p class="read-the-docs">
    Drag inside canvas to move triangle. Toggle between WebGPU and WebGL
    implementations.
  </p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .logos {
    display: flex;
  }
  .logo {
    height: 4em;
    padding: 1em;
    will-change: filter;
    transition: filter 300ms;
  }
  .logo:hover {
    filter: drop-shadow(0 0 2em #646cffaa);
  }
  .logo.svelte:hover {
    filter: drop-shadow(0 0 2em #ff3e00aa);
  }
  .gpu-wrapper {
    border: 1px solid #333;
    background: #111;
    padding: 4px;
    border-radius: 6px;
  }
  .gpu-canvas {
    width: 640px;
    height: 400px;
    display: block;
    cursor: grab;
  }
  .gpu-canvas:active {
    cursor: grabbing;
  }
  .read-the-docs {
    color: #888;
    max-width: 640px;
    text-align: center;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  button {
    background: #222;
    color: #eee;
    border: 1px solid #444;
    padding: 0.5rem 0.9rem;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background: #333;
  }
  .warn {
    color: #ffae42;
    font-size: 0.85rem;
  }
</style>
