# @specular/vite

Vite plugin that lets [Specular](https://github.com/lklyne/specular) render
a single React component from your repo as a live frame on the canvas.

> Status: skeleton. The middleware, bootstrap, and HMR bridge land in a follow-up commit.

## Install

```sh
pnpm add -D @specular/vite
```

## Use

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import specular from '@specular/vite'

export default defineConfig({
  plugins: [specular()],
})
```

Then start your dev server normally and connect Specular to the repo via the
inspector pane.
