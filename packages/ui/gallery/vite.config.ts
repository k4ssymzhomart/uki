import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Development-only gallery of every @uki/ui primitive next to its Figma screenshot.
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: { port: 5190, strictPort: true },
});
