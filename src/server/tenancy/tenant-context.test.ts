import { describe, expect, it } from "vitest";

import { assertTenantContext, MissingTenantContextError } from "./tenant-context";

describe("assertTenantContext", () => {
  it("menerima eventId UUID", () => {
    expect(() =>
      assertTenantContext({ eventId: "3f8c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b" }),
    ).not.toThrow();
  });

  it.each([undefined, null, { eventId: "" }, { eventId: "teaterbagol" }])(
    "menolak konteks tidak valid: %j",
    (context) => {
      expect(() => assertTenantContext(context)).toThrow(MissingTenantContextError);
    },
  );

  it("error memakai kode domain dan tidak bocor ke klien sebagai 4xx", () => {
    const error = new MissingTenantContextError();
    expect(error.code).toBe("TENANT_CONTEXT_MISSING");
    expect(error.status).toBe(500);
    expect(error.name).toBe("MissingTenantContextError");
  });
});
