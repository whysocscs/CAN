import path from "node:path"
import { realpathSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8443),
    strictPort: true,
    fs: {
      allow: [
        path.resolve(__dirname),
        realpathSync(path.resolve(__dirname, "node_modules")),
      ],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8443),
  },
})
