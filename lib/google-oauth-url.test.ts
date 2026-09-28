import { describe, expect, it } from "vitest";
import {
  detectGoogleOAuthDeployment,
  isGoogleAllowedOAuthUrl,
  isPrivateNetworkHost,
} from "./google-oauth-url";

describe("google-oauth-url", () => {
  it("rechaza IPs privadas en redirect OAuth", () => {
    expect(
      isGoogleAllowedOAuthUrl("http://192.168.1.112:3000/api/auth/google/callback"),
    ).toBe(false);
  });

  it("acepta localhost", () => {
    expect(isGoogleAllowedOAuthUrl("http://localhost:3000/api/auth/google/callback")).toBe(true);
  });

  it("acepta HTTPS público (túnel)", () => {
    expect(
      isGoogleAllowedOAuthUrl("https://abc123.ngrok-free.app/api/auth/google/callback"),
    ).toBe(true);
  });

  it("detecta despliegue LAN bloqueado", () => {
    expect(
      detectGoogleOAuthDeployment(
        "http://192.168.1.112:3000/api/auth/google/callback",
        "http://192.168.1.112:3000",
      ),
    ).toBe("private_ip_blocked");
  });

  it("detecta túnel cuando redirect difiere de app URL", () => {
    expect(
      detectGoogleOAuthDeployment(
        "https://abc.ngrok-free.app/api/auth/google/callback",
        "http://192.168.1.112:3000",
      ),
    ).toBe("tunnel");
  });

  it("identifica hosts LAN", () => {
    expect(isPrivateNetworkHost("192.168.1.112")).toBe(true);
    expect(isPrivateNetworkHost("localhost")).toBe(false);
  });
});
