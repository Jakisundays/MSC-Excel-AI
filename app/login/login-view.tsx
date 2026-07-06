"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  Lock,
  Loader2,
  Mail,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type ErrorKind =
  | "oauth"
  | "auth"
  | "not_allowed"
  | "invalid_credentials"
  | "rate_limited"
  | "network";

const ERROR_COPY: Record<ErrorKind, { title: string; detail: string }> = {
  oauth: {
    title: "No pudimos iniciar el login con Google.",
    detail: "Intentá de nuevo.",
  },
  auth: {
    title: "Falló la autenticación con Google.",
    detail: "Intentá de nuevo o usá otra cuenta.",
  },
  not_allowed: {
    title: "Tu cuenta no tiene acceso a esta herramienta.",
    detail:
      "Es de uso interno del equipo. Escribile a soporte si creés que es un error.",
  },
  invalid_credentials: {
    title: "Correo o contraseña incorrectos.",
    detail: "Verificá tus datos e intentá de nuevo.",
  },
  rate_limited: {
    title: "Demasiados intentos.",
    detail: "Esperá un minuto e intentá de nuevo.",
  },
  network: {
    title: "No pudimos conectarnos.",
    detail: "Revisá tu conexión a internet e intentá de nuevo.",
  },
};

/** `data.error` viene del servidor sin garantía estática de que sea una
 * clave conocida (ej. un código nuevo agregado del lado de una ruta sin
 * actualizar este mapa) -- nunca indexar ERROR_COPY directo con un valor
 * no validado, cae a "network" en vez de romper el render. */
function errorCopyFor(kind: ErrorKind): { title: string; detail: string } {
  return ERROR_COPY[kind] ?? ERROR_COPY.network;
}

const BENEFITS = [
  { icon: FileSpreadsheet, label: "Extracción automática de datos" },
  { icon: Sparkles, label: "Validación con IA" },
  { icon: History, label: "Historial de solicitudes" },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="bg-brand-panel flex size-8 shrink-0 items-center justify-center rounded-lg">
        <LogoMark />
      </div>
      <div className="leading-tight">
        <div className={compact ? "text-sm font-semibold" : "text-[15px] font-semibold"}>
          MSC Excel AI
        </div>
        <div className="text-brand-panel-foreground/45 text-[9.5px] font-medium tracking-wider uppercase">
          Concierge de datos
        </div>
      </div>
    </div>
  );
}

export function LoginView({
  oauthError,
  returnTo,
}: {
  oauthError: ErrorKind | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const googleHref = returnTo
    ? `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/login";

  const [pending, setPending] = useState<"google" | "credentials" | null>(null);
  const [success, setSuccess] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState<ErrorKind | null>(oauthError);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const emailError = touched.email
    ? !email.trim()
      ? "Ingresá tu correo electrónico."
      : !validEmail(email)
        ? "Ingresá un correo electrónico válido."
        : null
    : null;
  const passwordError =
    touched.password && !password ? "Ingresá tu contraseña." : null;

  const anyLoading = pending !== null;

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!validEmail(email) || !password) return;

    setError(null);
    setPending("credentials");
    try {
      const res = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError((data.error as ErrorKind) ?? "network");
        setPending(null);
        return;
      }
      setFirstName(typeof data.name === "string" ? data.name : "");
      setSuccess(true);
      setTimeout(() => {
        router.push(returnTo || "/dashboard");
        router.refresh();
      }, 550);
    } catch {
      setError("network");
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* ======== BRAND PANEL (tablet + desktop) ======== */}
      <div
        aria-hidden
        className="relative hidden shrink-0 flex-col justify-between overflow-hidden bg-brand-panel text-brand-panel-foreground md:flex md:w-[40%] lg:w-[46%] lg:p-14 p-8"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(125%_95%_at_78%_8%,#000_30%,transparent_76%)]"
        />

        <div className="relative">
          <BrandMark />
        </div>

        <div className="relative">
          <div className="text-brand-panel-foreground/45 mb-4 text-[11px] font-medium tracking-wider uppercase">
            Herramienta interna · equipo
          </div>
          <h1 className="max-w-[15ch] text-3xl leading-[1.1] font-medium tracking-tight lg:text-4xl">
            Procesá tus archivos Excel con IA, sin fricción.
          </h1>
          <p className="text-brand-panel-foreground/62 mt-4 max-w-[38ch] text-[14.5px] leading-relaxed">
            Subís los Excel, elegís las hojas y sumás los correos. Los
            procesamos con IA y te avisamos cuando estén listos.
          </p>

          <div className="mt-8 hidden flex-col gap-3.5 lg:flex">
            {BENEFITS.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <div className="bg-brand-panel-foreground/8 text-brand-panel-foreground/80 flex size-[30px] shrink-0 items-center justify-center rounded-full">
                  <b.icon className="size-3.5" aria-hidden />
                </div>
                <span className="text-brand-panel-foreground/72 text-[13.5px]">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-brand-panel-foreground/50 relative flex items-center gap-1.5 text-[11.5px]">
          <Lock className="size-3.5" aria-hidden />
          Conexión segura
        </div>
      </div>

      {/* ======== FORM PANEL ======== */}
      <div className="relative flex flex-1 items-start justify-center overflow-y-auto px-5 py-8 md:items-center md:px-8 lg:px-14">
        <div className="absolute top-4 right-4 md:top-5 md:right-5">
          <ModeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2.5 md:hidden">
            <div className="bg-brand-panel flex size-8 shrink-0 items-center justify-center rounded-lg">
              <LogoMark />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">MSC Excel AI</div>
              <div className="text-muted-foreground text-[8.5px] font-medium tracking-wider uppercase">
                Concierge de datos
              </div>
            </div>
          </div>

          {success ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/10 shadow-xl duration-300 max-md:rounded-none max-md:bg-transparent max-md:p-0 max-md:shadow-none max-md:ring-0">
              <div className="bg-success/12 text-success mx-auto mb-5 flex size-14 items-center justify-center rounded-full">
                <CheckCircle2 className="size-7" aria-hidden />
              </div>
              <h1 className="text-xl font-medium tracking-tight">
                {firstName ? `¡Bienvenida, ${firstName}!` : "¡Sesión iniciada!"}
              </h1>
              <p className="text-muted-foreground mt-2.5 text-sm">
                Te llevamos al panel…
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 shadow-xl duration-300 sm:p-8 max-md:rounded-none max-md:bg-transparent max-md:p-0 max-md:shadow-none max-md:ring-0">
              <h1 className="text-xl font-medium tracking-tight md:text-[23px]">
                Iniciar sesión
              </h1>
              <p className="text-muted-foreground mt-2 mb-6 text-[13.5px] leading-relaxed">
                Entrá con tu cuenta de Google corporativa o con tu correo y
                contraseña.
              </p>

              {error && (
                <div
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <div className="font-medium">{errorCopyFor(error).title}</div>
                    <div className="text-destructive/80 mt-0.5 text-xs">
                      {errorCopyFor(error).detail}
                    </div>
                  </div>
                </div>
              )}

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-full text-[15px]"
                disabled={anyLoading}
              >
                <a
                  href={googleHref}
                  aria-disabled={anyLoading}
                  onClick={(e) => {
                    if (anyLoading) {
                      e.preventDefault();
                      return;
                    }
                    setPending("google");
                  }}
                >
                  {pending === "google" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                      <path
                        fill="#4285F4"
                        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.63Z"
                      />
                      <path
                        fill="#34A853"
                        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
                      />
                    </svg>
                  )}
                  {pending === "google" ? "Conectando…" : "Continuar con Google"}
                </a>
              </Button>

              <div className="my-5 flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-[11.5px] whitespace-nowrap">
                  o con tu correo
                </span>
                <span className="bg-border h-px flex-1" />
              </div>

              <form onSubmit={onSubmitCredentials} noValidate className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="login-email" className="mb-2">
                    Correo electrónico
                  </Label>
                  <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon>
                      <Mail className="size-4" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="login-email"
                      type="email"
                      autoComplete="username"
                      placeholder="vos@msc.com"
                      value={email}
                      disabled={anyLoading}
                      aria-invalid={!!emailError}
                      aria-describedby="login-email-error"
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() =>
                        setTouched((t) => ({ ...t, email: true }))
                      }
                    />
                  </InputGroup>
                  {emailError && (
                    <div
                      id="login-email-error"
                      className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {emailError}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <Label htmlFor="login-password">Contraseña</Label>
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </a>
                  </div>
                  <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon>
                      <Lock className="size-4" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      disabled={anyLoading}
                      aria-invalid={!!passwordError}
                      aria-describedby="login-password-error"
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() =>
                        setTouched((t) => ({ ...t, password: true }))
                      }
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        size="icon-xs"
                        aria-label={
                          showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                        }
                        disabled={anyLoading}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {passwordError && (
                    <div
                      id="login-password-error"
                      className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {passwordError}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="mt-0.5 h-12 w-full rounded-full text-[15px]"
                  disabled={anyLoading}
                >
                  {pending === "credentials" && (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  )}
                  {pending === "credentials" ? "Verificando…" : "Iniciar sesión"}
                </Button>
              </form>

              <div className="text-muted-foreground mt-6 flex items-center gap-1.5 text-[11.5px]">
                <Lock className="size-3.5" aria-hidden />
                Conexión segura
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
