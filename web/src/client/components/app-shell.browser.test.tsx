import { render } from "@testing-library/react";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "valibot";
import { vLibraryIndexing, vLibrarySelectionRequired } from "../generated/valibot.gen.ts";
import { ReviewShell } from "./review-shell.tsx";
import { SetupShell } from "./setup-shell.tsx";
import { SignInShell } from "./sign-in-shell.tsx";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Beheer-webapp shells", () => {
  it("renders the sign-in shell from bootstrap state", async () => {
    render(<SignInShell />);

    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("familiefoto's");
    await expect.element(page.getByText("Volgende stap bevestigd door de server")).toBeVisible();
  });

  it("renders setup and review shells responsively", async () => {
    const librarySelection = parse(
      vLibrarySelectionRequired,
      JSON.parse('{"_tag":"LibrarySelectionRequired"}'),
    );

    render(<SetupShell state={librarySelection} step="library" />);
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Hoofdmap");

    document.body.innerHTML = "";

    const indexing = parse(
      vLibraryIndexing,
      JSON.parse('{"_tag":"LibraryIndexing","discoveredPhotos":42}'),
    );

    render(<ReviewShell state={indexing} />);
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("voorbereid");
  });
});
