import { describe, expect, it } from "vitest";

import { resolveHost, siteOrigin } from "./host";

describe("resolveHost", () => {
  const base = "uncle.id";

  it("apex, www, dan app adalah host dashboard", () => {
    expect(resolveHost("uncle.id", base)).toEqual({ kind: "app" });
    expect(resolveHost("www.uncle.id", base)).toEqual({ kind: "app" });
    expect(resolveHost("app.uncle.id", base)).toEqual({ kind: "app" });
  });

  it("subdomain slug valid adalah landing page", () => {
    expect(resolveHost("teaterbagol.uncle.id", base)).toEqual({
      kind: "site",
      slug: "teaterbagol",
    });
    expect(resolveHost("TeaterBagol.Uncle.ID", base)).toEqual({
      kind: "site",
      slug: "teaterbagol",
    });
  });

  it("subdomain cadangan, bertingkat, atau format salah tidak dikenal", () => {
    expect(resolveHost("admin.uncle.id", base)).toEqual({ kind: "unknown" });
    expect(resolveHost("api.uncle.id", base)).toEqual({ kind: "unknown" });
    expect(resolveHost("a.b.uncle.id", base)).toEqual({ kind: "unknown" });
    expect(resolveHost("ab.uncle.id", base)).toEqual({ kind: "unknown" });
    expect(resolveHost("-abc.uncle.id", base)).toEqual({ kind: "unknown" });
  });

  it("port diabaikan saat membandingkan", () => {
    expect(resolveHost("teater.uncle.localhost:3100", "uncle.localhost:3000")).toEqual({
      kind: "site",
      slug: "teater",
    });
    expect(resolveHost("uncle.localhost:3100", "uncle.localhost:3000")).toEqual({ kind: "app" });
  });

  it("host lain (localhost, preview) diperlakukan sebagai dashboard", () => {
    expect(resolveHost("localhost:3000", base)).toEqual({ kind: "app" });
    expect(resolveHost("uncle-git-main.vercel.app", base)).toEqual({ kind: "app" });
    expect(resolveHost(null, base)).toEqual({ kind: "app" });
    expect(resolveHost("eviluncle.id", base)).toEqual({ kind: "app" });
  });
});

describe("siteOrigin", () => {
  it("menyusun origin landing page", () => {
    expect(siteOrigin("teaterbagol", "uncle.id", "https")).toBe("https://teaterbagol.uncle.id");
  });
});
