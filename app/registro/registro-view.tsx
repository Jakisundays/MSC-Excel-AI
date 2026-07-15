"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
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
  User,
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
import { isValidEmail, isValidPassword, PASSWORD_MIN_LENGTH } from "@/lib/validators";

type ErrorKind = "invalid_input" | "registration_failed" | "rate_limited" | "network";

const ERROR_COPY: Record<ErrorKind, { title: string; detail: string }> = {
  invalid_input: {
    title: "Revisá los datos ingresados.",
    detail: "Completá todos los campos correctamente e intentá de nuevo.",
  },
  registration_failed: {
    title: "No pudimos crear tu cuenta.",
    detail: "¿Ya tenés una cuenta? Iniciá sesión en vez de registrarte.",
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
 * clave conocida -- nunca indexar ERROR_COPY directo con un valor no
 * validado, cae a "network" en vez de romper el render. */
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

export function RegistroView() {
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const nameError =
    touched.name && !name.trim() ? "Ingresá tu nombre." : null;
  const emailError = touched.email
    ? !email.trim()
      ? "Ingresá tu correo electrónico."
      : !isValidEmail(email)
        ? "Ingresá un correo electrónico válido."
        : null
    : null;
  const passwordError = touched.password
    ? !password
      ? "Ingresá una contraseña."
      : !isValidPassword(password)
        ? `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con letras y números.`
        : null
    : null;
  const confirmPasswordError = touched.confirmPassword
    ? !confirmPassword
      ? "Confirmá tu contraseña."
      : confirmPassword !== password
        ? "Las contraseñas no coinciden."
        : null
    : null;

  const anyLoading = pending;
  const firstName = name.trim().split(/\s+/)[0] || "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    if (
      !name.trim() ||
      !isValidEmail(email) ||
      !isValidPassword(password) ||
      confirmPassword !== password
    ) {
      return;
    }

    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email,
          password,
          passwordConfirm: confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError((data.error as ErrorKind) ?? "network");
        setPending(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.push("/empresa/equipo");
        router.refresh();
      }, 550);
    } catch {
      setError("network");
      setPending(false);
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
            14 días de prueba gratis
          </div>
          <h1 className="max-w-[15ch] text-3xl leading-[1.1] font-medium tracking-tight lg:text-4xl">
            Creá tu cuenta y procesá tus Excel con IA.
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
                {firstName ? `¡Listo, ${firstName}!` : "¡Cuenta creada!"}
              </h1>
              <p className="text-muted-foreground mt-2.5 text-sm">
                Te llevamos a tu equipo…
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 shadow-xl duration-300 sm:p-8 max-md:rounded-none max-md:bg-transparent max-md:p-0 max-md:shadow-none max-md:ring-0">
              <h1 className="text-xl font-medium tracking-tight md:text-[23px]">
                Crear cuenta
              </h1>
              <p className="text-muted-foreground mt-2 mb-6 text-[13.5px] leading-relaxed">
                Registrate con tu correo y contraseña para empezar.
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

              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="registro-name" className="mb-2">
                    Nombre completo
                  </Label>
                  <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon>
                      <User className="size-4" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="registro-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Tu nombre completo"
                      value={name}
                      disabled={anyLoading}
                      aria-invalid={!!nameError}
                      aria-describedby="registro-name-error"
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    />
                  </InputGroup>
                  {nameError && (
                    <div
                      id="registro-name-error"
                      className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {nameError}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="registro-email" className="mb-2">
                    Correo electrónico
                  </Label>
                  <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon>
                      <Mail className="size-4" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="registro-email"
                      type="email"
                      autoComplete="email"
                      placeholder="vos@msc.com"
                      value={email}
                      disabled={anyLoading}
                      aria-invalid={!!emailError}
                      aria-describedby="registro-email-error"
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    />
                  </InputGroup>
                  {emailError && (
                    <div
                      id="registro-email-error"
                      className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {emailError}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="registro-password" className="mb-2">
                    Contraseña
                  </Label>
                  <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon>
                      <Lock className="size-4" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="registro-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={password}
                      disabled={anyLoading}
                      aria-invalid={!!passwordError}
                      aria-describedby="registro-password-error"
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
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
                      id="registro-password-error"
                      className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {passwordError}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="registro-confirm-password" className="mb-2">
                    Confirmar contraseña
                  </Label>
                  <InputGroup className="h-12 rounded-xl">
                    <InputGroupAddon>
                      <Lock className="size-4" aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="registro-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      disabled={anyLoading}
                      aria-invalid={!!confirmPasswordError}
                      aria-describedby="registro-confirm-password-error"
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() =>
                        setTouched((t) => ({ ...t, confirmPassword: true }))
                      }
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        size="icon-xs"
                        aria-label={
                          showConfirmPassword
                            ? "Ocultar contraseña"
                            : "Mostrar contraseña"
                        }
                        disabled={anyLoading}
                        onClick={() => setShowConfirmPassword((v) => !v)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {confirmPasswordError && (
                    <div
                      id="registro-confirm-password-error"
                      className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {confirmPasswordError}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="mt-0.5 h-12 w-full rounded-full text-[15px]"
                  disabled={anyLoading}
                >
                  {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {pending ? "Creando cuenta…" : "Crear cuenta"}
                </Button>
              </form>

              <div className="text-muted-foreground mt-6 flex items-center gap-1.5 text-[11.5px]">
                <Lock className="size-3.5" aria-hidden />
                Conexión segura
              </div>

              <p className="text-muted-foreground mt-4 text-center text-[13px]">
                ¿Ya tenés cuenta?{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
                  Iniciá sesión
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
