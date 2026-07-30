import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";

function command(...parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

export function pingRedis(
  redisUrl: string,
  timeoutMs = 5_000,
): Promise<void> {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return Promise.reject(new Error("Unsupported Redis protocol"));
  }
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const password = url.password ? decodeURIComponent(url.password) : "";
  const username = url.username ? decodeURIComponent(url.username) : "";

  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const socket = url.protocol === "rediss:"
      ? connectTls({ host: url.hostname, port, servername: url.hostname })
      : connectTcp({ host: url.hostname, port });
    const timer = setTimeout(() => finish(new Error("Redis readiness timed out")), timeoutMs);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    }

    socket.setEncoding("utf8");
    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.includes("-")) {
        finish(new Error("Redis readiness command failed"));
      } else if (buffer.includes("+PONG")) {
        finish();
      }
    });
    socket.on("connect", () => {
      if (password) {
        socket.write(username
          ? command("AUTH", username, password)
          : command("AUTH", password));
      }
      socket.write(command("PING"));
    });
  });
}
