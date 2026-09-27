import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "valibot";
import {
  vCuratorClaimRequired,
  vLibraryIndexing,
  vLibrarySelectionRequired,
  vPhoto,
  vSignInRequired,
} from "../generated/valibot.gen.ts";
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
      .toHaveTextContent("Breng de verhalen achter je familiefoto's terug.");
    await expect.element(page.getByText("Volgende stap bevestigd door de server")).toBeVisible();
  });

  it("renders setup and review shells responsively", async () => {
    const librarySelection = parse(
      vLibrarySelectionRequired,
      JSON.parse('{"_tag":"LibrarySelectionRequired"}'),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SetupShell state={librarySelection} step="library" />
      </QueryClientProvider>,
    );
    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Kies de Hoofdmap");
    await expect
      .element(page.getByRole("button", { name: "Uitloggen op dit apparaat" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Uitloggen op alle apparaten" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Cloudflare Access uitloggen" }))
      .toBeVisible();

    document.body.innerHTML = "";

    const indexing = parse(
      vLibraryIndexing,
      JSON.parse(
        '{"_tag":"LibraryIndexing","libraryId":"00000000-0000-4000-8000-000000000043","rootFolder":{"name":"Familiefoto\u0027s","path":"OneDrive / Familiefoto\u0027s"},"progress":{"status":"running","pagesProcessed":2,"processedItems":42,"reviewBlocked":true}}',
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SetupShell state={indexing} step="indexing" />
      </QueryClientProvider>,
    );
    await expect.element(page.getByText("42 items verwerkt · 2 pagina's opgeslagen")).toBeVisible();

    document.body.innerHTML = "";

    const photo = parse(
      vPhoto,
      JSON.parse(
        '{"libraryId":"00000000-0000-4000-8000-000000000043","eventId":"event-a","photoId":"photo-a","fileName":"familie.jpg","description":"Zondagmiddag","location":null,"orientation":6,"cTag":"ctag-a","eTag":"etag-a","projectionRevision":1}',
      ),
    );

    render(
      <ReviewShell photo={photo} preview={new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])])} />,
    );
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Zondagmiddag");
    await expect.element(page.getByRole("img", { name: "Zondagmiddag" })).toBeVisible();
  });

  it("shows the Microsoft account before the one-time claim", async () => {
    const claim = parse(
      vCuratorClaimRequired,
      JSON.parse(
        '{"_tag":"CuratorClaimRequired","account":{"provider":"microsoft","name":"Ada Curator","email":"ada@example.test"}}',
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SetupShell state={claim} step="claim" />
      </QueryClientProvider>,
    );

    await expect.element(page.getByText("Ada Curator")).toBeVisible();
    await expect.element(page.getByText("ada@example.test")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Ja, claim met dit account" }))
      .toBeVisible();
  });

  it("explains an owner mismatch without granting setup access", async () => {
    const mismatch = parse(
      vSignInRequired,
      JSON.parse('{"_tag":"SignInRequired","reason":"ownerMismatch"}'),
    );

    render(<SignInShell state={mismatch} />);

    await expect.element(page.getByText(/niet het Microsoft-account/u)).toBeVisible();
  });
});
