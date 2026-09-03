import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ページ下部に「いつのビルドか」を出すための埋め込み。
// デプロイしたのに古い内容が見えているのかどうかを、開いた人が判断できる。
const buildTime = new Date().toISOString()

// GitHub Pages: https://sheettori.github.io/SolfaGym/
// base を外すとビルド後のアセットが 404 になる。

export default defineConfig({
  base: '/SolfaGym/',
  define: { __BUILD_TIME__: JSON.stringify(buildTime) },
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
