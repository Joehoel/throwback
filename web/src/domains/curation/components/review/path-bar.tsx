import { Button, DropdownMenu } from "@cloudflare/kumo";
import { CaretDownIcon, CaretRightIcon, FolderIcon } from "@phosphor-icons/react";
import { buildCrumbs } from "#/domains/curation/breadcrumbs.ts";
import { useReview } from "#/domains/curation/components/review/review-provider.tsx";

/** OneDrive folder path as breadcrumbs, each segment a sibling-folder dropdown. */
export function PathBar(): React.ReactNode {
  const { events, event, selectEvent } = useReview();
  return (
    <nav aria-label="Mappad" className="flex min-w-0 items-center gap-1.5 text-sm">
      <FolderIcon size={16} aria-hidden className="shrink-0 text-kumo-subtle" />
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
        {buildCrumbs(events, event).map((crumb, i) => (
          <li key={crumb.label} className="flex shrink-0 items-center gap-1">
            {i > 0 ? <CaretRightIcon size={12} aria-hidden className="text-kumo-subtle" /> : null}
            <DropdownMenu>
              <DropdownMenu.Trigger>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-current={crumb.isCurrent ? "page" : undefined}
                  className={crumb.isCurrent ? "text-kumo-default" : "text-kumo-subtle"}
                >
                  {crumb.label}
                  <CaretDownIcon className="opacity-60" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="min-w-52">
                {crumb.siblings.map((sibling) => (
                  <DropdownMenu.Item
                    key={sibling.label}
                    icon={FolderIcon}
                    selected={sibling.label === crumb.label}
                    onClick={() => {
                      selectEvent(sibling.targetEventId);
                    }}
                  >
                    {sibling.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu>
          </li>
        ))}
      </ol>
    </nav>
  );
}
