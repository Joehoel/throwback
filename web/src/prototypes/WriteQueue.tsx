import { createActorContext } from "@xstate/react";
import { writeQueueMachine } from "./machine/writeQueueMachine";

/** Long-lived write queue, mounted at the layout so it survives photo navigation. */
export const WriteQueue = createActorContext(writeQueueMachine);
