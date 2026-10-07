import { describe, expect, it } from "vitest";

import { generateToken, sha256 } from "./tokens";

describe("generateToken & sha256", () => {
  it("token 32 byte base64url dan unik", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("sha256 deterministik 32 byte", () => {
    expect(sha256("abc").equals(sha256("abc"))).toBe(true);
    expect(sha256("abc")).toHaveLength(32);
  });
});
