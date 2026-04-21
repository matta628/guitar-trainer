import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/guitar-trainer/",
  server: { https: false, port: 5173 },
});
