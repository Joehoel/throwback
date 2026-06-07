import { ReviewProvider } from "#/domains/curation/components/review/review-provider.tsx";
import { Header } from "#/domains/curation/components/review/header.tsx";
import { PathBar } from "#/domains/curation/components/review/path-bar.tsx";
import { Stage } from "#/domains/curation/components/review/stage.tsx";
import { EditPanel } from "#/domains/curation/components/review/edit-panel.tsx";
import { Filmstrip } from "#/domains/curation/components/review/filmstrip.tsx";
import { HelpDialog } from "#/domains/curation/components/review/help-dialog.tsx";

/** Compound review screen — compose the parts you need under `Review.Provider`. */
export const Review = {
  Provider: ReviewProvider,
  Header,
  PathBar,
  Stage,
  EditPanel,
  Filmstrip,
  HelpDialog,
};

export type {
  ReviewProviderProps,
  ReviewContextValue,
} from "#/domains/curation/components/review/review-provider.tsx";
