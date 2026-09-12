import { createFileRoute } from "@tanstack/react-router";
import { loadHome } from "#/client/routes/home-loader.ts";

export const Route = createFileRoute("/")({ beforeLoad: loadHome });
