/**
 * Modo preview de desarrollo: permite navegar toda la app sin PocketBase
 * ni Google OAuth. Se activa SOLO con `next dev` (NODE_ENV !== production),
 * aunque la env esté seteada, para que nunca bypassee auth en producción.
 *
 * Importable desde servidor y cliente (solo referencia NEXT_PUBLIC + NODE_ENV).
 */
export const DEV_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "true" &&
  process.env.NODE_ENV !== "production";

export const FAKE_USER = {
  id: "dev-user",
  email: "dev@local.test",
  name: "Dev",
};
