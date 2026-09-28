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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const autoConnectAttempted = useRef(false);

  const googleError = searchParams.get("error");

  useEffect(() => {
    if (googleError !== "google_not_configured") return;
    void alertInfo(
      "Google OAuth no configurado",
      "Inicie sesión con correo y contraseña o contacte al administrador del sistema.",
    );
  }, [googleError]);

  async function completeGoogleLogin(code: string) {
    showLoading("Completando inicio de sesión con Google...");
    try {
      await api<{ email: string }>("/api/auth/google/complete", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      closeLoading();
      await alertSuccess("Bienvenido", "Sesión iniciada con Google correctamente");
      router.replace("/");
      router.refresh();
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo completar el inicio de sesión");
    }
  }

  useEffect(() => {
    const autoCode = searchParams.get("oauth_code");
    if (!autoCode || autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    window.history.replaceState({}, "", "/login");
    void completeGoogleLogin(autoCode);
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
      return "Google bloqueó el acceso. Contacte al administrador del sistema.";
    }
    if (googleError === "google_not_authorized") {
      return "Su cuenta de Google no está autorizada. Solicite acceso al administrador.";
    }
    if (googleError === "google_no_refresh") {
      return "No se pudieron obtener permisos de Google Calendar. Contacte al administrador.";
    }
    if (googleError === "google_denied") return "Acceso con Google cancelado.";
    if (googleError === "google_not_configured") {
      return "Inicio de sesión con Google no disponible. Use correo y contraseña.";
    }
    if (googleError === "google_invalid") return "Sesión OAuth inválida. Intente de nuevo.";
    if (googleError === "google_failed") return "Error al conectar con Google. Intente más tarde.";
    if (googleError === "database_unavailable") {
      return "Servicio temporalmente no disponible. Intente más tarde.";
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
              autoComplete="username"
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
              autoComplete="current-password"
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
          onClick={() => {
            window.location.href = "/api/auth/google?mode=login";
          }}
          disabled={loading}
        >
          <Icon name="account_circle" /> Continuar con Google
        </Button>
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
