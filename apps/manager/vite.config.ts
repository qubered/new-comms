import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Phones only allow the microphone on https (or localhost), so dev is https with a
// self-signed certificate. Accept the browser warning once per phone.
export default defineConfig({
  plugins: [react(), ...(process.env.COMMS_HTTP ? [] : [basicSsl()])],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:8080", changeOrigin: false } },
  },
});
