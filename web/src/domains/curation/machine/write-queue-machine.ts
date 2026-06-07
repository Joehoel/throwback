/**
 * writeQueueMachine — the optimistic, navigation-surviving write queue.
 *
 * With the cursor in the URL, this is the part that stays an actor: a long-lived
 * queue mounted once (via createActorContext) so it outlives photo navigation —
 * mirroring the durable D1 queue (ADR-0009/0011). `enqueue` spawns one write-job
 * actor per approved write; each reports back `write.settled`.
 */
import { enqueueActions, fromCallback, setup } from "xstate";

export type WriteKind = "description" | "location_orientation";
export type WriteStatus = "running" | "succeeded" | "failed";

export interface WriteJobRec {
  id: string;
  photoId: string;
  kind: WriteKind;
  status: WriteStatus;
}

export type WriteQueueEvent =
  | { type: "enqueue"; jobs: { photoId: string; kind: WriteKind }[] }
  | { type: "write.settled"; id: string; ok: boolean };

const writeJob = fromCallback<WriteQueueEvent, { id: string; kind: WriteKind }>(
  ({ input, sendBack }) => {
    const ms = input.kind === "location_orientation" ? 2400 : 800;
    const handle = setTimeout(() => {
      sendBack({ type: "write.settled", id: input.id, ok: true });
    }, ms);
    return () => {
      clearTimeout(handle);
    };
  },
);

export const writeQueueMachine = setup({
  types: {
    context: {} as { jobs: WriteJobRec[] },
    events: {} as WriteQueueEvent,
  },
  actors: { writeJob },
}).createMachine({
  id: "writeQueue",
  context: { jobs: [] },
  on: {
    enqueue: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const newJobs = event.jobs.map((j, i) => ({
          id: `${j.photoId}:${j.kind}:${context.jobs.length + i}`,
          photoId: j.photoId,
          kind: j.kind,
          status: "running" as WriteStatus,
        }));
        if (newJobs.length === 0) {
          return;
        }
        enqueue.assign({ jobs: [...context.jobs, ...newJobs] });
        newJobs.forEach((job) => {
          enqueue.spawnChild("writeJob", { id: job.id, input: { id: job.id, kind: job.kind } });
        });
      }),
    },
    "write.settled": {
      actions: enqueueActions(({ event, enqueue }) => {
        enqueue.assign({
          jobs: ({ context }) =>
            context.jobs.map((j) =>
              j.id === event.id ? { ...j, status: event.ok ? "succeeded" : "failed" } : j,
            ),
        });
        enqueue.stopChild(event.id);
      }),
    },
  },
});
