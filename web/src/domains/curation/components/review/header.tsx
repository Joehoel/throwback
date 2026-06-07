import { Badge, Button, Loader, Text } from "@cloudflare/kumo";
import { KeyboardIcon } from "@phosphor-icons/react";
import { Kbd } from "#/domains/curation/components/kbd.tsx";
import { PathBar } from "#/domains/curation/components/review/path-bar.tsx";
import { useReview } from "#/domains/curation/components/review/review-provider.tsx";

/** Top bar: folder path, progress, save status (announced), and the help toggle. */
export function Header(): React.ReactNode {
  const { event, done, total, runningWrites, savedWrites, toggleHelp } = useReview();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-kumo-hairline px-6 py-2">
      <Text as="h1" className="sr-only">
        Foto&apos;s nakijken — {event.name}
      </Text>
      <PathBar />
      <div className="flex items-center gap-3">
        <Text variant="secondary" size="sm">
          {done} / {total} klaar
        </Text>
        <div aria-live="polite" className="flex items-center gap-3">
          {runningWrites > 0 ? (
            <span className="flex items-center gap-1.5">
              <Loader size="sm" />
              <Text variant="secondary" size="sm">
                {runningWrites} opslaan…
              </Text>
            </span>
          ) : null}
          {runningWrites === 0 && savedWrites > 0 ? (
            <Badge variant="success" appearance="dot">
              {savedWrites} opgeslagen
            </Badge>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" icon={<KeyboardIcon />} onClick={toggleHelp}>
          <Kbd>?</Kbd>
        </Button>
      </div>
    </header>
  );
}
