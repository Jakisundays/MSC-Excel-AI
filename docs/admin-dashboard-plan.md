# Plan de rediseño → Admin Dashboard — MSC Excel AI

> Estado: **PLAN. Sin implementar.** Para revisión antes de tocar código.
> Construye sobre los hallazgos de [`design-audit-plan.md`](./design-audit-plan.md) (tipografía, contraste, interacción, a11y) y los reencuadra en una estructura de **admin dashboard**.
> Lentes: **Taste Skill**, **Impeccable** (register *producto*), **Emil Kowalski** (motion).

## Nueva dirección

> *Reading this as: **admin dashboard** para un equipo interno — shell persistente (sidebar + topbar), datos con jerarquía, densidad media. Lenguaje sobrio tipo **Linear / Vercel / Stripe dashboard**, tema claro y oscuro (toggle).*

Cambia el **chrome** (la estructura que envuelve todo), no la marca: seguimos sobrios, sin gradientes/glows. Dials objetivo: **Variance 3 · Motion 4 · Density 5** (un punto más denso que la versión actual airy; un dashboard muestra estado de un vistazo).

> Nota de register: Taste Skill marca "dashboards" como fuera de su scope, **pero lista shadcn/ui como opción válida** ("SaaS moderno donde sos dueño de los componentes"). De Taste/Impeccable aplicamos lo transversal: anti-slop, contraste, estados, motion.

## Stack — shadcn/ui (tematizado)

> Regla de oro de Taste Skill: **nunca shippear shadcn en su estado default.** Lo tematizamos a la marca (paleta sobria, Geist, radius contenido).

- **Setup**: `npx shadcn@latest init` (compatible con Tailwind v4 + React 19). Genera `components.json`, tokens CSS en `globals.css` y `lib/utils.ts` (`cn`).
- **Componentes a agregar**: `sidebar`, `card`, `table`, `button`, `badge`, `input`, `select`, `dropdown-menu`, `avatar`, `separator`, `sheet` (drawer mobile), `skeleton`, `sonner` (toasts), `tabs`, `label`, `tooltip`.
- **Bloque base**: parto del bloque `sidebar-07` / `dashboard-01` de shadcn → sidebar colapsable + comportamiento mobile con `sheet` **ya resuelto y accesible (Radix)**. Entrega el shell + drawer responsive de entrada.
- **Tema claro/oscuro (toggle)**: `next-themes` + `ThemeProvider` + `ModeToggle` (dropdown sol/luna) — el patrón oficial de dark mode de shadcn. Mapea exacto a tu elección "ambos (toggle)".
- **Tematización**: sobreescribo las CSS vars de shadcn con la paleta sobria (primario casi-negro, accent azul reservado a focus/links, off-white), **Geist** como `--font-sans` + **Geist Mono** para datos, radius 8px inputs / 12px cards. Iconos **lucide** (los que ya trae shadcn) para no mezclar familias.

---

## Cambio estructural #1 — App Shell (sidebar + topbar)

Hoy cada página es contenido suelto bajo una top-nav. Un dashboard necesita un **shell persistente**.

### Desktop (≥ lg)
```
┌───────────────┬──────────────────────────────────────────────────┐
│  ▣ MSC Excel  │  Resumen                        [ + Nueva solicitud ]│ ← topbar (título + acción)
│               ├──────────────────────────────────────────────────┤
│  ◳ Resumen    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  ⬆ Nueva      │  │  124    │ │   8     │ │   2     │ │  hoy    │  │ ← fila de KPIs
│  ▤ Historial  │  │ Total   │ │ Mes     │ │ Fallidas│ │ Última  │  │
│               │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│               │                                                    │
│               │  Actividad reciente                   Ver todo →   │
│               │  ┌──────────────────────────────────────────────┐ │
│               │  │  tabla compacta · últimas 5 solicitudes      │ │
│  ───────────  │  └──────────────────────────────────────────────┘ │
│  ◔ dev@…      │                                                    │
│    ⎋ Salir    │                                                    │
└───────────────┴──────────────────────────────────────────────────┘
```
- **Sidebar fija ~240px**: marca arriba; nav con iconos (Phosphor) + estado activo (pill de fondo); abajo, usuario (avatar + email) y Salir.
- **Topbar dentro del contenido**: título de página + acción primaria contextual (`+ Nueva solicitud`).
- **Contenido**: `max-w-[1100px]`, padding generoso, fondo off-white; tarjetas/tabla en blanco.

### Mobile (< lg)
```
┌──────────────────────────────┐
│ ☰  MSC Excel AI         ◔     │ ← topbar con hamburguesa + avatar
├──────────────────────────────┤
│  (contenido a ancho completo)│
└──────────────────────────────┘
   ☰ abre la sidebar como DRAWER (overlay con scrim, slide-in 250ms ease-out)
```
- Sidebar colapsa a **drawer** (Emil: `translateX(-100%→0)`, `cubic-bezier(0.32,0.72,0,1)`, scrim con fade; cierra al tocar fuera / Esc; respeta reduced-motion).

---

## Cambio estructural #2 — Rediseño por pantalla

### Resumen (ex "Dashboard") → dashboard de verdad
- **Fila de KPIs (4)**: Total enviadas · Este mes · Fallidas · Última solicitud. Números en **mono `tabular-nums`**, label chico, sin gradiente, tamaño contenido.
  > *Sobre el "hero-metric ban" de Impeccable:* ese ban es para **landings** (número gigante + gradiente decorativo). Acá son **KPIs reales** de un dashboard → patrón legítimo y esperado. Los mantengo sobrios (sin gradiente, sin glow, delta opcional minúsculo).
- **Actividad reciente**: tabla compacta de las últimas 5 solicitudes + link "Ver todo →" al Historial.
- **CTA primaria** `+ Nueva solicitud` en el topbar.

### Historial → tabla de datos con toolbar
- **Toolbar**: búsqueda por nombre de archivo + **filtro de estado** (chips: Todas / Enviada / Falló) + (futuro) rango de fechas.
- **Tabla densa**: hairlines por fila, **hover row highlight**, fecha + `request_id` en mono, badge de estado. Paginación / "Cargar más" cuando crezca.
- **Responsive (arregla el bug P0)**: bajo `sm`, cada fila se vuelve **card apilada** con estado visible; tabla a partir de `sm`.

### Nueva solicitud → form dentro del shell
- El form se queda enfocado, pero dentro del shell. Opcional: **panel de resumen sticky a la derecha** (archivos / hojas / reply-to + botón Enviar) en desktop; apilado en mobile. Desboxar las cajas anidadas (hairlines en vez de card-in-card).

### Login → fuera del shell
- Pantalla completa, centrada, **con marca/wordmark** y ritmo vertical ajustado (menos espacio muerto). Sin `border+shadow` en el botón (ghost-card). El shell (sidebar/topbar) **no** aparece en login.

---

## Fundaciones de calidad (de la auditoría, siguen vigentes)
Estas son la base sobre la que se construye el dashboard:
1. **Tipografía**: Geist Sans + **Geist Mono** (`tabular-nums` para todo dato numérico: KPIs, fechas, `request_id`). Escala deliberada, `text-wrap: balance` en títulos.
2. **Tokens / color**: ramp neutral en OKLCH, off-white de fondo, **primario casi-negro** (accent azul reservado a focus/links), `--muted` más oscuro (contraste WCAG AA).
3. **Interacción + motion + a11y** (tabla Emil de `design-audit-plan.md`): `:active scale(0.97)`, `--ease-out` custom, `focus-visible:ring`, `prefers-reduced-motion`, entrada del drawer/éxito con easing correcto.
4. **Iconos lucide** (los que trae shadcn) en nav y acciones — una sola familia.

---

## Componentes (sobre shadcn/ui)
**De shadcn directo** (tematizados): `sidebar`, `button`, `card`, `table`, `badge`, `input`, `select`, `dropdown-menu`, `avatar`, `separator`, `sheet`, `skeleton`, `sonner`, `tabs`, `tooltip`.
**Wrappers propios encima**: `AppSidebar` (del bloque sidebar) · `SiteHeader` (topbar: título + acción) · `StatCard` (KPI) · `DataTable` + `TableToolbar` + `StatusFilter` · `SubmissionCards` (vista mobile del historial) · `ModeToggle` (claro/oscuro) · `EmptyState`.

---

## Plan priorizado (reordenado para la dirección dashboard)

### 🔴 P0 — Shell + fundaciones (el esqueleto)
- **P0.1 Setup shadcn + App Shell**: `shadcn init` + bloque `sidebar-07` → `AppSidebar` + `SiteHeader` + contenido, con **drawer responsive** (`sheet`) en mobile y `next-themes` para el toggle claro/oscuro. Reemplaza la top-nav actual. *(El cambio que hace que "parezca dashboard".)*
- **P0.2 Tipografía**: Geist Sans + Mono, escala, `tabular-nums`.
- **P0.3 Interacción/a11y/reduced-motion + contraste** (de la auditoría).
- **P0.4 Historial responsive** (cards < `sm`) — arregla el bug del estado cortado.

### 🟠 P1 — Contenido del dashboard
- **P1.1 Resumen**: fila de KPIs + actividad reciente.
- **P1.2 Historial**: toolbar (búsqueda + filtro de estado) + tabla densa con hover.
- **P1.3 Tokens de color** (primario near-black, off-white, ramp) + **iconos Phosphor**.
- **P1.4 Nueva solicitud**: desboxar + panel de resumen sticky.

### 🟡 P2 — Finish
- Login con marca · empty states + skeletons (`skeleton` de shadcn) · favicon/metadata · pulido de motion (stagger de KPIs/filas).
  *(El dark mode ya entra en P0 vía `next-themes`, no queda para acá.)*

---

## Anti-slop (qué NO hacer)
- KPIs **sin** gradiente/glow ni número gigante (sobrios, datos reales).
- Sin animar la navegación del sidebar (se usa decenas de veces/día → Emil: sin animación o mínima).
- Sin card-in-card; sin side-stripe borders; sin border+shadow juntos; radios consistentes (cards 12px, inputs 8px, pills full).
- Tabla: sin `border-t`+`border-b` en cada fila (un solo hairline).

## Ejecución sugerida (3 PRs)
1. **PR1 — Shell + fundaciones (P0)**: AppShell/Sidebar/Topbar/Drawer + Geist + tokens/contraste + interacción/a11y + Historial responsive. Verifico en 3 viewports.
2. **PR2 — Contenido (P1)**: KPIs + actividad reciente + toolbar/filtros del Historial + near-black/iconos + form.
3. **PR3 — Finish (P2)**: login, empty/skeletons, favicon, dark mode opcional, motion.
