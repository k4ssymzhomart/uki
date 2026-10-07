import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The mock KRU exam portal for browser exams; the seed's SEED_LMS_URL points here (port 5180 locally).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
});
