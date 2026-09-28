/** Google OAuth (cliente web) solo permite localhost o dominios públicos — no IPs LAN. */

const PRIVATE_IPV4 =
  /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+)$/;

export function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isPrivateNetworkHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost") return false;
  if (PRIVATE_IPV4.test(host)) return true;
  return host.endsWith(".local");
}

export function isLocalhostUrl(url: string) {
  const host = hostnameFromUrl(url);
  return host === "localhost" || host === "127.0.0.1";
}

/** URI que Google Cloud acepta en clientes OAuth tipo «Aplicación web». */
export function isGoogleAllowedOAuthUrl(url: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (isLocalhostUrl(url)) return true;
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateNetworkHost(host)) return false;
    if (!host.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export type GoogleOAuthDeployment = "localhost" | "public_https" | "tunnel" | "private_ip_blocked";

export function detectGoogleOAuthDeployment(redirectUri: string, appUrl: string): GoogleOAuthDeployment {
  if (isPrivateNetworkHost(hostnameFromUrl(redirectUri))) return "private_ip_blocked";
  if (isLocalhostUrl(redirectUri)) return "localhost";
  if (isGoogleAllowedOAuthUrl(redirectUri) && redirectUri !== appUrl.replace(/\/$/, "") + "/api/auth/google/callback") {
    return "tunnel";
  }
  if (isGoogleAllowedOAuthUrl(redirectUri)) return "public_https";
  return "private_ip_blocked";
}
