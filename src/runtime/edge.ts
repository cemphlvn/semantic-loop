import type { JsonValue } from "../types.ts";

const encoder = new TextEncoder();

/** Input for HMAC signature verification. */
export interface HmacVerificationInput {
  readonly body: string;
  readonly signature: string;
  readonly secret: string;
  readonly algorithm?: "SHA-256" | "SHA-384" | "SHA-512";
}

/** Verify an HMAC signature against a request body using `crypto.subtle`. Uses timing-safe comparison to prevent timing attacks. */
export async function verifyHmacSignature(input: HmacVerificationInput): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    {
      name: "HMAC",
      hash: input.algorithm ?? "SHA-256",
    },
    false,
    ["sign"],
  );

  const raw = await crypto.subtle.sign("HMAC", key, encoder.encode(input.body));
  const expected = toHex(new Uint8Array(raw));
  const normalizedSignature = input.signature.trim().toLowerCase().replace(/^sha256=/, "");
  return timingSafeEqual(expected, normalizedSignature);
}

/** Parse the request body as JSON and cast to the given type. */
export async function readJson<T>(request: Request): Promise<T> {
  return await request.json() as T;
}

/** Create a JSON {@link Response} with the given data, status code, and optional headers. */
export function json(data: JsonValue, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
}

/** Return a 405 Method Not Allowed JSON response listing the allowed methods. */
export function methodNotAllowed(methods: readonly string[]): Response {
  return json({ error: `Method not allowed. Allowed: ${methods.join(", ")}` }, 405);
}

/** Convert a byte array to a lowercase hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte: number) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison to prevent timing attacks. Returns `false` immediately if lengths differ. */
export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
