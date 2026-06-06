/**
 * Mock data shared by every UI prototype under `/prototypes/*`.
 *
 * These prototypes are throwaway design explorations: no OneDrive, no Gemini,
 * no oRPC. They exist only to compare layout/UX directions for the photo-review
 * loop, built strictly from Kumo components.
 *
 * Domain mirrors the real v1 (location-centric) design: a Gebeurtenis (event =
 * OneDrive folder) has one confirmed location and a set of photos; each photo
 * needs a description and, optionally, a rotation fix. "Werk te doen" = a photo
 * missing its description, or an event missing its location.
 */

export type Orientation = "landscape" | "portrait";

export interface Photo {
  id: string;
  /** picsum seed → stable placeholder image */
  seed: string;
  orientation: Orientation;
  /** AI-suggested caption (Gemini stand-in) */
  aiDescription: string;
  /** Dad-approved caption; null = still to do */
  description: string | null;
  /** AI flagged this scan as rotated */
  needsRotation: boolean;
  /** rotation already corrected this session */
  rotationFixed: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ThrowbackEvent {
  id: string;
  name: string;
  /** human label for the period the folder covers */
  period: string;
  /** AI-derived place name (from folder name / vision) */
  aiPlace: string;
  /** confirmed location label; null = not yet confirmed */
  location: string | null;
  /** map point for the event (AI-derived or dad-placed) */
  coords: LatLng;
  photos: Photo[];
}

function photo(
  id: string,
  seed: string,
  orientation: Orientation,
  aiDescription: string,
  opts: { description?: string | null; needsRotation?: boolean } = {},
): Photo {
  return {
    id,
    seed,
    orientation,
    aiDescription,
    description: opts.description ?? null,
    needsRotation: opts.needsRotation ?? false,
    rotationFixed: false,
  };
}

const EVENTS: readonly ThrowbackEvent[] = [
  {
    id: "frankrijk-1998",
    name: "Zomervakantie Frankrijk",
    period: "Zomer 1998",
    aiPlace: "Camping Les Pins, Ardèche, Frankrijk",
    location: null,
    coords: { lat: 44.4023, lng: 4.4259 },
    photos: [
      photo("fr-1", "throwback-fr-1", "landscape", "Vader en kinderen bij de tent op de camping, vroege ochtend.", {
        description: "Aankomst op de camping in de Ardèche.",
      }),
      photo("fr-2", "throwback-fr-2", "portrait", "Jongen met zwemband bij de rivier de Ardèche.", {
        needsRotation: true,
      }),
      photo("fr-3", "throwback-fr-3", "landscape", "Picknicktafel met stokbrood, kaas en een fles wijn.", {}),
      photo("fr-4", "throwback-fr-4", "landscape", "Uitzicht over de bergen vanaf een wandelpad.", {}),
      photo("fr-5", "throwback-fr-5", "portrait", "Moeder leunend tegen de auto bij een tankstation.", {
        needsRotation: true,
      }),
      photo("fr-6", "throwback-fr-6", "landscape", "Kinderen spelen kaart aan de campingtafel 's avonds.", {}),
    ],
  },
  {
    id: "kerst-oma",
    name: "Kerst bij oma",
    period: "December 1995",
    aiPlace: "Huize Bergweg, Apeldoorn",
    location: "Apeldoorn, Nederland",
    coords: { lat: 52.2112, lng: 5.9699 },
    photos: [
      photo("ke-1", "throwback-ke-1", "landscape", "Familie rond de eettafel met kerstdiner.", {
        description: "Het hele gezin aan het kerstdiner bij oma.",
      }),
      photo("ke-2", "throwback-ke-2", "portrait", "Oma pakt een cadeau uit bij de kerstboom.", {
        description: "Oma maakt haar cadeau open.",
      }),
      photo("ke-3", "throwback-ke-3", "landscape", "Kinderen bij de versierde kerstboom.", {}),
      photo("ke-4", "throwback-ke-4", "portrait", "Opa in zijn stoel met een glas advocaat.", {
        needsRotation: true,
      }),
    ],
  },
  {
    id: "verjaardag-jan",
    name: "Verjaardag Jan",
    period: "Maart 1992",
    aiPlace: "Onbekend",
    location: null,
    coords: { lat: 52.1326, lng: 5.2913 },
    photos: [
      photo("vj-1", "throwback-vj-1", "landscape", "Jongen blaast kaarsjes uit op een verjaardagstaart.", {}),
      photo("vj-2", "throwback-vj-2", "landscape", "Kinderen aan tafel met slingers en feesthoedjes.", {}),
      photo("vj-3", "throwback-vj-3", "portrait", "Jarige met een ingepakt cadeau in de handen.", {}),
      photo("vj-4", "throwback-vj-4", "landscape", "Groepsfoto van de kinderen op de bank.", {}),
      photo("vj-5", "throwback-vj-5", "portrait", "Detail van de taart met vlaggetjes.", { needsRotation: true }),
    ],
  },
  {
    id: "schoolreisje",
    name: "Schoolreisje Efteling",
    period: "Mei 1990",
    aiPlace: "De Efteling, Kaatsheuvel",
    location: "Kaatsheuvel, Nederland",
    coords: { lat: 51.6499, lng: 5.0493 },
    photos: [
      photo("sr-1", "throwback-sr-1", "landscape", "Klas poseert voor de ingang van het pretpark.", {
        description: "De hele klas bij de ingang van de Efteling.",
      }),
      photo("sr-2", "throwback-sr-2", "landscape", "Kinderen in een attractie met opgeheven armen.", {
        description: "In de achtbaan.",
      }),
      photo("sr-3", "throwback-sr-3", "portrait", "Twee vriendinnen met suikerspin.", {
        description: "Suikerspin gehaald bij de kraam.",
      }),
    ],
  },
];

/** Deep copy so every prototype mutates its own independent state. */
export function loadEvents(): ThrowbackEvent[] {
  return EVENTS.map((e) => ({
    ...e,
    photos: e.photos.map((p) => ({ ...p })),
  }));
}

/** A photo is "done" when it has an approved description. */
export function photoDone(p: Photo): boolean {
  return p.description !== null;
}

export function eventProgress(e: ThrowbackEvent): { done: number; total: number } {
  return {
    done: e.photos.filter(photoDone).length,
    total: e.photos.length,
  };
}

/** Stable placeholder image URL for a photo. */
export function photoSrc(p: Photo, longEdge = 1200): string {
  const [w, h] = p.orientation === "landscape" ? [longEdge, Math.round(longEdge * 0.7)] : [Math.round(longEdge * 0.7), longEdge];
  return `https://picsum.photos/seed/${p.seed}/${w}/${h}`;
}
