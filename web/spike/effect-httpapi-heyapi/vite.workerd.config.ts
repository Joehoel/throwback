import cloudflare from "@distilled.cloud/cloudflare-vite-plugin";
import { Text } from "@distilled.cloud/cloudflare-runtime/bindings";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import viteReact from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      compatibilityDate: "2026-06-02",
      compatibilityFlags: ["nodejs_compat"],
      exports: ["default"],
      worker: {
        name: "throwback-httpapi-heyapi-spike",
        bindings: [
          Text.local("BETTER_AUTH_URL", "http://127.0.0.1:3000"),
          Text.local("BETTER_AUTH_SECRET", "spike-only-placeholder-secret-at-least-32-characters"),
          Text.local("MICROSOFT_CLIENT_ID", ""),
          Text.local("MICROSOFT_CLIENT_SECRET", ""),
          Text.local("GEMINI_API_KEY", ""),
        ],
      },
    }),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  build: {
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
  environments: {
    ssr: {
      optimizeDeps: { exclude: ["effect"] },
    },
  },
  resolve: { tsconfigPaths: true },
});
