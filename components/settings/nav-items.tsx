import { Bell, CircleUserRound, CreditCard, Lock, Rows3, ShieldCheck } from "lucide-react";

export const SETTINGS_NAV = [
  { href: "/perfil", label: "Perfil", icon: CircleUserRound },
  { href: "/perfil/seguridad", label: "Seguridad", icon: ShieldCheck },
  { href: "/perfil/cuenta", label: "Cuenta", icon: Rows3 },
  { href: "/perfil/planes", label: "Planes", icon: CreditCard },
  { href: "/perfil/privacidad", label: "Privacidad", icon: Lock },
  { href: "/perfil/notificaciones", label: "Notificaciones", icon: Bell },
] as const;
