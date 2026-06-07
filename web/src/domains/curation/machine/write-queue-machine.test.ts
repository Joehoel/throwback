import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { writeQueueMachine } from "./write-queue-machine";

describe("writeQueueMachine", () => {
  it("starts empty", () => {
    const actor = createActor(writeQueueMachine).start();
    expect(actor.getSnapshot().context.jobs).toEqual([]);
    actor.stop();
  });

  it("enqueues one running job per write and ids them per photo+kind", () => {
    const actor = createActor(writeQueueMachine).start();
    actor.send({
      type: "enqueue",
      jobs: [
        { photoId: "p1", kind: "description" },
        { photoId: "p1", kind: "location_orientation" },
      ],
    });
    const { jobs } = actor.getSnapshot().context;
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === "running")).toBe(true);
    expect(jobs.map((j) => j.kind)).toEqual(["description", "location_orientation"]);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(2); // unique ids
    actor.stop();
  });

  it("settles a job to succeeded by id", () => {
    const actor = createActor(writeQueueMachine).start();
    actor.send({ type: "enqueue", jobs: [{ photoId: "p1", kind: "description" }] });
    const id = actor.getSnapshot().context.jobs[0].id;
    actor.send({ type: "write.settled", id, ok: true });
    expect(actor.getSnapshot().context.jobs.find((j) => j.id === id)?.status).toBe("succeeded");
    actor.stop();
  });

  it("marks a failed settle", () => {
    const actor = createActor(writeQueueMachine).start();
    actor.send({ type: "enqueue", jobs: [{ photoId: "p2", kind: "location_orientation" }] });
    const id = actor.getSnapshot().context.jobs[0].id;
    actor.send({ type: "write.settled", id, ok: false });
    expect(actor.getSnapshot().context.jobs.find((j) => j.id === id)?.status).toBe("failed");
    actor.stop();
  });

  it("accumulates jobs across multiple enqueues", () => {
    const actor = createActor(writeQueueMachine).start();
    actor.send({ type: "enqueue", jobs: [{ photoId: "p1", kind: "description" }] });
    actor.send({ type: "enqueue", jobs: [{ photoId: "p2", kind: "description" }] });
    expect(actor.getSnapshot().context.jobs).toHaveLength(2);
    actor.stop();
  });
});
