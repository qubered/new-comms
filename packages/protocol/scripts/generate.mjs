// Generates src/generated.ts from schema/protocol.schema.json. `--check` fails if it is stale.
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(resolve(root, "schema/protocol.schema.json"), "utf8"));
const banner = "// Generated from schema/protocol.schema.json by scripts/generate.mjs. Do not edit.\n";
let output = await compile(schema, "Protocol", { bannerComment: banner, additionalProperties: false, declareExternallyReferenced: true, unreachableDefinitions: true, style: { singleQuote: false } });
// Drop the wrapper type; only the named definitions are part of the API.
output = output.replace(/export interface Protocol \{[\s\S]*?\n\}\n/, "");
const target = resolve(root, "src/generated.ts");
if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8");
  if (current !== output) {
    console.error("src/generated.ts is out of date; run npm run generate -w @comms/protocol");
    process.exit(1);
  }
} else {
  writeFileSync(target, output);
  console.log("wrote src/generated.ts");
}
