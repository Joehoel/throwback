import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { env } from "node:process";

const buildId = env.THROWBACK_BUILD_ID ?? "development";

const config = defineConfig({
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  build: {
    sourcemap: true,
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
  define: {
    "import.meta.env.VITE_THROWBACK_BUILD_ID": JSON.stringify(buildId),
  },
  environments: {
    ssr: {
      optimizeDeps: { exclude: ["effect"] },
    },
  },
  resolve: { tsconfigPaths: true },
});

export default config;
