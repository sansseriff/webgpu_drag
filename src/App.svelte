<script lang="ts">
  import svelteLogo from './assets/svelte.svg'
  import viteLogo from '/vite.svg'
  import Counter from './lib/Counter.svelte'
  import { onMount, onDestroy } from 'svelte'
  import { Engine } from './lib/engine'

  let canvas: HTMLCanvasElement
  let engine: Engine | null = null

  onMount(async () => {
    if (canvas) {
      engine = await Engine.create({ canvas })
      engine.start()
    }
  })
  onDestroy(() => {
    engine?.dispose()
  })
</script>

<main>
  <div class="logos">
    <a href="https://vite.dev" target="_blank" rel="noreferrer">
      <img src={viteLogo} class="logo" alt="Vite Logo" />
    </a>
    <a href="https://svelte.dev" target="_blank" rel="noreferrer">
      <img src={svelteLogo} class="logo svelte" alt="Svelte Logo" />
    </a>
  </div>
  <h1>WebGPU Triangle + Drag</h1>
  <div class="gpu-wrapper">
    <canvas bind:this={canvas} class="gpu-canvas" width={640} height={400}></canvas>
  </div>
  <div class="card">
    <Counter />
  </div>
  <p class="read-the-docs">Drag inside canvas to move triangle. If you don't see anything your browser may not support WebGPU (Chromium-based with flag or Safari TP).</p>
</main>

<style>
  main { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
  .logos { display: flex; }
  .logo { height: 4em; padding: 1em; will-change: filter; transition: filter 300ms; }
  .logo:hover { filter: drop-shadow(0 0 2em #646cffaa); }
  .logo.svelte:hover { filter: drop-shadow(0 0 2em #ff3e00aa); }
  .gpu-wrapper { border: 1px solid #333; background:#111; padding:4px; border-radius:6px; }
  .gpu-canvas { width:640px; height:400px; display:block; cursor: grab; }
  .gpu-canvas:active { cursor: grabbing; }
  .read-the-docs { color:#888; max-width: 640px; text-align:center; }
</style>
