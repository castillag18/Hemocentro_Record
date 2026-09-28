import { afterEach, describe, expect, it } from "vitest";
import { usesSecureCookies } from "./cookie-secure";

describe("usesSecureCookies", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("usa Secure solo con HTTPS en NEXT_PUBLIC_APP_URL", () => {
    process.env.COOKIE_SECURE = "";
    process.env.NEXT_PUBLIC_APP_URL = "http://192.168.1.112:3000";
    expect(usesSecureCookies()).toBe(false);
  });

  it("usa Secure con HTTPS", () => {
    process.env.COOKIE_SECURE = "";
    process.env.NEXT_PUBLIC_APP_URL = "https://hemocentro.example.com";
    expect(usesSecureCookies()).toBe(true);
  });

  it("respeta COOKIE_SECURE=false", () => {
    process.env.COOKIE_SECURE = "false";
    process.env.NEXT_PUBLIC_APP_URL = "https://hemocentro.example.com";
    expect(usesSecureCookies()).toBe(false);
  });
});
