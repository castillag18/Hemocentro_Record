"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { loginSchema } from "@/lib/validation/schemas";
import { alertError, alertSuccess, alertInfo, showLoading, closeLoading } from "@/lib/alerts";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@hemocentro.local");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [oauthPaste, setOauthPaste] = useState("");
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const autoConnectAttempted = useRef(false);

  const googleError = searchParams.get("error");

  useEffect(() => {
    if (googleError !== "google_not_configured") return;
    void api<{ redirectUri: string; javascriptOrigin: string }>("/api/auth/google/status").then(
      (status) => {
        void alertInfo(
          "Google OAuth no configurado",
          `Inicie sesión con correo y contraseña. El administrador del sistema debe definir GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env del servidor.\n\nEn Google Cloud use:\n• Origen JS: ${status.javascriptOrigin}\n• URI redirect: ${status.redirectUri}`,
        );
      },
    );
  }, [googleError]);

  async function loginWithGoogle() {
    void alertInfo(
      "Después de autorizar en Google",
      "Si el navegador muestra localhost con error de conexión, copie la URL completa de la barra y péguela abajo en «Completar inicio de sesión con URL copiada».",
    );
    window.setTimeout(() => {
      window.location.href = "/api/auth/google?mode=login";
    }, 800);
  }

  async function completeGoogleLoginPaste(codeInput?: string) {
    const code = (codeInput ?? oauthPaste).trim();
    if (!code) {
      void alertInfo("Pegue la URL", "Copie la URL completa después de autorizar en Google.");
      return;
    }
    setOauthConnecting(true);
    showLoading("Completando inicio de sesión con Google...");
    try {
      await api<{ email: string; calendarConnected: boolean; synced: number }>(
        "/api/auth/google/complete",
        {
          method: "POST",
          body: JSON.stringify({ code }),
        },
      );
      closeLoading();
      await alertSuccess("Bienvenido", "Sesión iniciada con Google correctamente");
      router.replace("/");
      router.refresh();
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo completar el inicio de sesión");
    } finally {
      setOauthConnecting(false);
    }
  }

  useEffect(() => {
    const autoCode = searchParams.get("oauth_code");
    if (!autoCode || autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    window.history.replaceState({}, "", "/login");
    setOauthPaste(autoCode);
    void completeGoogleLoginPaste(autoCode);
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        errors[key] = issue.message;
      }
      setFieldErrors(errors);
      void alertError("Datos inválidos", Object.values(errors)[0]);
      return;
    }

    setLoading(true);
    showLoading("Iniciando sesión...");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      closeLoading();
      await alertSuccess("Bienvenido", "Sesión iniciada correctamente");
      router.replace("/");
      router.refresh();
    } catch (err) {
      closeLoading();
      void alertError("Error de acceso", err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  function googleErrorMessage() {
    if (googleError === "google_test_user") {
      return "Google bloqueó el acceso: agregue su correo en Google Cloud → Pantalla de consentimiento OAuth → Usuarios de prueba.";
    }
    if (googleError === "google_not_authorized") {
      const email = searchParams.get("email");
      return email
        ? `El correo ${email} no está registrado. Un administrador debe crear su usuario en Usuarios con ese mismo correo.`
        : "Su cuenta de Google no está autorizada. Cree un usuario con ese correo en Usuarios.";
    }
    if (googleError === "google_no_refresh") {
      return "Google no entregó permisos de Calendar. Revoque el acceso en myaccount.google.com/permissions e intente Conectar de nuevo.";
    }
    if (googleError === "google_denied") return "Acceso con Google cancelado.";
    if (googleError === "google_not_configured") {
      return "Google OAuth no está configurado en el servidor (.env). Contacte al administrador del sistema.";
    }
    if (googleError === "google_invalid") return "Sesión OAuth inválida. Intente de nuevo.";
    if (googleError === "google_failed") return "Error al conectar con Google. Verifique credenciales y URIs.";
    if (googleError === "database_unavailable") {
      return "Base de datos no disponible. Inicie Docker Desktop, ejecute npm run install:local y reinicie la app.";
    }
    if (googleError) return "No se pudo iniciar sesión con Google.";
    return null;
  }

  const errorMsg = googleErrorMessage();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[26rem] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-level-2 p-6">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="HUAV Banco de Sangre" className="h-12 w-auto shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-primary leading-tight">HUAV</h1>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Banco de sangre · Administración
            </p>
          </div>
        </div>

        {errorMsg ? (
          <p className="text-sm text-error mb-4 rounded-lg bg-error-container/30 p-2">{errorMsg}</p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Correo</span>
            <input
              type="email"
              maxLength={254}
              className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email ? <span className="text-xs text-error">{fieldErrors.email}</span> : null}
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Contraseña</span>
            <input
              type="password"
              maxLength={128}
              className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password ? <span className="text-xs text-error">{fieldErrors.password}</span> : null}
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Spinner size="sm" className="text-white" /> : <Icon name="login" />}
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-outline-variant" />
          <span className="text-xs text-secondary">o</span>
          <div className="flex-1 h-px bg-outline-variant" />
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => void loginWithGoogle()}
          disabled={loading}
        >
          <Icon name="account_circle" /> Continuar con Google
        </Button>
        <p className="text-xs text-secondary mt-2">
          Si Calendar no está conectado, Google pedirá permiso de calendario al iniciar sesión (cuenta
          registrada en Usuarios).
        </p>

        <div className="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-2">
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
            Completar inicio de sesión con URL copiada
          </p>
          <p className="text-xs text-secondary">
            Si Google redirige a <span className="font-mono">localhost</span> y no vuelve a la app, copie la URL
            completa (contiene <span className="font-mono">code=</span>) y péguela aquí.
          </p>
          <textarea
            className="w-full border border-secondary-container rounded-lg p-2 text-xs font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[4rem]"
            placeholder="http://localhost:3000/api/auth/google/callback?code=..."
            value={oauthPaste}
            onChange={(e) => setOauthPaste(e.target.value)}
            disabled={oauthConnecting || loading}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void completeGoogleLoginPaste()}
            disabled={oauthConnecting || loading || !oauthPaste.trim()}
          >
            {oauthConnecting ? <Spinner size="sm" /> : <Icon name="link" />}
            {oauthConnecting ? "Completando..." : "Completar inicio de sesión"}
          </Button>
        </div>

        <p className="text-xs text-secondary mt-5">
          Acceso inicial: <span className="font-mono">admin@hemocentro.local</span> /{" "}
          <span className="font-mono">Admin123!</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
