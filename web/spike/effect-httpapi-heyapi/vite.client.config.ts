import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/browser-entry.ts", import.meta.url)),
      fileName: "client-proof",
      formats: ["es"],
    },
    minify: false,
    outDir: "./dist/client",
    sourcemap: true,
  },
});
