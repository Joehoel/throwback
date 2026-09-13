import { Context, Effect, Layer, Option, Schema, SchemaTransformation } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import type { CuratorIdentity } from "../curator/model.ts";
import { CuratorIdentity as CuratorIdentitySchema } from "../curator/model.ts";
import { LibraryStoreUnavailable } from "./errors.ts";
import type { LibraryBoundary, LibrarySelection } from "./model.ts";
import { LibraryBoundary as LibraryBoundarySchema, LibraryRootDisplay } from "./model.ts";

/** Persistence authority for the single selected Bibliotheek boundary. */
export interface LibraryStoreService {
  readonly getSelected: (
    curator: CuratorIdentity,
  ) => Effect.Effect<Option.Option<LibraryBoundary>, LibraryStoreUnavailable>;
  readonly select: (
    selection: LibrarySelection,
  ) => Effect.Effect<LibraryBoundary, LibraryStoreUnavailable>;
}

/** Persistence authority for the single selected Bibliotheek boundary. */
export class LibraryStore extends Context.Service<LibraryStore, LibraryStoreService>()(
  "throwback/library/LibraryStore",
) {}

const StoredLibrary = Schema.Struct({
  id: Schema.String,
  curatorProviderAccountId: Schema.String,
  driveId: Schema.String,
  rootDriveItemId: Schema.String,
  rootName: LibraryRootDisplay.fields.name,
  rootPath: LibraryRootDisplay.fields.path,
}).pipe(
  Schema.decodeTo(
    LibraryBoundarySchema,
    SchemaTransformation.transform({
      decode: (row) => ({
        id: row.id,
        curatorProviderAccountId: row.curatorProviderAccountId,
        driveId: row.driveId,
        rootDriveItemId: row.rootDriveItemId,
        root: { name: row.rootName, path: row.rootPath },
      }),
      encode: (library) => ({
        id: library.id,
        curatorProviderAccountId: library.curatorProviderAccountId,
        driveId: library.driveId,
        rootDriveItemId: library.rootDriveItemId,
        rootName: library.root.name,
        rootPath: library.root.path,
      }),
    }),
  ),
);

function unavailable(): LibraryStoreUnavailable {
  return new LibraryStoreUnavailable({
    message: "De Bibliotheek-koppeling is tijdelijk niet beschikbaar.",
  });
}

/** Effect SQL repository for the single selected Bibliotheek boundary. */
export const LibraryStoreLive = Layer.effect(
  LibraryStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const findSelected = SqlSchema.findOneOption({
      Request: CuratorIdentitySchema,
      Result: StoredLibrary,
      execute: (curator) => sql`
        SELECT
          "id",
          "curatorProviderAccountId",
          "driveId",
          "rootDriveItemId",
          "rootName",
          "rootPath"
        FROM "library"
        WHERE "singleton" = 1
          AND "curatorProviderId" = ${curator.providerId}
          AND "curatorProviderAccountId" = ${curator.providerAccountId}
      `,
    });

    const insertSelection = SqlSchema.void({
      Request: LibraryBoundarySchema,
      execute: (selection) => sql`
        INSERT INTO "library" (
          "singleton",
          "id",
          "curatorProviderId",
          "curatorProviderAccountId",
          "driveId",
          "rootDriveItemId",
          "rootName",
          "rootPath"
        ) VALUES (
          1,
          ${selection.id},
          'microsoft',
          ${selection.curatorProviderAccountId},
          ${selection.driveId},
          ${selection.rootDriveItemId},
          ${selection.root.name},
          ${selection.root.path}
        )
        ON CONFLICT("singleton") DO NOTHING
      `,
    });

    const getSelected = Effect.fn("LibraryStore.getSelected")(function* (curator: CuratorIdentity) {
      return yield* findSelected(curator).pipe(Effect.mapError(unavailable));
    });

    const select = Effect.fn("LibraryStore.select")(function* (selection: LibrarySelection) {
      yield* insertSelection(selection).pipe(Effect.mapError(unavailable));

      const selected = yield* getSelected({
        providerId: "microsoft",
        providerAccountId: selection.curatorProviderAccountId,
      });

      if (Option.isNone(selected)) {
        return yield* unavailable();
      }

      return selected.value;
    });

    return LibraryStore.of({ getSelected, select });
  }),
);
