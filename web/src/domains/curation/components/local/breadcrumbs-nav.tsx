import { CaretRightIcon, FolderIcon } from "@phosphor-icons/react";
import { DriveItemId } from "#/domains/shared/ids.ts";
import type { FolderNode } from "#/domains/local/folder-tree.ts";
import { cn } from "#/lib/cn.ts";

/** The current folder's path as clickable breadcrumbs. */
export function BreadcrumbsNav({
  folder,
  onNavigate,
}: {
  folder: FolderNode;
  onNavigate: (id: DriveItemId) => void;
}): React.ReactNode {
  return (
    <nav aria-label="Mappad" className="flex min-w-0 items-center gap-1.5 text-sm">
      <FolderIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
        {folder.path.map((segment, depth) => {
          const id = DriveItemId.make(folder.path.slice(0, depth + 1).join("/"));
          const isCurrent = depth === folder.path.length - 1;
          return (
            <li key={id} className="flex shrink-0 items-center gap-1">
              {depth > 0 ? (
                <CaretRightIcon size={12} className="text-kumo-subtle" aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onNavigate(id);
                }}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "rounded px-1.5 py-0.5 hover:bg-kumo-hover",
                  isCurrent ? "font-medium text-kumo-default" : "text-kumo-subtle",
                )}
              >
                {segment}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
