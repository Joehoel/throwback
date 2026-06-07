import { cva } from "class-variance-authority";
import { cn } from "#/lib/cn.ts";
import { photoSrc } from "#/domains/curation/data.ts";
import type { Photo } from "#/domains/curation/data.ts";

const frame = cva(
  "flex items-center justify-center overflow-hidden rounded-xl bg-kumo-recessed ring-1 ring-kumo-hairline",
);

// Mock: an uncorrected scan that "needs rotation" shows slightly tilted;
// applying the fix removes the tilt. Purely to make the control feel real.
const image = cva("max-h-full max-w-full object-contain transition-transform duration-300", {
  variants: { tilted: { true: "rotate-3", false: "rotate-0" } },
  defaultVariants: { tilted: false },
});

interface PhotoViewProps {
  photo: Photo;
  /** when true, show the "corrected" orientation (visual tilt undone) */
  rotated?: boolean;
  className?: string;
  longEdge?: number;
}

/** Photo with rounded frame; honours a (mock) rotation correction. */
export function PhotoView({
  photo,
  rotated = false,
  className,
  longEdge = 1200,
}: PhotoViewProps): React.ReactNode {
  const tilted = photo.needsRotation && !rotated;
  // Never ship an alt-less image (WCAG 1.1.1); fall back when the AI caption is blank.
  const alt = photo.aiDescription.trim().length > 0 ? photo.aiDescription : "Foto";
  return (
    <div className={cn(frame(), className)}>
      <img src={photoSrc(photo, longEdge)} alt={alt} className={image({ tilted })} />
    </div>
  );
}
