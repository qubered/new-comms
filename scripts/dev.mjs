// npm run dev:  mix-router, gateway and both apps with hot reload.
// npm run show: release builds, then mix-router and the gateway serving the built apps.
// mix-router is its own process; the gateway connects to it (MIX_ROUTER_ADDR, default 127.0.0.1:7100).
import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const show = process.argv.includes("--show");
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run("cargo", ["build", "--release", "-p", "mix-router"]);
if (show) run("npm", ["run", "build"]);

const services = [
  ["mixer", "./target/release/mix-router", []],
  ["gateway", "npm", show ? ["run", "start", "-w", "@comms/gateway"] : ["run", "dev", "-w", "@comms/gateway"]],
];
if (!show) {
  services.push(["talk", "npm", ["run", "dev", "-w", "@comms/talk"]]);
  services.push(["manager", "npm", ["run", "dev", "-w", "@comms/manager"]]);
}

const children = services.map(([name, command, args]) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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
if (!show) {
  setTimeout(() => {
    console.log(`\n  Talk (phones):  https://${ip}:5173   (accept the certificate warning once)`);
    console.log(`  Manager:        https://${ip}:5174`);
    console.log(`  Gateway:        http://${ip}:8080/api/v2/health\n`);
  }, 2500);
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
