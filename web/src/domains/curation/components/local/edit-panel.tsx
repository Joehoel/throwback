import { Button, InputArea, Text } from "@cloudflare/kumo";
import { MapPinIcon } from "@phosphor-icons/react";
import type { Photo } from "#/domains/shared/photo.ts";

/**
 * Edit panel for the local curation harness (phase 2): edit the Beschrijving and
 * approve/skip a photo. Controlled + stateless — the form value and busy flag live
 * in `FolderBrowser`, so there's no state-derived-from-props. Approve writes the
 * description into the file (XMP + Windows XP tags) and preserves the EXIF location;
 * a future iteration adds location editing (the prototype's map picker).
 */
export function EditPanel({
  photo,
  description,
  busy,
  onDescription,
  onApprove,
  onSkip,
  onClose,
}: {
  photo: Photo;
  description: string;
  busy: boolean;
  onDescription: (value: string) => void;
  onApprove: () => void;
  onSkip: () => void;
  onClose: () => void;
}): React.ReactNode {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 rounded-lg bg-kumo-recessed p-4 ring-1 ring-kumo-hairline lg:w-96">
      <div className="flex items-center justify-between">
        <Text as="h2" bold>
          Bewerken
        </Text>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Sluiten
        </Button>
      </div>

      <Text variant="secondary" size="sm">
        {photo.name}
      </Text>

      <div className="flex flex-col gap-1.5">
        <Text as="h3" bold size="sm">
          Beschrijving
        </Text>
        <InputArea
          value={description}
          onChange={(event) => {
            onDescription(event.target.value);
          }}
          placeholder="Beschrijf wat je ziet…"
          className="min-h-24"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <MapPinIcon size={14} className="shrink-0 text-kumo-subtle" aria-hidden />
        <Text variant="secondary" size="sm">
          {photo.location === null
            ? "Geen locatie in EXIF"
            : `${photo.location.latitude.toFixed(4)}, ${photo.location.longitude.toFixed(4)}`}
        </Text>
      </div>

      <div className="mt-1 flex gap-2">
        <Button onClick={onApprove} disabled={busy}>
          Goedkeuren
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          Overslaan
        </Button>
      </div>
    </aside>
  );
}
