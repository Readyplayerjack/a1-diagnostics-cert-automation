import { describe, expect, it } from "vitest";
import { EnvError, parseServerEnv } from "@/lib/server/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PLAY_TOKEN_SECRET: "x".repeat(44),
  ADMIN_PASSWORD: "change-me",
};

describe("parseServerEnv", () => {
  it("accepts a complete env", () => {
    expect(parseServerEnv(valid)).toEqual(valid);
  });

  it.each(Object.keys(valid))("names the missing variable %s", (key) => {
    const env: Record<string, string | undefined> = { ...valid, [key]: undefined };
    expect(() => parseServerEnv(env)).toThrow(EnvError);
    expect(() => parseServerEnv(env)).toThrow(`Missing required environment variable: ${key}`);
  });

  it("treats empty strings as missing", () => {
    expect(() => parseServerEnv({ ...valid, ADMIN_PASSWORD: "" })).toThrow(
      "Missing required environment variable: ADMIN_PASSWORD",
    );
  });

  it("lists every missing variable at once", () => {
    try {
      parseServerEnv({});
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      for (const key of Object.keys(valid)) expect(msg).toContain(key);
    }
  });

  it("rejects a short PLAY_TOKEN_SECRET with a clear message", () => {
    expect(() => parseServerEnv({ ...valid, PLAY_TOKEN_SECRET: "short" })).toThrow(
      /Invalid environment variable PLAY_TOKEN_SECRET/,
    );
  });

  it("rejects a malformed Supabase URL", () => {
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(
      /Invalid environment variable NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});
