export function StatusChip({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="mt-8 inline-flex min-h-11 items-center border border-[#d8d0c1] bg-[#f4f0e7] px-4 text-sm font-semibold text-[#665d4d]">
      {children}
    </p>
  );
}
