import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy – route protection", () => {
  it("passes through requests to unprotected paths", () => {
    const req = new NextRequest("http://localhost:3000/");
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through requests to public API paths", () => {
    const req = new NextRequest("http://localhost:3000/api/routes");
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /profile to /login when no session cookie is present", () => {
    const req = new NextRequest("http://localhost:3000/profile");
    const res = proxy(req);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl");
  });

  it("includes the original path as callbackUrl in the redirect", () => {
    const req = new NextRequest("http://localhost:3000/profile");
    const res = proxy(req);
    const location = res.headers.get("location") ?? "";
    expect(decodeURIComponent(location)).toContain("/profile");
  });

  it("redirects /routes/builder to /login without a session cookie", () => {
    const req = new NextRequest("http://localhost:3000/routes/builder");
    const res = proxy(req);
    expect(res.headers.get("location") ?? "").toContain("/login");
  });

  it("passes through /profile when next-auth.session-token cookie is present", () => {
    const req = new NextRequest("http://localhost:3000/profile", {
      headers: { cookie: "next-auth.session-token=some-valid-token" },
    });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through /profile when __Secure-next-auth.session-token cookie is present", () => {
    const req = new NextRequest("http://localhost:3000/profile", {
      headers: { cookie: "__Secure-next-auth.session-token=some-valid-token" },
    });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through /profile when authjs.session-token cookie is present", () => {
    const req = new NextRequest("http://localhost:3000/profile", {
      headers: { cookie: "authjs.session-token=some-valid-token" },
    });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through /profile when __Secure-authjs.session-token cookie is present", () => {
    const req = new NextRequest("http://localhost:3000/profile", {
      headers: { cookie: "__Secure-authjs.session-token=some-valid-token" },
    });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through /routes/builder when session cookie is present", () => {
    const req = new NextRequest("http://localhost:3000/routes/builder", {
      headers: { cookie: "next-auth.session-token=some-valid-token" },
    });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("preserves query string in callbackUrl redirect", () => {
    const req = new NextRequest("http://localhost:3000/profile?tab=stats&year=2026");
    const res = proxy(req);
    const location = res.headers.get("location") ?? "";
    expect(decodeURIComponent(location)).toContain("/profile?tab=stats&year=2026");
  });
});
