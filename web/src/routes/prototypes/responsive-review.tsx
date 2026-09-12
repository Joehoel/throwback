import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Badge, Button, Input, InputArea, Text } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  MapPinIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

type ReviewStatus =
  | "clean"
  | "concept-saving"
  | "concept-saved"
  | "accepting"
  | "pending"
  | "handled"
  | "skipped"
  | "conflicted";

interface ReviewPhoto {
  readonly id: string;
  readonly src: string;
  readonly filename: string;
  readonly suggestion: string;
  readonly savedDescription: string;
  readonly savedPlace: string;
  readonly draftDescription: string;
  readonly draftPlace: string;
  readonly rotation: number;
  readonly status: ReviewStatus;
  readonly conflictsOnce: boolean;
  readonly conflictResolved: boolean;
}

const INITIAL_PHOTOS: readonly ReviewPhoto[] = [
  {
    id: "photo-1",
    src: "/prototypes/responsive-review/photo-1.jpg",
    filename: "IMG_1842.jpg",
    suggestion: "Kleurrijke ballonnen hangen klaar voor Loïs’ verjaardag.",
    savedDescription: "",
    savedPlace: "",
    draftDescription: "",
    draftPlace: "",
    rotation: 0,
    status: "clean",
    conflictsOnce: false,
    conflictResolved: false,
  },
  {
    id: "photo-2",
    src: "/prototypes/responsive-review/photo-2.jpg",
    filename: "IMG_1843.jpg",
    suggestion: "Confetti dwarrelt boven de feestvierders.",
    savedDescription: "",
    savedPlace: "Utrecht",
    draftDescription: "",
    draftPlace: "Utrecht",
    rotation: 0,
    status: "clean",
    conflictsOnce: true,
    conflictResolved: false,
  },
  {
    id: "photo-3",
    src: "/prototypes/responsive-review/photo-3.jpg",
    filename: "IMG_1844.jpg",
    suggestion: "De jarige houdt een ingepakt cadeau omhoog.",
    savedDescription: "Cadeautje van oma uitpakken.",
    savedPlace: "Utrecht",
    draftDescription: "Cadeautje van oma uitpakken.",
    draftPlace: "Utrecht",
    rotation: 90,
    status: "handled",
    conflictsOnce: false,
    conflictResolved: false,
  },
  {
    id: "photo-4",
    src: "/prototypes/responsive-review/photo-4.jpg",
    filename: "IMG_1845.jpg",
    suggestion: "De hele familie staat bij zonsondergang aan zee.",
    savedDescription: "",
    savedPlace: "",
    draftDescription: "",
    draftPlace: "",
    rotation: 0,
    status: "clean",
    conflictsOnce: false,
    conflictResolved: false,
  },
];

const PLACES = ["Utrecht", "De Meern", "Nieuwegein"] as const;

const PICKER_CSS = `
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}
.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}
.proto-picker-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}
.proto-picker-item:hover { color: rgba(255, 255, 255, 0.85); }
.proto-picker-item:active { transform: scale(0.97); }
.proto-picker-item:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }
`;

function clonePhotos(): ReviewPhoto[] {
  return INITIAL_PHOTOS.map((photo) => ({ ...photo }));
}

function nextOpenIndex(photos: readonly ReviewPhoto[], current: number): number {
  for (let offset = 1; offset <= photos.length; offset += 1) {
    const index = (current + offset) % photos.length;
    if (photos[index].status !== "handled" && photos[index].status !== "skipped") return index;
  }
  return current;
}

interface ReviewModel {
  readonly photos: readonly ReviewPhoto[];
  readonly activeIndex: number;
  readonly active: ReviewPhoto;
  readonly conflict: ReviewPhoto | undefined;
  readonly handled: number;
  readonly pending: number;
  readonly setDescription: (value: string) => void;
  readonly setPlace: (value: string) => void;
  readonly rotate: (delta: number) => void;
  readonly applySuggestion: () => void;
  readonly select: (index: number) => void;
  readonly approve: () => void;
  readonly skip: () => void;
  readonly reviewConflict: () => void;
}

function useReviewModel(): ReviewModel {
  const [photos, setPhotos] = useState(clonePhotos);
  const [activeIndex, setActiveIndex] = useState(0);
  const timers = useRef(new Set<number>());
  const active = photos[activeIndex];

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  const schedule = (callback: () => void, delay: number): void => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
  };

  const update = (id: string, change: (photo: ReviewPhoto) => ReviewPhoto): void => {
    setPhotos((current) => current.map((photo) => (photo.id === id ? change(photo) : photo)));
  };

  const saveConcept = (id: string): void => {
    update(id, (photo) => ({ ...photo, status: "concept-saving" }));
    schedule(() => {
      update(id, (photo) =>
        photo.status === "concept-saving" ? { ...photo, status: "concept-saved" } : photo,
      );
    }, 550);
  };

  const edit = (
    change: Partial<Pick<ReviewPhoto, "draftDescription" | "draftPlace" | "rotation">>,
  ): void => {
    update(active.id, (photo) => ({ ...photo, ...change }));
    saveConcept(active.id);
  };

  const approve = (): void => {
    const id = active.id;
    const sourceIndex = activeIndex;
    update(id, (photo) => ({ ...photo, status: "accepting" }));
    schedule(() => {
      update(id, (photo) => ({ ...photo, status: "pending" }));
      setActiveIndex(nextOpenIndex(photos, sourceIndex));
      schedule(() => {
        update(id, (photo) =>
          photo.conflictsOnce && !photo.conflictResolved
            ? { ...photo, status: "conflicted" }
            : {
                ...photo,
                status: "handled",
                savedDescription: photo.draftDescription,
                savedPlace: photo.draftPlace,
              },
        );
      }, 1200);
    }, 400);
  };

  const skip = (): void => {
    const sourceIndex = activeIndex;
    update(active.id, (photo) => ({ ...photo, status: "skipped" }));
    setPhotos((current) => {
      setActiveIndex(nextOpenIndex(current, sourceIndex));
      return current;
    });
  };

  const conflict = photos.find((photo) => photo.status === "conflicted");

  return {
    photos,
    activeIndex,
    active,
    conflict,
    handled: photos.filter((photo) => photo.status === "handled").length,
    pending: photos.filter((photo) => photo.status === "pending" || photo.status === "accepting")
      .length,
    setDescription: (value) => edit({ draftDescription: value }),
    setPlace: (value) => edit({ draftPlace: value }),
    rotate: (delta) => edit({ rotation: (active.rotation + delta + 360) % 360 }),
    applySuggestion: () => edit({ draftDescription: active.suggestion }),
    select: setActiveIndex,
    approve,
    skip,
    reviewConflict: () => {
      if (!conflict) return;
      update(conflict.id, (photo) => ({
        ...photo,
        status: "concept-saved",
        conflictResolved: true,
      }));
      setActiveIndex(photos.findIndex((photo) => photo.id === conflict.id));
    },
  };
}

function StatusText({ photo }: { photo: ReviewPhoto }): React.ReactNode {
  const labels: Record<ReviewStatus, string> = {
    clean: "Nog niet gewijzigd",
    "concept-saving": "Concept bewaren…",
    "concept-saved": "Concept bewaard",
    accepting: "Opdracht versturen…",
    pending: "Wordt verwerkt",
    handled: "Afgehandeld",
    skipped: "Overgeslagen",
    conflicted: "Opnieuw bekijken",
  };
  return (
    <span className="text-xs text-kumo-subtle" aria-live="polite">
      {labels[photo.status]}
    </span>
  );
}

function Header({ model }: { model: ReviewModel }): React.ReactNode {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-kumo-hairline bg-kumo-base px-4 lg:px-6">
      <div className="min-w-0">
        <p className="truncate text-xs text-kumo-subtle">Camera-album / 2022 / Augustus</p>
        <h1 className="truncate font-display text-lg font-semibold">Verjaardag Loïs</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {model.pending > 0 ? (
          <Badge variant="info" appearance="dot">
            {model.pending} bezig
          </Badge>
        ) : null}
        <span className="text-sm text-kumo-subtle">
          {model.handled}/{model.photos.length} klaar
        </span>
      </div>
    </header>
  );
}

function ConflictBanner({ model }: { model: ReviewModel }): React.ReactNode {
  if (!model.conflict) return null;
  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-kumo-warning bg-kumo-warning/10 px-4 py-2"
      role="alert"
    >
      <div className="flex min-w-0 items-center gap-2">
        <WarningCircleIcon className="shrink-0 text-kumo-warning" weight="fill" />
        <p className="truncate text-sm">
          <strong>{model.conflict.filename}</strong> is intussen gewijzigd. Je Concept is bewaard.
        </p>
      </div>
      <Button size="xs" variant="secondary" onClick={model.reviewConflict}>
        Bekijk opnieuw
      </Button>
    </div>
  );
}

function PhotoCanvas({
  model,
  compact = false,
  controlsSide = "right",
}: {
  model: ReviewModel;
  compact?: boolean;
  controlsSide?: "left" | "right";
}): React.ReactNode {
  return (
    <section
      className={`relative flex min-h-0 items-center justify-center overflow-hidden bg-kumo-recessed ${compact ? "h-[38svh] lg:h-full" : "h-full"}`}
      aria-label={`Foto ${model.activeIndex + 1}: ${model.active.filename}`}
    >
      <img
        src={model.active.src}
        alt={model.active.suggestion}
        className="max-h-full max-w-full object-contain transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${model.active.rotation}deg)` }}
      />
      <div className="absolute left-3 top-3 rounded-full bg-kumo-base/90 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur">
        {model.active.filename}
      </div>
      <div
        className={`absolute bottom-3 flex gap-1 rounded-full bg-kumo-base/90 p-1 shadow-sm backdrop-blur ${controlsSide === "left" ? "left-3" : "right-3"}`}
      >
        <button
          type="button"
          aria-label="Draai linksom"
          className="min-h-11 min-w-11 rounded-full p-2 text-kumo-default hover:bg-kumo-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-brand"
          onClick={() => model.rotate(-90)}
        >
          <ArrowCounterClockwiseIcon />
        </button>
        <button
          type="button"
          aria-label="Draai rechtsom"
          className="min-h-11 min-w-11 rounded-full p-2 text-kumo-default hover:bg-kumo-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-brand"
          onClick={() => model.rotate(90)}
        >
          <ArrowCounterClockwiseIcon className="-scale-x-100" />
        </button>
      </div>
    </section>
  );
}

function Suggestion({ model }: { model: ReviewModel }): React.ReactNode {
  const applied = model.active.draftDescription === model.active.suggestion;
  return (
    <button
      type="button"
      className="w-full rounded-xl border border-kumo-line bg-kumo-recessed p-3 text-left transition-colors hover:bg-kumo-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-brand"
      onClick={model.applySuggestion}
    >
      <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-kumo-link">
        <SparkleIcon weight="fill" /> Gemini-suggestie{" "}
        {applied ? "· overgenomen" : "· tik om over te nemen"}
      </span>
      <span className="text-sm text-kumo-default">{model.active.suggestion}</span>
    </button>
  );
}

function LocationEditor({ model }: { model: ReviewModel }): React.ReactNode {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Text as="h3" size="sm" bold>
          Locatie
        </Text>
        <span className="flex items-center gap-1 text-xs text-kumo-subtle">
          <MapPinIcon /> per Foto
        </span>
      </div>
      <Input
        aria-label="Locatie"
        placeholder="Plaats of adres"
        value={model.active.draftPlace}
        onChange={(event) => model.setPlace(event.target.value)}
      />
      <div className="relative h-28 overflow-hidden rounded-xl border border-kumo-line bg-kumo-recessed">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <MapPinIcon
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-kumo-brand"
          size={28}
          weight="fill"
        />
        <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto">
          {PLACES.map((place) => (
            <button
              key={place}
              type="button"
              onClick={() => model.setPlace(place)}
              className="min-h-11 shrink-0 rounded-full border border-kumo-line bg-kumo-base px-3 py-1 text-xs hover:bg-kumo-fill lg:min-h-8"
            >
              {place}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Editor({
  model,
  condensed = false,
}: {
  model: ReviewModel;
  condensed?: boolean;
}): React.ReactNode {
  return (
    <div className={`space-y-4 ${condensed ? "p-3" : "p-4 lg:p-5"}`}>
      <div className="flex items-center justify-between">
        <Text as="h2" bold>
          Bewerken
        </Text>
        <StatusText photo={model.active} />
      </div>
      <Suggestion model={model} />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Text as="h3" size="sm" bold>
            Beschrijving
          </Text>
          <span className="text-xs text-kumo-subtle">
            {model.active.draftDescription.length}/160
          </span>
        </div>
        <InputArea
          aria-label="Beschrijving"
          maxLength={160}
          className="min-h-24"
          placeholder="Wat wil je later bij deze foto teruglezen?"
          value={model.active.draftDescription}
          onChange={(event) => model.setDescription(event.target.value)}
        />
      </div>
      <LocationEditor model={model} />
    </div>
  );
}

function Actions({
  model,
  attached = false,
}: {
  model: ReviewModel;
  attached?: boolean;
}): React.ReactNode {
  const busy = model.active.status === "accepting" || model.active.status === "pending";
  return (
    <div
      className={`flex items-center justify-between gap-2 bg-kumo-base p-3 ${attached ? "border-t border-kumo-hairline" : ""}`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11"
          icon={<ArrowLeftIcon />}
          aria-label="Vorige Foto"
          onClick={() => model.select(Math.max(0, model.activeIndex - 1))}
          disabled={model.activeIndex === 0}
        />
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11"
          icon={<ArrowRightIcon />}
          aria-label="Volgende Foto"
          onClick={() => model.select(Math.min(model.photos.length - 1, model.activeIndex + 1))}
          disabled={model.activeIndex === model.photos.length - 1}
        />
      </div>
      <div className="flex gap-2">
        <Button className="min-h-11" size="sm" variant="ghost" onClick={model.skip} disabled={busy}>
          Overslaan
        </Button>
        <Button
          className="min-h-11"
          size="sm"
          variant="primary"
          onClick={model.approve}
          disabled={busy}
        >
          {busy ? "Opdracht versturen…" : "Goedkeuren en verder"}
        </Button>
      </div>
    </div>
  );
}

function Filmstrip({ model }: { model: ReviewModel }): React.ReactNode {
  return (
    <nav
      className="flex shrink-0 gap-2 overflow-x-auto border-t border-kumo-hairline bg-kumo-elevated p-2"
      aria-label="Foto’s in deze Gebeurtenis"
    >
      {model.photos.map((photo, index) => (
        <button
          key={photo.id}
          type="button"
          aria-current={index === model.activeIndex ? "true" : undefined}
          aria-label={`Foto ${index + 1}: ${photo.filename}`}
          onClick={() => model.select(index)}
          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-brand ${index === model.activeIndex ? "ring-kumo-brand" : "ring-transparent"}`}
        >
          <img src={photo.src} alt="" className="h-full w-full object-cover" />
          {photo.status === "handled" ? (
            <CheckCircleIcon
              className="absolute right-0.5 top-0.5 rounded-full bg-kumo-base text-kumo-success"
              weight="fill"
            />
          ) : null}
          {photo.status === "pending" || photo.status === "accepting" ? (
            <span className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-kumo-base/70">
              <span className="block h-full w-2/3 animate-pulse rounded-full bg-kumo-brand motion-reduce:animate-none" />
            </span>
          ) : null}
          {photo.status === "conflicted" ? (
            <WarningCircleIcon
              className="absolute right-0.5 top-0.5 rounded-full bg-kumo-base text-kumo-warning"
              weight="fill"
            />
          ) : null}
        </button>
      ))}
    </nav>
  );
}

function ScrollVariant(): React.ReactNode {
  const model = useReviewModel();
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-kumo-base pt-14">
      <Header model={model} />
      <ConflictBanner model={model} />
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
        <PhotoCanvas model={model} compact />
        <aside className="border-kumo-hairline lg:overflow-y-auto lg:border-l">
          <Editor model={model} />
        </aside>
      </div>
      <Filmstrip model={model} />
      <div className="sticky bottom-0 z-10 lg:static">
        <Actions model={model} attached />
      </div>
    </main>
  );
}

function TabsVariant(): React.ReactNode {
  const model = useReviewModel();
  const [tab, setTab] = useState<"photo" | "details">("photo");
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-kumo-base pt-14">
      <Header model={model} />
      <ConflictBanner model={model} />
      <div className="grid grid-cols-2 gap-1 border-b border-kumo-hairline bg-kumo-elevated p-1">
        <button
          type="button"
          className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "photo" ? "bg-kumo-base shadow-sm" : "text-kumo-subtle"}`}
          aria-pressed={tab === "photo"}
          onClick={() => setTab("photo")}
        >
          Foto
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "details" ? "bg-kumo-base shadow-sm" : "text-kumo-subtle"}`}
          aria-pressed={tab === "details"}
          onClick={() => setTab("details")}
        >
          Beschrijving & locatie
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <section className={`${tab === "photo" ? "flex" : "hidden"} h-full min-h-0 flex-col`}>
          <div className="min-h-0 flex-1">
            <PhotoCanvas model={model} />
          </div>
          <Filmstrip model={model} />
          <button
            type="button"
            className="m-3 min-h-11 rounded-xl border border-kumo-line bg-kumo-elevated px-4 py-3 text-sm font-semibold"
            onClick={() => setTab("details")}
          >
            Beschrijving en locatie bewerken
          </button>
        </section>
        <aside className={`${tab === "details" ? "block" : "hidden"} h-full overflow-y-auto`}>
          <div className="mx-auto w-full max-w-2xl">
            <Editor model={model} />
          </div>
        </aside>
      </div>
      <Actions model={model} attached />
    </main>
  );
}

function DrawerVariant(): React.ReactNode {
  const model = useReviewModel();
  const [expanded, setExpanded] = useState(false);
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-kumo-base pt-14">
      <Header model={model} />
      <ConflictBanner model={model} />
      <div className="relative min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col pb-44 lg:pb-0">
          <div className="min-h-0 flex-1">
            <PhotoCanvas model={model} controlsSide="left" />
          </div>
          <Filmstrip model={model} />
        </div>
        <section
          className="absolute inset-x-2 bottom-2 z-10 flex max-h-[78%] flex-col overflow-hidden rounded-2xl border border-kumo-line bg-kumo-base shadow-xl lg:bottom-20 lg:left-auto lg:right-4 lg:w-96 lg:max-h-[calc(100%-6rem)]"
          aria-label="Bewerkpaneel"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <span>
              <span className="block text-sm font-semibold">Beschrijving & locatie</span>
              <StatusText photo={model.active} />
            </span>
            {expanded ? <CaretDownIcon /> : <CaretUpIcon />}
          </button>
          {expanded ? (
            <div className="min-h-0 overflow-y-auto border-t border-kumo-hairline">
              <Editor model={model} condensed />
            </div>
          ) : (
            <button
              type="button"
              className="mx-3 mb-2 truncate rounded-lg bg-kumo-recessed px-3 py-2 text-left text-sm text-kumo-subtle"
              onClick={() => setExpanded(true)}
            >
              {model.active.draftDescription ||
                "Nog geen Beschrijving in het Concept — open om te bewerken"}
            </button>
          )}
          <Actions model={model} attached />
        </section>
      </div>
    </main>
  );
}

const VARIANTS = [
  { name: "Splitscreen", render: ScrollVariant },
  { name: "Focus", render: TabsVariant },
  { name: "Inspecteur", render: DrawerVariant },
] as const;

function Picker({
  active,
  onSelect,
  onReplay,
}: {
  active: number;
  onSelect: (index: number) => void;
  onReplay: () => void;
}): React.ReactNode {
  const pickerRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveHighlight = (): void => {
    const item = itemRefs.current[active];
    const highlight = highlightRef.current;
    if (!item || !highlight) return;
    highlight.style.width = `${item.offsetWidth}px`;
    highlight.style.transform = `translateX(${item.offsetLeft}px)`;
  };

  useLayoutEffect(() => {
    moveHighlight();
  }, [active]);

  useEffect(() => {
    const picker = pickerRef.current;
    const first = window.requestAnimationFrame(() => {
      const second = window.requestAnimationFrame(() => picker?.setAttribute("data-ready", ""));
      return () => window.cancelAnimationFrame(second);
    });
    window.addEventListener("resize", moveHighlight);
    return () => {
      window.cancelAnimationFrame(first);
      window.removeEventListener("resize", moveHighlight);
    };
  }, []);

  return (
    <nav
      ref={pickerRef}
      className="proto-picker"
      aria-label="Prototype variants"
      data-position="top"
    >
      <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
      {VARIANTS.map((variant, index) => (
        <button
          key={variant.name}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          className="proto-picker-item"
          data-active={index === active ? "" : undefined}
          aria-current={index === active ? "true" : undefined}
          onClick={() => onSelect(index)}
        >
          {variant.name}
        </button>
      ))}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button
        className="proto-picker-item proto-picker-replay"
        aria-label="Replay animation (R)"
        onClick={onReplay}
      >
        ↻
      </button>
    </nav>
  );
}

export function PrototypeHarness(): React.ReactNode {
  const initial =
    Number.parseInt(new URLSearchParams(window.location.search).get("v") ?? "1", 10) - 1;
  const [active, setActive] = useState(initial >= 0 && initial < VARIANTS.length ? initial : 0);
  const [replay, setReplay] = useState(0);
  const Variant = VARIANTS[active].render;

  const select = (index: number): void => {
    if (index < 0 || index >= VARIANTS.length) return;
    setActive(index);
    setReplay(0);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(index + 1));
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName) || target.isContentEditable)
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= VARIANTS.length) select(number - 1);
      else if (event.key === "ArrowRight") select((active + 1) % VARIANTS.length);
      else if (event.key === "ArrowLeft") select((active - 1 + VARIANTS.length) % VARIANTS.length);
      else if (event.key === "r" || event.key === "R") setReplay((current) => current + 1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  return (
    <>
      <style>{PICKER_CSS}</style>
      <div key={`${active}:${replay}`}>
        <Variant />
      </div>
      <Picker
        active={active}
        onSelect={select}
        onReplay={() => setReplay((current) => current + 1)}
      />
    </>
  );
}

function ResponsiveReviewPrototype(): React.ReactNode {
  return (
    <ClientOnly fallback={<div className="h-svh bg-kumo-base" />}>
      <PrototypeHarness />
    </ClientOnly>
  );
}

export const Route = createFileRoute("/prototypes/responsive-review")({
  component: ResponsiveReviewPrototype,
});
