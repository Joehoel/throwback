import { Button, Dialog, Text } from "@cloudflare/kumo";
import { Kbd } from "#/domains/curation/components/kbd.tsx";
import { useReview } from "#/domains/curation/components/review/review-provider.tsx";

const SHORTCUTS: { keys: React.ReactNode; label: string }[] = [
  { keys: <Kbd>←</Kbd>, label: "Vorige foto" },
  { keys: <Kbd>→</Kbd>, label: "Volgende foto" },
  {
    keys: (
      <span className="flex gap-1">
        <Kbd>[</Kbd>
        <Kbd>]</Kbd>
      </span>
    ),
    label: "Vorige / volgende gebeurtenis",
  },
  {
    keys: (
      <span className="flex items-center gap-1">
        <Kbd>⌘/Ctrl</Kbd>
        <Kbd>↵</Kbd>
      </span>
    ),
    label: "Opslaan en volgende",
  },
  { keys: <Kbd>R</Kbd>, label: "Scheve scan rechtzetten" },
  { keys: <Kbd>A</Kbd>, label: "AI-suggestie overnemen" },
  { keys: <Kbd>?</Kbd>, label: "Dit overzicht tonen" },
];

/** Keyboard-shortcut reference (ADR-0014), toggled with `?`. */
export function HelpDialog(): React.ReactNode {
  const { helpOpen, closeHelp } = useReview();
  return (
    <Dialog.Root
      open={helpOpen}
      onOpenChange={(o) => {
        if (!o) {
          closeHelp();
        }
      }}
    >
      <Dialog size="sm" className="p-6">
        <Dialog.Title className="mb-1 text-lg font-semibold">Sneltoetsen</Dialog.Title>
        <Dialog.Description className="mb-4 text-kumo-subtle">
          Loop foto&apos;s na zonder de muis. Event + foto staan in het pad; filter + kaart in de
          URL.
        </Dialog.Description>
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4">
              <Text variant="secondary" size="sm">
                {s.label}
              </Text>
              {s.keys}
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Dialog.Close
            render={(p) => (
              <Button variant="secondary" {...p}>
                Sluiten
              </Button>
            )}
          />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
