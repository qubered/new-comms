// npm run dev: build mix-router, then run the gateway and both apps.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";

const cargo = spawnSync("cargo", ["build", "--release", "-p", "mix-router"], { stdio: "inherit" });
if (cargo.status !== 0) process.exit(cargo.status ?? 1);

const services = [
  ["gateway", ["run", "dev", "-w", "@comms/gateway"]],
  ["talk", ["run", "dev", "-w", "@comms/talk"]],
];
if (existsSync("apps/manager/package.json")) services.push(["manager", ["run", "dev", "-w", "@comms/manager"]]);

const children = services.map(([name, args]) => {
  const child = spawn("npm", args, { stdio: ["ignore", "pipe", "pipe"] });
  const tag = `[${name}] `;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => process.stdout.write(String(chunk).replace(/^(?=.)/gm, tag)));
  }
  child.on("exit", (code) => {
    console.error(`${tag}exited (${code})`);
    shutdown(code ?? 1);
  });
  return child;
});

const ip = Object.values(networkInterfaces()).flat().find((i) => i?.family === "IPv4" && !i.internal)?.address ?? "localhost";
setTimeout(() => {
  console.log(`\n  Talk (phones):  https://${ip}:5173   (accept the certificate warning once)`);
  if (existsSync("apps/manager/package.json")) console.log(`  Manager:        https://${ip}:5174`);
  console.log(`  Gateway:        http://${ip}:8080/api/v1/health\n`);
}, 2500);

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
