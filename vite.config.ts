import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Determine base for GitHub Pages. If deploying to <user>.github.io root, leave '/'.
// Otherwise, GitHub Pages serves at '/<repo>/'. Set GH_PAGES_REPO to override in workflow.
const repo = process.env.GH_PAGES_REPO
const isUserSite = repo ? /\.github\.io$/i.test(repo) : false
const base = repo && !isUserSite ? `/${repo.split('/').pop()}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  base
})
