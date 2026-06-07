/** Keyboard-cap badge. Platform-neutral labels (no SSR/hydration drift). */
export function Kbd({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-kumo-line bg-kumo-recessed px-1.5 font-sans text-[11px] font-medium leading-none text-kumo-subtle">
      {children}
    </kbd>
  );
}
