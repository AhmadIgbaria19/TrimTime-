import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const clientDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(clientDir, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const port = Number(env.CLIENT_PORT || 3001);
  const apiPort = env.API_PORT || "4000";

  return {
    envDir: rootDir,
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
