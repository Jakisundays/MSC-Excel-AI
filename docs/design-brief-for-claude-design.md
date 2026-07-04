# Brief para Claude Design — elevar la identidad visual de MSC Excel AI

> Copiá todo lo que sigue (desde "Sos un design engineer…") y pegáselo a Claude Design.

---

Sos un design engineer de altísimo nivel. Tu trabajo es **elevar la identidad visual** de una app que hoy se ve **demasiado genérica** (quedó en el look "shadcn por defecto"). El objetivo es que se sienta **premium, distintiva y memorable**, sin caer en decoración barata.

## 0. Antes de nada: cargá y usá estas skills (obligatorio)

Invocá con la herramienta Skill, en este orden, y aplicá sus principios en cada decisión:
1. `design-taste-frontend` (Taste Skill) — anti-slop, AI tells, disciplina de tipografía/color/layout.
2. `impeccable` — craft de producción, contraste, motion, "no shippear shadcn en estado default".
3. `emil-design-eng` — motion e interacción (curvas, timings, feedback, reduced-motion).

No empieces a diseñar hasta haberlas cargado. Si alguna pide un sub-comando o setup, seguilo.

## 1. Dónde está el proyecto y cómo correrlo

- Ruta (¡tiene espacios, citá siempre!): `/Users/jacobdominguez/Documents/dinardi/MSC Excel AI`
- Correr: `cd "/Users/jacobdominguez/Documents/dinardi/MSC Excel AI" && npm run dev` → **http://localhost:3100**
- Ya existe `.env.local` con `NEXT_PUBLIC_DEV_PREVIEW=true`: eso **falsea la sesión, simula la subida y muestra historial de ejemplo**, así que podés navegar TODAS las pantallas sin PocketBase ni Google. (Solo funciona en `next dev`, nunca en prod.)
- Verificá con `npx tsc --noEmit` y/o `npm run build`. Usá las herramientas de preview para screenshotear.

## 2. Qué es el producto (contexto)

Herramienta interna tipo **concierge** para un equipo (contexto seguros / C-Match / MSC). El usuario sube 2 archivos Excel, elige 1 hoja de cada uno y agrega emails; los archivos se envían por correo a un equipo que los procesa con Excel + IA. No es un SaaS público: es una **herramienta de datos para un equipo conocido**. Audiencia: analistas/operaciones. Idioma: español (es-AR).

Pantallas: **Login** (Google) · **Resumen** (dashboard con KPIs + actividad reciente) · **Nueva solicitud** (form de subida con dropzones + selección de hoja + emails) · **Historial** (tabla/cards de solicitudes con estado).

## 3. Stack y dónde vive cada cosa

- **Next.js 15.5** (App Router, RSC) · **React 19** · **Tailwind v4** (tokens en `@theme` / `@theme inline` dentro de `app/globals.css`, sin `tailwind.config`).
- **shadcn/ui** (estilo `radix-nova`, primitives de Radix) en `components/ui/`. **lucide-react** para iconos.
- **next-themes** (light/dark/system; clase en `<html>`). **Geist + Geist Mono** vía `next/font` en `app/layout.tsx`.
- **Design tokens** en OKLCH en `:root` y `.dark` de `app/globals.css` (hoy: primario casi-negro, accent azul solo en focus ring, neutros con tinte frío sutil, radius 0.5rem). Acá es donde se cambia la paleta/identidad de raíz.
- **Componentes propios**: `app-sidebar`, `site-header`, `command-menu` (⌘K), `stat-card`, `submissions-table`, `status-badge`, `empty-state`, `mode-toggle`, `theme-provider`, `NewRequestForm`, `historial-view`.
- **Shell**: `app/(app)/layout.tsx` (SidebarProvider + AppSidebar + SiteHeader). Login fuera del shell en `app/login`.
- **Contexto extra**: `docs/admin-dashboard-plan.md`, `docs/design-audit-plan.md`.

## 4. El problema y el objetivo

**Problema:** se ve genérico — neutros grises, primario negro, Geist, tabla y cards shadcn estándar. Lee como "starter de shadcn", sin punto de vista.

**Objetivo:** que NADIE pueda decir "esto es un template de shadcn". Que tenga **identidad propia, premium y coherente**, manteniéndose **sobrio** (la marca es estilo Linear / Stripe / Mercury / Ramp).

**Regla crítica (no la rompas):** la diferenciación viene de **tipografía, color, densidad/craft de datos, micro-detalle y motion** — **NO** de gradientes, glows, glassmorphism decorativo, ni heroes recargados. Nada de AI-slop. La preferencia de marca del dueño es sobria/premium: subí el nivel de *craft e identidad*, no de ruido.

## 5. Dónde está la genericidad (anclas para empujar — pero proponé TU punto de vista)

Primero hacé una auditoría y declará en 1 línea tu dirección de diseño. Después empujá donde más rinda:
- **Marca/identidad:** hoy hay solo un cuadradito genérico. Diseñá un mark + wordmark/lockup propio y un detalle de marca recurrente (sutil).
- **Tipografía con carácter:** jerarquía más expresiva y deliberada; números **tabulares mono** como firma de "herramienta de datos"; microtipografía (tracking, pesos, tamaños) precisa. Si sumás un display, que sea justificable y sobrio.
- **Color:** un acento propio y **memorable** (no el azul default), usado con disciplina; neutros con temperatura intencional; estados success/danger afinados. Una sola familia de acento en todo.
- **Craft de datos:** que los KPIs y la tabla/cards se sientan "producto de datos serio" (alineación tabular, hairlines/zebra sutil, hovers, formato de fechas/números), no la tabla shadcn default.
- **Momentos de marca:** login, empty states, panel de éxito y el ⌘K — que tengan personalidad y se sientan cuidados.
- **Shell con carácter:** sidebar y header que no sean el layout shadcn tal cual.
- **Motion (Emil):** una firma de movimiento coherente (curvas/timings propios), sutil y motivada — no animar por animar.

## 6. Qué preservar (no romper)

- **No toques la lógica/arquitectura:** `lib/*` (auth, ticket JWT, excel/SheetJS, submissions, preview, validators, pocketbase), `app/api/*`, `middleware.ts`. El navegador sube los archivos **directo al orchestrator con un ticket** — ese flujo no se rompe.
- **Mantené `NEXT_PUBLIC_DEV_PREVIEW`** funcionando (sesión falseada + mocks + subida simulada).
- **Ambos temas** (light y dark) impecables y **a paridad**. Respetá la clase de `next-themes`.
- **Accesibilidad:** WCAG AA (texto ≥ 4.5:1), `focus-visible`, y `prefers-reduced-motion` (ya hay un override global en `globals.css` — mantenelo).
- **Seguí usando shadcn**, pero **re-tematizado con identidad** (no estado default). Una sola familia de iconos (lucide).
- **Sin em-dashes (—)** en ningún texto visible. Español es-AR, voz consistente.
- No reintroduzcas gradientes/glows/glassmorphism como decoración por defecto.

## 7. Proceso y entregables

1. **Auditá** el estado actual en los 3 viewports y ambos temas (corré la app en :3100).
2. **Declará tu dirección de diseño en 1 línea** y un set de decisiones de identidad (tipografía, paleta OKLCH, radios, motion).
3. **Implementá** re-tematizando tokens en `globals.css` + ajustando componentes; creá los componentes de marca que hagan falta.
4. **Verificá** con preview en **light y dark × mobile/tablet/desktop**, y dejá **screenshots** como prueba. Mantené `tsc`/build en verde.

## 8. Definición de "listo"

- Imposible confundirlo con un starter de shadcn: tiene un **punto de vista** claro.
- Sigue **sobrio y premium** (no ruidoso), coherente en cada pantalla.
- **Light y dark** impecables; cero AI tells; cero em-dashes; AA en todo.
- La lógica de auth/subida/preview sigue intacta y el build pasa.

Trabajá con calidad sobre velocidad, tomá las decisiones de diseño vos (no me pares a validar cada cambio) y cuidá el detalle hasta el último píxel.
