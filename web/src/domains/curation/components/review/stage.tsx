import { Button } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { PhotoView } from "#/domains/curation/components/photo-view.tsx";
import { Kbd } from "#/domains/curation/components/kbd.tsx";
import { useReview } from "#/domains/curation/components/review/review-provider.tsx";

/** The photo itself, the rotate-fix control, and the skip / approve action bar. */
export function Stage(): React.ReactNode {
  const { photo, orientationFixed, hasNext, toggleRotation, skip, approve } = useReview();
  return (
    <div className="relative flex min-h-0 flex-1 bg-kumo-base p-3">
      <PhotoView photo={photo} rotated={orientationFixed} className="h-full w-full" />
      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3">
        {photo.needsRotation ? (
          <Button
            variant={orientationFixed ? "secondary" : "primary"}
            size="sm"
            icon={<ArrowClockwiseIcon />}
            onClick={() => {
              toggleRotation();
            }}
          >
            {orientationFixed ? "Rechtgezet — ongedaan maken" : "Scheve scan rechtzetten"}
            <Kbd>R</Kbd>
          </Button>
        ) : null}
        <div className="flex items-center gap-2 rounded-full border border-kumo-hairline bg-kumo-base/90 p-1.5 shadow-lg backdrop-blur">
          <Button
            variant="ghost"
            size="base"
            className="rounded-full"
            onClick={() => {
              skip();
            }}
          >
            Overslaan
          </Button>
          <Button
            variant="primary"
            size="base"
            className="rounded-full"
            icon={hasNext ? <ArrowRightIcon /> : <CheckIcon />}
            onClick={() => {
              approve();
            }}
          >
            {hasNext ? "Opslaan en volgende" : "Opslaan"}
            <Kbd>⌘/Ctrl ↵</Kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
