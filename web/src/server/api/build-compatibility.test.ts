import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { BUILD_ID } from "../config/build-id.ts";
import { requireCurrentBuild } from "./build-compatibility.ts";
import { BuildUpgradeRequired } from "./contract.ts";

describe("build compatibility", () => {
  it("short-circuits before a mutation can execute", async () => {
    let mutationExecuted = false;

    const program = requireCurrentBuild("stale-build").pipe(
      Effect.andThen(
        Effect.sync(() => {
          mutationExecuted = true;
        }),
      ),
      Effect.flip,
    );

    const error = await Effect.runPromise(program);

    expect([Schema.is(BuildUpgradeRequired)(error), mutationExecuted]).toStrictEqual([true, false]);
  });

  it("allows the matching SPA build", async () => {
    await expect(Effect.runPromise(requireCurrentBuild(BUILD_ID))).resolves.toBeUndefined();
  });
});
