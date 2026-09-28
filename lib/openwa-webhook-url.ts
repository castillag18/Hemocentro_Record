import { hostnameFromUrl, isPrivateNetworkHost } from "./google-oauth-url";

const WEBHOOK_PATH = "/api/webhooks/openwa";

/** OpenWA rechaza IPs privadas (172.x, 192.168.x) salvo localhost y hosts en SSRF_ALLOWED_HOSTS. */
export function isOpenWaAllowedWebhookUrl(url: string) {
  try {
    const host = hostnameFromUrl(url);
    if (!host) return false;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host === "host.docker.internal") return true;
    if (isPrivateNetworkHost(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function openWaWebhookSsrfHint(url: string) {
  if (isOpenWaAllowedWebhookUrl(url)) return "";
  return (
    "OpenWA bloqueó la URL por seguridad (SSRF). No es obligatorio: la app ya consulta respuestas «Sí» " +
    "automáticamente (sondeo de bandeja). Si desea webhook, en el contenedor OpenWA agregue " +
    "SSRF_ALLOWED_HOSTS=172.17.0.1,host.docker.internal o use OPENWA_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/openwa " +
    "con extra_hosts: host.docker.internal:host-gateway."
  );
}

function dockerWebhookFallbacks(port: string) {
  const path = WEBHOOK_PATH;
  if (process.platform === "win32" || process.platform === "darwin") {
    return [`http://host.docker.internal:${port}${path}`];
  }
  return [
    `http://host.docker.internal:${port}${path}`,
    `http://172.17.0.1:${port}${path}`,
  ];
}

export function resolveOpenWaWebhookCandidates() {
  const port = process.env.PORT?.trim() || "3000";
  const path = WEBHOOK_PATH;
  const explicit = process.env.OPENWA_WEBHOOK_URL?.trim();

  const openWaUrl = (process.env.WHATSAPP_OPENWA_URL || "http://localhost:2785").toLowerCase();
  const openWaOnLocalHost =
    openWaUrl.includes("localhost:2785") || openWaUrl.includes("127.0.0.1:2785");

  const dockerFallbacks = openWaOnLocalHost ? dockerWebhookFallbacks(port) : [];

  if (explicit) {
    if (isOpenWaAllowedWebhookUrl(explicit)) return [explicit];
    const allowed = dockerFallbacks.filter(isOpenWaAllowedWebhookUrl);
    return [...allowed, explicit];
  }

  if (openWaOnLocalHost) return dockerFallbacks;

  const base = (process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
  return [`${base}${path}`];
}

/** Candidatos para registrar webhook: URLs permitidas primero. */
export function resolveOpenWaWebhookRegisterCandidates() {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const url of resolveOpenWaWebhookCandidates()) {
    if (seen.has(url)) continue;
    seen.add(url);
    ordered.push(url);
  }
  return ordered.sort((a, b) => {
    const aa = isOpenWaAllowedWebhookUrl(a);
    const bb = isOpenWaAllowedWebhookUrl(b);
    if (aa && !bb) return -1;
    if (!aa && bb) return 1;
    return 0;
  });
}

export function resolveOpenWaWebhookUrl() {
  const candidates = resolveOpenWaWebhookRegisterCandidates();
  return candidates.find(isOpenWaAllowedWebhookUrl) ?? candidates[0] ?? `http://host.docker.internal:${process.env.PORT || "3000"}${WEBHOOK_PATH}`;
}
