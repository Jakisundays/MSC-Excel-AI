/**
 * Ancho angosto (formularios de una columna): Perfil, Seguridad, Cuenta,
 * Privacidad. Un grupo de rutas aparte (sin afectar la URL) para que
 * /perfil/planes pueda usar un contenedor más ancho sin duplicar el shell
 * de sidebar/mobile-nav de app/perfil/layout.tsx.
 */
export default function NarrowSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {children}
    </div>
  );
}
