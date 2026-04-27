# @telescope/vite

Vite plugin that lets [Telescope](https://github.com/lklyne/telescope) render
a single React component from your repo as a live frame on the canvas.

> Status: skeleton. The middleware, bootstrap, and HMR bridge land in a follow-up commit.

## Install

```sh
pnpm add -D @telescope/vite
```

## Use

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import telescope from '@telescope/vite'

export default defineConfig({
  plugins: [telescope()],
})
```

Then start your dev server normally and connect Telescope to the repo via the
inspector pane.
