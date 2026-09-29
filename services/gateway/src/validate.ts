import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import schema from "@comms/protocol/schema" with { type: "json" };
import { HttpError } from "./errors.ts";

// The schema file is the authority; request bodies are checked against its definitions.
const ajv = new Ajv2020({ allErrors: false, strict: false });
ajv.addSchema(schema);

const cache = new Map<string, ValidateFunction>();

function validator(name: string): ValidateFunction {
  let validate = cache.get(name);
  if (!validate) {
    validate = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
    if (!validate) throw new Error(`no schema definition ${name}`);
    cache.set(name, validate);
  }
  return validate;
}

/** Throws a 400 naming the offending field if `body` does not match the definition. */
export function validate<T>(name: string, body: unknown): T {
  const check = validator(name);
  if (!check(body ?? {})) {
    const error = check.errors![0]!;
    const where = error.instancePath ? error.instancePath.slice(1).replaceAll("/", ".") : "body";
    throw new HttpError(400, `${where} ${error.message}`);
  }
  return (body ?? {}) as T;
}
