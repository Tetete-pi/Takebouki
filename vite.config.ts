import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages などのサブパス配信を想定する場合は base を書き換える
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    target: "es2021",
  },
});
