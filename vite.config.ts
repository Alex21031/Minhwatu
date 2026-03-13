import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "assets",
  build: {
    outDir: "build/web"
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      },
      "/health": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      }
    }
  }
});
