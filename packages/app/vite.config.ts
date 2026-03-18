import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const coreBase = path.resolve(__dirname, "../core");

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: {
    port: 3000,
    proxy: {
      "/api/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ""),
      },
      "/api/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openai/, ""),
      },
    },
  },
  resolve: {
    conditions: ["svelte", "browser"],
    alias: {
      "@meport/core/pack-engine": path.join(coreBase, "dist/profiler/pack-engine.js"),
      "@meport/core/pack-loader": path.join(coreBase, "dist/profiler/pack-loader.js"),
      "@meport/core/inference": path.join(coreBase, "dist/inference/index.js"),
      "@meport/core/engine": path.join(coreBase, "dist/profiler/engine.js"),
      "@meport/core/interviewer": path.join(coreBase, "dist/ai/interviewer.js"),
      "@meport/core/enricher": path.join(coreBase, "dist/ai/enricher.js"),
      "@meport/core/client": path.join(coreBase, "dist/ai/client.js"),
      "@meport/core/browser-detect": path.join(coreBase, "dist/profiler/browser-detect.js"),
      "@meport/core/file-scanner": path.join(coreBase, "dist/profiler/file-scanner.js"),
      "@meport/core/importer": path.join(coreBase, "dist/importer/text-parser.js"),
      "@meport/core/types": path.join(coreBase, "dist/schema/types.js"),
      "@meport/core/compiler": path.join(coreBase, "dist/compiler/index.js"),
      "@meport/core": path.join(coreBase, "dist/index.js"),
    },
  },
  optimizeDeps: {
    exclude: ["@meport/core"],
  },
});
