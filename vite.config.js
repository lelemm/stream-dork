import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
  base: "./", // Use relative paths for assets so they work when loaded from ASAR
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        setup: resolve(__dirname, "src/pages/setup.html"),
        overlay: resolve(__dirname, "src/pages/overlay.html"),
        notification: resolve(__dirname, "src/pages/notification.html"),
      },
      output: {
        entryFileNames: "js/[name].js",
        chunkFileNames: "js/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
        format: "es",
      },
    },
  },
})

