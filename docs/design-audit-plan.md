# Auditoría de diseño + plan de mejora — MSC Excel AI

> Estado: **AUDITORÍA + PLAN. Sin implementar.** Para revisión antes de tocar código.
> Lentes aplicadas: **Taste Skill** (anti-slop / AI tells), **Impeccable** (craft de producción), **Emil Kowalski** (motion & interacción).
> Verificado en vivo en mobile (375), tablet (768) y desktop sobre las 4 pantallas (login, dashboard, nueva-solicitud, historial).

## Lectura de diseño (design read)

> *Reading this as: **app UI / herramienta interna** (no landing) para un equipo conocido, con lenguaje **sobrio tipo Linear/Stripe**, register de **producto** (el diseño SIRVE a la tarea, no es el producto).*

Por eso el objetivo no es "más wow", sino **densidad de calidad**: tipografía deliberada, jerarquía clara, feedback táctil, y cero detalles a medio terminar. Dials objetivo: **Variance 4 · Motion 4 · Density 4** (restraint, no estático). El register de producto de Impeccable manda: nada de héroes, gradientes ni decoración; la elegancia viene de los detalles invisibles que compounden (Emil).

## Lo que YA está bien (no tocar)
- **Un solo accent** usado consistentemente (Color Consistency Lock ✓).
- **Pasos numerados** (1. Archivos / 2. Emails) — Impeccable los permite porque es **una secuencia real**, no scaffolding decorativo.
- **Estados de error inline** (caja roja) y el badge de "Modo demo".
- **Sin AI tells**: no hay gradient text, ni eyebrows en cada sección, ni em-dashes, ni datos "Jane Doe" en pantallas reales.
- Micro-interacción de la flecha en las cards del dashboard.

---

## Hallazgos por categoría

Severidad: 🔴 P0 (defecto / alto impacto) · 🟠 P1 (premium real) · 🟡 P2 (identidad / finish).

### 1. Tipografía — 🔴 el mayor lift por unidad de riesgo
- **`system-ui` como fuente única** (`app/globals.css`). Lee como "default sin estilar". Impeccable: typography refresh = mayor lift visual con menor riesgo.
- **Sin tipografía mono para datos**: fechas, contadores y `request_id` van en sans → no alinean y pierden el aire de "herramienta".
- Jerarquía floja: casi todo es `text-sm`/`text-xl`; falta una escala deliberada.
- Falta `text-wrap: balance` en titulares.

### 2. Color y contraste — 🔴 legibilidad + 🟠 premium
- **`--muted: #6b7280` (gray-500) sobre `--surface #fafafa`** queda en el borde de WCAG AA en textos chicos (captions, "N hojas disponibles", fechas). Impeccable lo marca como **el fallo #1**: gris claro "por elegancia" sobre near-white tintado.
- **Accent `#2563eb`**: es casi el "azul default de AI". Para leer Linear/Stripe conviene **primario casi-negro** y reservar el azul para focus/links (ver P1).
- Fondo **`#ffffff` puro** y texto **casi-negro**: Impeccable sugiere off-white para dar profundidad.

### 3. Layout y espaciado — 🟠
- **Boxiness / card-in-card**: las secciones son cards (`border + bg-white`) y dentro viven más cajas (dropzones, resumen). Impeccable: "las cards son la respuesta perezosa". Se puede agrupar con whitespace + hairlines.
- Ritmo vertical uniforme (`mt-4` / `p-5` en todo). Falta variación para jerarquizar.

### 4. Componentes y consistencia — 🟠
- **`×` como carácter crudo** para quitar emails/archivos. Taste Skill: no hand-roll glyphs → usar set de iconos (Phosphor).
- **Sin iconos** en general: el dropzone es solo texto ("Arrastrá o hacé clic"); falta icono de upload/archivo, check de éxito, etc.
- **Botón de Google (login): `border` + `shadow-sm`** = el patrón "ghost-card" que Impeccable prohíbe (elegir uno, no ambos).
- Radios mixtos (lg 8px inputs / xl 12px cards / full pills): aceptable como sistema documentado, pero hay que **declararlo y respetarlo**.

### 5. Animaciones e interacciones — 🔴 (Emil) el mejor craft-por-línea
- **Ningún botón tiene `:active`** → la UI se siente "muerta", no responde al click.
- **Easing default** (`transition` = ease) en todos los hover. Emil: las curvas built-in son flojas; usar `cubic-bezier(0.23,1,0.32,1)`.
- **`transition: all`** implícito en varias clases (debería nombrar la propiedad).
- El **estado de éxito aparece de golpe** (sin entrada); el swap **dropzone→file-card** es un corte seco.
- **Sin `prefers-reduced-motion`** en ningún lado → obligatorio en las 3 skills.

### 6. Responsive — 🔴 bug real
- **Tabla de Historial se corta en mobile (375px)**: solo se ven *Fecha* y *Archivos*; ***Hojas* y *Estado* quedan fuera de pantalla**. El estado (enviada/falló) es la info más importante y es invisible en mobile. Verificado en vivo.
- **Nav** apretado en ≤375px (logo + 2 links + Salir en una línea); riesgo de overflow en pantallas de 360px.

### 7. Accesibilidad — 🔴 / 🟠
- **Sin `focus-visible`** en botones/links/cards → navegación por teclado sin indicador (solo inputs tienen `focus:border`).
- Contraste de `--muted` (ver §2).
- El `<select>` de hoja tiene un `<div>` como label, no un `<label htmlFor>` asociado.

### 8. Estados (loading / empty / success) — 🟠
- **Empty del historial** = una línea de texto. Merece icono + guía + CTA a "Nueva solicitud".
- **Sin skeletons** en dashboard/historial (server components). Para una herramienta interna es menor, pero suma.
- Success: funciona, pero entra sin animación (ver §5).

### 9. Calidad visual general / identidad — 🟡
- **Login genérico**: mucho espacio muerto vertical, **sin marca/wordmark**, poco interés visual.
- **Sin favicon / metadata de marca**.

---

## Plan priorizado (con razonamiento)

Orden = impacto × (1/riesgo). Sigue los "modernisation levers" de Impeccable: **tipografía → espaciado → color → motion → secciones**.

### 🔴 P0 — Defectos + máximo lift (hacer primero)

**P0.1 — Sistema tipográfico (Geist Sans + Geist Mono vía `next/font`).**
Mono con `tabular-nums` para fechas/contadores/`request_id`. Escala deliberada + `text-wrap: balance` en títulos.
*Por qué:* lift visual #1 con riesgo mínimo; pasa de "sin estilar" a premium-sobrio de un golpe. Geist es lo más cercano libre al look Linear que pide la marca.

**P0.2 — Arreglar la tabla del Historial en mobile.**
Bajo `sm`: lista de cards apiladas (fecha + archivos + hojas + **badge de estado**); tabla a partir de `sm`.
*Por qué:* no es estética, es un **bug de usabilidad** — el estado, que es el sentido del historial, no se ve en mobile.

**P0.3 — Feedback de interacción + a11y de foco + reduced-motion (Emil core).**
`:active { scale(0.97) }` en todo pressable; token `--ease-out: cubic-bezier(0.23,1,0.32,1)`; transiciones por propiedad (no `all`); `focus-visible:ring`; bloque `@media (prefers-reduced-motion: reduce)`.
*Por qué:* el craft más barato y de mayor retorno; además foco visible + reduced-motion son requisitos de accesibilidad (obligatorios en las 3 skills).

**P0.4 — Pasada de contraste.**
Oscurecer `--muted` (a ~zinc-600 `#52525b`) para body/captions; verificar todo ≥4.5:1.
*Por qué:* el fallo de legibilidad #1 de Impeccable; es a11y, no gusto.

### 🟠 P1 — Polish premium

**P1.1 — Primario casi-negro + accent azul para focus/links; ramp en OKLCH; off-white de fondo.**
Arregla de paso el ghost-card del botón de Google.
*Por qué:* el botón azul plano es "el look default"; primario casi-negro + azul de acento lee Linear/Stripe.

**P1.2 — Iconografía (Phosphor).** Upload/archivo en dropzone, check en éxito, `X` real en tags/clear, arrow.
*Por qué:* dropzone solo-texto y `×` crudo se ven sin terminar; una familia consistente eleva (y respeta "no hand-roll glyphs").

**P1.3 — Desboxear el form + ritmo de espaciado.** Hairlines/whitespace en vez de cajas anidadas; más aire entre grupos.
*Por qué:* "cards = respuesta perezosa"; el aire es lo que se siente premium.

**P1.4 — Capa de motion motivada (toda con reduced-motion).**
Stagger sutil (30–80ms) al entrar dashboard/secciones; éxito entra con fade+translate; swap dropzone→file-card con `blur(2px)` de máscara; transición de tags al agregar/quitar.
*Por qué:* Emil — son vistas ocasionales/primera-vez, ahí el delight es apropiado; el motion debe estar **motivado** (feedback / state change), no decorativo.

### 🟡 P2 — Identidad y finish
**P2.1** Rediseño del login: wordmark/marca, ritmo vertical más ajustado, sin ghost-card. **P2.2** Empty state del historial (icono + guía + CTA) y skeletons. **P2.3** Favicon + metadata. **P2.4** Nav robusto en ≤360px. **P2.5** (opcional) Dark mode con tokens duales.

---

## Tabla Before / After de motion & interacción (formato Emil)

| Before | After | Why |
| --- | --- | --- |
| Botones sin estado `:active` | `transform: scale(0.97)` en `:active`, 160ms ease-out | Feedback táctil; el botón "escucha" al usuario |
| `transition` (ease default) en hovers | `transition: <prop> 200ms var(--ease-out)` con `cubic-bezier(0.23,1,0.32,1)` | Las curvas built-in son flojas; nombrar la propiedad, no `all` |
| Sin `prefers-reduced-motion` | fallback (crossfade/instant) para toda animación de transform | A11y obligatoria; evita mareo |
| Solo `focus:border-accent` en inputs | `focus-visible:ring-2 ring-[--accent]/40` en botones/links/cards | Foco visible para teclado (a11y) |
| Caja de éxito aparece de golpe | entra con `opacity 0→1` + `translateY(6px→0)`, 240ms ease-out (`@starting-style`) | Nada aparece de la nada; suaviza el cambio de estado |
| Swap dropzone→file-card seco | crossfade con `filter: blur(2px)` de máscara | El blur fusiona los dos estados en una transición (Emil) |
| `×` (carácter crudo) para quitar | icono Phosphor `X` 16px | No hand-roll glyphs; más nítido |
| Tabla cortada en mobile | cards apiladas < `sm`, tabla ≥ `sm` | El contenido viewport-aware es parte del diseño |

---

## Lo que NO voy a hacer (para no caer en slop)
- Sin gradientes, glows, glassmorphism ni hero-metrics (bans de las 3 skills y de la preferencia de marca).
- Sin animar en cada card ni en acciones frecuentes (Emil: lo que se ve 100×/día no se anima).
- Sin eyebrows decorativos ni `01/02/03` extra (los pasos actuales se quedan porque son secuencia real).

## Sugerencia de ejecución
Implementar en **2 PRs**: (1) **P0** (tipografía + bug tabla + interacción/a11y + contraste) — alto impacto, bajo riesgo; (2) **P1** (color/iconos/desboxeo/motion). P2 queda como pulido final. Verifico cada uno en los 3 viewports con el preview.
