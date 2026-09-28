/** Cookies `Secure` solo cuando la app se sirve por HTTPS (o COOKIE_SECURE lo fuerza). */
export function usesSecureCookies() {
  const forced = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "true") return true;
  if (forced === "false") return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  return appUrl.startsWith("https://");
}
