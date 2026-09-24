import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// in dev, vite serves the ui on :5173 and forwards /api to the fastapi server
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
