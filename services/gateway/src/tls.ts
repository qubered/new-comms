import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

/** A self-signed certificate valid for localhost and every LAN address, created on first use. */
export function loadOrCreateCertificate(dir: string): { key: Buffer; cert: Buffer } | undefined {
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((info) => info?.family === "IPv4")
      .map((info) => `IP:${info!.address}`);
    const san = ["DNS:localhost", ...ips].join(",");
    try {
      execFileSync(
        "openssl",
        ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=comms", "-addext", `subjectAltName=${san}`, "-keyout", key, "-out", cert],
        { stdio: "ignore" },
      );
    } catch {
      console.error("Could not create a certificate (is openssl installed?). Serving HTTP only; phones will not be able to use the mic.");
      return undefined;
    }
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}
