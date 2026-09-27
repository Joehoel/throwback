import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { is } from "valibot";
import { PhotoReviewRoute } from "#/client/components/photo-review-route.tsx";
import { vPhotoNotFoundEncoded } from "#/client/generated/valibot.gen.ts";
import { bootstrapDestination } from "#/client/navigation/bootstrap-destination.ts";
import { assertPhotoBookmark, parsePhotoBookmark } from "#/client/navigation/photo-bookmark.ts";
import { loadBootstrap } from "#/client/routes/load-bootstrap.ts";
import { photoPreviewQueryOptions, photoQueryOptions } from "#/client/api/photo.ts";

function ReviewRoute() {
  const data = useLoaderData({
    from: "/libraries/$libraryId/events/$eventId/photos/$photoId",
  });

  return <PhotoReviewRoute initialPhoto={data.photo} path={data.path} preview={data.preview} />;
}

export const Route = createFileRoute("/libraries/$libraryId/events/$eventId/photos/$photoId")({
  component: ReviewRoute,
  loader: async (context) => {
    const params = assertPhotoBookmark(context.params);

    const state = await loadBootstrap(context);
    const destination = bootstrapDestination(state);

    if (destination.to !== "/libraries/$libraryId/events/$eventId/photos/$photoId") {
      redirect({ ...destination, throw: true });
    }

    try {
      const [photo, preview] = await Promise.all([
        context.context.queryClient.query({
          ...photoQueryOptions(params),
          staleTime: 30_000,
        }),
        context.context.queryClient.query({
          ...photoPreviewQueryOptions(params),
          staleTime: "static",
        }),
      ]);

      return { path: params, photo, preview };
    } catch (error) {
      if (is(vPhotoNotFoundEncoded, error)) {
        notFound({ throw: true });
      }

      throw error;
    }
  },
  params: {
    parse: (params) => parsePhotoBookmark(params) ?? false,
  },
});
