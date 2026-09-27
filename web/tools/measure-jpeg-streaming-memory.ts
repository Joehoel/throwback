import { readFile } from "node:fs/promises";
import { memoryUsage } from "node:process";
import { Effect } from "effect";
import { parseJpegStream } from "../src/server/jpeg/jpeg-parser.ts";
import { prepareJpegTransform } from "../src/server/jpeg/jpeg-codec.ts";
import type { ReplayableJpeg } from "../src/server/jpeg/model.ts";

const MEBIBYTE = 1024 * 1024;

const CHUNK_BYTES = 64 * 1024;

function numericArgument(name: string, fallback: number): number {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  const value = argument === undefined ? fallback : Number(argument.slice(name.length + 3));

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return value;
}

function syntheticSource(header: Uint8Array, byteLength: number): ReplayableJpeg {
  if (byteLength <= header.length + 2) {
    throw new Error("Synthetic JPEG size is smaller than its header");
  }

  return {
    open: () => {
      let phase: "header" | "scan" | "eoi" | "done" = "header";
      let remaining = byteLength - header.length - 2;
      const scanChunk = new Uint8Array(CHUNK_BYTES);

      return Effect.succeed(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            switch (phase) {
              case "header": {
                controller.enqueue(header);
                phase = "scan";
                break;
              }

              case "scan": {
                const size = Math.min(remaining, CHUNK_BYTES);
                controller.enqueue(size === CHUNK_BYTES ? scanChunk : scanChunk.subarray(0, size));
                remaining -= size;

                if (remaining === 0) {
                  phase = "eoi";
                }

                break;
              }

              case "eoi": {
                controller.enqueue(new Uint8Array([0xff, 0xd9]));
                phase = "done";
                break;
              }

              case "done": {
                controller.close();
                break;
              }

              default: {
                phase satisfies never;
              }
            }
          },
        }),
      );
    },
  };
}

async function drainNext(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  bytes: number,
): Promise<number> {
  const result = await reader.read();

  if (result.done) {
    return bytes;
  }

  return drainNext(reader, bytes + result.value.length);
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();

  try {
    return await drainNext(reader, 0);
  } finally {
    reader.releaseLock();
  }
}

const tasks = numericArgument("tasks", 2);

const sizeMib = numericArgument("size-mib", 100);

const limitMib = numericArgument("limit-mib", 80);

const fixture = new Uint8Array(
  await readFile(new URL("../src/server/jpeg/fixtures/baseline-minimal.jpg", import.meta.url)),
);

const parsedFixture = await parseJpegStream(
  new ReadableStream({
    start(controller) {
      controller.enqueue(fixture);
      controller.close();
    },
  }),
);

globalThis.gc?.();

const baselineRss = memoryUsage().rss;

let peakRss = baselineRss;

const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, memoryUsage().rss);
}, 5);

const startedAt = performance.now();

const expectedBytes = sizeMib * MEBIBYTE;

const completed = await Promise.all(
  Array.from({ length: tasks }, async () => {
    const source = syntheticSource(parsedFixture.header, expectedBytes);

    const prepared = await Effect.runPromise(
      prepareJpegTransform(source, { description: null, location: null, orientation: 1 }),
    );

    return drain(await Effect.runPromise(prepared.open()));
  }),
);

clearInterval(sampler);

peakRss = Math.max(peakRss, memoryUsage().rss);

if (completed.some((bytes) => bytes !== expectedBytes)) {
  throw new Error(
    `Streaming measurement produced an unexpected output length: ${completed.join(", ")}`,
  );
}

const peakRssMib = peakRss / MEBIBYTE;

const result = {
  tasks,
  bytesPerTask: expectedBytes,
  elapsedMilliseconds: Math.round(performance.now() - startedAt),
  baselineRssMib: Number((baselineRss / MEBIBYTE).toFixed(2)),
  peakRssMib: Number(peakRssMib.toFixed(2)),
  peakRssDeltaMib: Number(((peakRss - baselineRss) / MEBIBYTE).toFixed(2)),
  limitMib,
  passed: peakRssMib <= limitMib,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!result.passed) {
  process.exitCode = 1;
}
