import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer, type Socket } from "node:net";
import test from "node:test";
import {
  closeNotificationRedisClients,
  wakeNotificationWorker,
} from "../server/notifications/redis-wake.ts";

test("concurrent notification wake-ups share one Redis connection and close it", async (context) => {
  const sockets = new Set<Socket>();
  let acceptedConnections = 0;
  const server = createServer((socket) => {
    acceptedConnections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const command = readCommand(buffer);
        if (!command) break;
        buffer = buffer.subarray(command.bytes);
        socket.write(command.name === "LPUSH" || command.name === "EXPIRE"
          ? ":1\r\n"
          : "+OK\r\n");
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      context.skip("Local sockets are unavailable in this sandbox");
      return;
    }
    throw error;
  }
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const environment = { REDIS_URL: `redis://127.0.0.1:${address.port}` };
    assert.deepEqual(
      await Promise.all(Array.from({ length: 8 }, () => wakeNotificationWorker(environment))),
      Array(8).fill(true),
    );
    assert.equal(acceptedConnections, 1);
    await closeNotificationRedisClients();
    await new Promise<void>((resolve, reject) => {
      if (sockets.size === 0) return resolve();
      const timeout = setTimeout(() => reject(new Error("Redis connection stayed open")), 1_000);
      for (const socket of sockets) socket.once("close", () => {
        if (sockets.size === 0) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  } finally {
    await closeNotificationRedisClients();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function readCommand(buffer: Buffer): { name: string; bytes: number } | null {
  const firstLineEnd = lineEnd(buffer, 0);
  if (firstLineEnd < 0) return null;
  const firstLine = decode(buffer, 0, firstLineEnd);
  assert.match(firstLine, /^\*\d+$/);
  const count = Number(firstLine.slice(1));
  let cursor = firstLineEnd + 2;
  let name = "";
  for (let index = 0; index < count; index += 1) {
    const lengthLineEnd = lineEnd(buffer, cursor);
    if (lengthLineEnd < 0) return null;
    const lengthLine = decode(buffer, cursor, lengthLineEnd);
    assert.match(lengthLine, /^\$\d+$/);
    const length = Number(lengthLine.slice(1));
    cursor = lengthLineEnd + 2;
    if (buffer.length < cursor + length + 2) return null;
    if (index === 0) name = decode(buffer, cursor, cursor + length).toUpperCase();
    cursor += length;
    assert.equal(decode(buffer, cursor, cursor + 2), "\r\n");
    cursor += 2;
  }
  return { name, bytes: cursor };
}

function lineEnd(buffer: Uint8Array, start: number): number {
  for (let index = start; index + 1 < buffer.length; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) return index;
  }
  return -1;
}

function decode(buffer: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(buffer.subarray(start, end));
}
