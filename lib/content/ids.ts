import { createHash } from "node:crypto";

/**
 * Deterministic UUID v5 (RFC 9562) so the seeder can upsert the same rows on
 * every run: the same prompt slug or answer label always maps to the same id.
 */
const NAMESPACE = "6f1c3a52-6b1e-4f43-9d7a-2a8f0c1d9e47"; // fixed project namespace

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

export function uuidV5(name: string, namespace: string = NAMESPACE): string {
  const hash = createHash("sha1").update(uuidToBytes(namespace)).update(name, "utf8").digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const promptId = (slug: string): string => uuidV5(`prompt:${slug}`);
export const answerId = (slug: string, label: string): string => uuidV5(`answer:${slug}:${label}`);
