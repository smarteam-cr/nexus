/**
 * lib/ui/token-vocab.test.ts — RATCHET DE TOKENS SEMÁNTICOS (invariante #5 de CLAUDE.md).
 *
 * Historia: la regla ESLint anti-gris-crudo estuvo MUERTA semanas por una colisión de
 * flat config (dos guards definían `no-restricted-syntax`; el segundo pisaba al primero
 * en todo .tsx — ver el comentario en eslint.config.mjs). En ese silencio entraron ~2.4k
 * grises crudos. La regla volvió como warn (guía del editor), pero lo que FRENA el merge
 * es esto: un conteo por archivo que SOLO puede bajar.
 *
 * Semántica (mismo espíritu que la DEUDA de skeleton-vocab.test.ts):
 *   - archivo con MÁS matches que su entrada (o nuevo con >0) → falla: tokenizá.
 *   - archivo con MENOS matches (o limpio/borrado)            → falla: actualizá/borrá
 *     la entrada — el mensaje imprime la línea lista para pegar. La lista solo encoge.
 *
 * El conteo es sobre TODO el fuente (no solo className): cubre también las variantes
 * cva() fuera de JSX y los template literals que el guard de ESLint no ve. Un gris en
 * un comentario también cuenta — sacarlo cuesta menos que darle al ratchet un parser.
 * El patrón vive en lib/ui/raw-neutral.mjs (compartido con el guard: no pueden divergir);
 * `bg-black/NN` (scrim sancionado) NO cuenta.
 *
 * Clave de mapeo gris→token (es el remap `html.light` de globals.css, que ya define la
 * equivalencia que la app renderiza hoy): bg-gray-900/950→bg-surface ·
 * bg-gray-800→bg-surface-hover · border-gray-600/700/800→border-line · text-white→text-fg ·
 * text-gray-200/300→text-fg-secondary · text-gray-400/500/600→text-fg-muted · sólidos con
 * texto blanco→pares bg-primary/bg-destructive con su *-fg.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, EXENTOS_TOKENS, archivosUi } from "./scan-source";
import { RAW_NEUTRAL_RE } from "./raw-neutral.mjs";

/** Matches por línea (el `$` del patrón es fin de línea, no de archivo). */
function contarGrises(rel: string): number {
  const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  let n = 0;
  for (const linea of src.split("\n")) {
    const re = new RegExp(RAW_NEUTRAL_RE, "g");
    while (re.exec(linea) !== null) n++;
  }
  return n;
}

/**
 * DEUDA CONOCIDA — censo inicial (2026-07-19): 125 archivos, 2.460 grises crudos.
 * Generado con el propio contarGrises; regenerar una entrada = correr este test y
 * pegar la línea que imprime el fallo. Cuando un módulo llega a 0, su entrada se borra.
 */
const DEUDA_TOKENS: Record<string, number> = {

  "app/(shell)/agents/AgentsClient.tsx": 4,
  "app/(shell)/audits/[id]/AuditDetailClient.tsx": 11,
  "app/(shell)/audits/[id]/CompanyFunnelWidget.tsx": 22,
  "app/(shell)/audits/[id]/ContactFunnelWidget.tsx": 22,
  "app/(shell)/audits/[id]/GenerateInsightsButton.tsx": 1,
  "app/(shell)/audits/[id]/LifecycleReport.tsx": 39,
  "app/(shell)/audits/[id]/OwnerAssignmentWidget.tsx": 28,
  "app/(shell)/audits/AuditsTable.tsx": 3,
  "app/(shell)/clients/[id]/error.tsx": 1,
  "app/(shell)/clients/[id]/layout.tsx": 19,
  "app/(shell)/clients/[id]/projects/[projectId]/stage/[stageNum]/page.tsx": 11,
  "app/(shell)/clients/[id]/projects/[projectId]/StageTabs.tsx": 7,
  "app/(shell)/clients/[id]/ProjectsClient.tsx": 26,
  "app/(shell)/clients/[id]/settings/page.tsx": 42,
  "app/(shell)/clients/[id]/stage/[stageNum]/NewAuditButtonClient.tsx": 7,
  "app/(shell)/clients/[id]/StageTabs.tsx": 7,
  // WorkspaceClient salió de la deuda: el rail de proyectos pintaba la pestaña ACTIVA con
  // `text-white`, o sea texto blanco sobre fondo blanco en modo claro. El síntoma no era
  // "se ve feo" sino "el cliente parece tener un solo proyecto" — se descubrió probando el
  // alta, cuando tres proyectos nuevos no aparecían por ningún lado.
  // ClientsGrid salió de la deuda con la barra de filtros: sus 14 grises eran las dos filas
  // de pestañas escritas a mano (ahora <Tabs>, que además trae role="tab" y teclado) y los
  // "—" de las celdas vacías. De paso cayó un `text-emerald-400` que ninguna de las dos
  // guardas cazaba.
  "app/(shell)/clients/DeleteClientButton.tsx": 1,
  "app/(shell)/clients/NewClientButton.tsx": 3,
  "app/(shell)/clients/page.tsx": 1,
  "app/(shell)/error.tsx": 1,
  "app/(shell)/integrations/GoogleMeetCard.tsx": 29,
  "app/(shell)/integrations/HubspotSystemCard.tsx": 21,
  "app/(shell)/knowledge/KnowledgeClient.tsx": 47,
  "app/(shell)/marketing/contenido/ContentClient.tsx": 6,
  "app/(shell)/marketing/fuentes/SourcesClient.tsx": 2,
  "app/(shell)/marketing/ideas-de-campana/CampaignsClient.tsx": 1,
  "app/(shell)/marketing/personas/PersonasClient.tsx": 2,
  "app/(shell)/marketing/temas/TemasClient.tsx": 3,
  "app/(shell)/marketing/voz/VoiceClient.tsx": 1,
  "app/(shell)/sales/SalesClient.tsx": 58,
  "app/(shell)/sales/use-cases/UseCasesAdminClient.tsx": 1,
  "app/(shell)/sessions/[id]/SessionView.tsx": 49,
  "app/(shell)/sessions/AnalysisPanel.tsx": 72,
  "app/(shell)/sessions/categories/CategoriesClient.tsx": 51,
  "app/(shell)/sessions/SessionsClient.tsx": 164,
  "app/(shell)/settings/page.tsx": 19,
  "app/(shell)/team/page.tsx": 2,
  "app/LoginForm.tsx": 5,
  "app/portal/page.tsx": 22,
  "app/portal/PortalTabs.tsx": 236,
  "app/portal/RefreshButton.tsx": 6,
  "app/portal/SwitchAccountButton.tsx": 2,
  "components/business-cases/BusinessCaseStepper.tsx": 4,
  "components/business-cases/BusinessCaseWorkspace.tsx": 1,
  "components/business-cases/ContextCard.tsx": 2,
  "components/canvas/AnchorDatePicker.tsx": 10,
  "components/canvas/BlockRenderer.tsx": 77,
  "components/canvas/CanvasLinearView.tsx": 11,
  "components/canvas/CronogramaCanvas.tsx": 32,
  "components/canvas/ParticularidadEditModal.tsx": 12,
  "components/canvas/ParticularidadToTaskModal.tsx": 7,
  "components/canvas/SectionBlockList.tsx": 13,
  "components/canvas/TaskDetailDrawer.tsx": 24,
  "components/canvas/TimelineAssistDialog.tsx": 1,
  "components/charts/EChartRenderer.tsx": 4,
  "components/clients/ActionItemsDialog.tsx": 2,
  "components/clients/CanvasBoundary.tsx": 1,
  "components/clients/CanvasToggleButtons.tsx": 5,
  "components/clients/ClientContextCards.tsx": 108,
  "components/clients/ClientDocuments.tsx": 31,
  "components/clients/ClientInfoPanel.tsx": 12,
  "components/clients/ClientSharing.tsx": 28,
  "components/clients/CronogramaProgressButton.tsx": 1,
  "components/clients/DocumentUpload.tsx": 23,
  "components/clients/ExternalAccessPanel.tsx": 3,
  "components/clients/MinuteDialog.tsx": 44,
  "components/clients/ProjectCanvasPanel.tsx": 45,
  "components/clients/ProjectContextSection.tsx": 1,
  "components/clients/ProjectHandoffSection.tsx": 2,
  "components/clients/ProjectSessionsReview.tsx": 1,
  "components/clients/SectionDiscoveryModal.tsx": 37,
  "components/clients/SendToCanvasMenu.tsx": 27,
  "components/clients/SessionHistoryDrawer.tsx": 17,
  "components/clients/StageNoteEditor.tsx": 7,
  "components/clients/StageOverlay.tsx": 7,
  "components/clients/StepSections.tsx": 20,
  "components/clients/SubstepAgentButton.tsx": 2,
  "components/cs/account/AccountBriefSection.tsx": 1,
  "components/dashboard/PortfolioGrid.tsx": 2,
  "components/flowchart/FlowchartViewer.tsx": 59,
  "components/flowchart/nodes.tsx": 9,
  "components/flowchart/pipeline-nodes.tsx": 11,
  "components/handoffs/HandoffStepper.tsx": 1,
  // 12 → 1 al retirar "Clientes recientes" (2026-07-24): la sección concentraba
  // 11 de los grises del rail (los ítems de cliente y el separador).
  "components/layout/Sidebar.tsx": 1,
  "components/marketing/ICPView.tsx": 51,
  "components/notifications/NotificationsInit.tsx": 1,
  "components/team/TeamManager.tsx": 1,
  // components/ui/* llegó a 0 en la ola A1 (2026-07-19) — las primitivas son la referencia.
};

/**
 * DEUDA_ALERTS — errores rojos AD-HOC (segunda familia, nace con <Alert> en la ola A2).
 *
 * El mismo error se mostraba como toast en una pantalla, como <p class="text-red-400">
 * en otra y como caja border-red-500/20 en una tercera. El vocabulario es: transitorio →
 * toast.error; persistente → <Alert variant="danger">; error de un campo → el prop
 * `error` de <Field>. Heurística deliberadamente simple (estilo T1 de skeleton-vocab):
 * línea con `text-red-[0-9]` que además menciona "error". components/ui está exento
 * (Alert/Field/Toast SON la alternativa). Censo inicial: 23 archivos, 30 líneas.
 */
const DEUDA_ALERTS: Record<string, number> = {
  "app/(shell)/audits/[id]/GenerateInsightsButton.tsx": 1,
  "app/(shell)/clients/[id]/settings/page.tsx": 2,
  "app/(shell)/clients/[id]/stage/[stageNum]/NewAuditButtonClient.tsx": 1,
  "app/(shell)/clients/NewClientButton.tsx": 1,
  "app/(shell)/integrations/GoogleMeetCard.tsx": 2,
  "app/(shell)/integrations/HubspotSystemCard.tsx": 1,
  "app/(shell)/knowledge/KnowledgeClient.tsx": 1,
  "app/(shell)/marketing/fuentes/SourcesClient.tsx": 1,
  "app/(shell)/marketing/generacion/EngineClient.tsx": 3,
  "app/(shell)/sessions/AnalysisPanel.tsx": 1,
  "components/canvas/BlockRenderer.tsx": 2,
  "components/canvas/CanvasLinearView.tsx": 1,
  "components/canvas/CronogramaCanvas.tsx": 2,
  "components/clients/ClientContextCards.tsx": 1,
  "components/clients/ClientDocuments.tsx": 1,
  "components/clients/DocumentUpload.tsx": 1,
  "components/clients/ExternalAccessPanel.tsx": 1,
  "components/clients/ProjectHandoffSection.tsx": 1,
  "components/clients/StageNoteEditor.tsx": 1,
  "components/handoffs/HandoffStepper.tsx": 2,
};

describe("Ratchet de alerts: el error rojo ad-hoc solo ENCOGE", () => {
  it("ningún archivo suma errores rojos a mano; los migrados a Alert/Field salen", () => {
    const norm = (s: string) => s.split(/[\\/]/).join("/");
    const actual = new Map<string, number>();
    for (const rel of archivosUi(EXENTOS_TOKENS)) {
      if (norm(rel).startsWith("components/ui/")) continue; // el vocabulario mismo
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      let n = 0;
      for (const linea of src.split("\n")) {
        if (/text-red-[0-9]/.test(linea) && /error/i.test(linea)) n++;
      }
      if (n > 0) actual.set(norm(rel), n);
    }

    const subieron: string[] = [];
    const paraActualizar: string[] = [];
    for (const [archivo, n] of actual) {
      const deuda = DEUDA_ALERTS[archivo] ?? 0;
      if (n > deuda) subieron.push(`  ${archivo}: ${n} (deuda registrada: ${deuda})`);
      else if (n < deuda) paraActualizar.push(`  "${archivo}": ${n},`);
    }
    const paraBorrar = Object.keys(DEUDA_ALERTS).filter((f) => !actual.has(f));

    expect(
      subieron,
      `Error rojo AD-HOC nuevo. El vocabulario: transitorio → toast.error; persistente → ` +
        `<Alert variant="danger">; error de campo → prop error de <Field>:\n${subieron.join("\n")}`,
    ).toEqual([]);
    expect(
      [...paraActualizar, ...paraBorrar.map((f) => `  (borrar la entrada) "${f}"`)],
      `La deuda solo encoge: actualizá DEUDA_ALERTS:\n${[...paraActualizar, ...paraBorrar].join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * DEUDA_TABBARS — tab-bars A MANO (tercera familia, nace con <Tabs> en la ola A3).
 *
 * Había ~13 tab-bars artesanales con CERO role="tab" en toda la app y 4 convenciones
 * de color activo. La primitiva es components/ui/Tabs.tsx (modo estado y modo
 * navegación, accesible, variantes espejo de SkeletonTabs). Heurística: líneas con
 * `border-b-2` (la firma del subrayado a mano) fuera de components/ui. Pilotos ya
 * migrados: KnowledgeClient y MarketingSectionTabs. ⚠ WorkspaceClient y el área del
 * canvas se migran en pasada coordinada con la otra PC.
 */
const DEUDA_TABBARS: Record<string, number> = {
  "app/(shell)/clients/[id]/StageTabs.tsx": 1,
  "app/(shell)/clients/[id]/WorkspaceClient.tsx": 3,
  "app/(shell)/clients/[id]/projects/[projectId]/StageTabs.tsx": 1,
  "app/(shell)/sessions/SessionsClient.tsx": 2,
  "app/(shell)/sessions/[id]/SessionView.tsx": 1,
  "components/clients/ActionItemsDialog.tsx": 1,
  "components/clients/ClientContextCards.tsx": 3,
  "components/clients/ClientInfoPanel.tsx": 1,
  "components/clients/MinuteDialog.tsx": 1,
  "components/cobranza/CobranzaClient.tsx": 1,
};

/**
 * DEUDA_OVERLAYS — overlays `fixed inset-0` A MANO (cuarta familia, ola A7).
 *
 * Modal/Drawer/ConfirmDialog (components/ui) traen portal, Escape, lock de
 * scroll, focus-trap y role="dialog" gratis; un overlay a mano no trae nada de
 * eso. Los 7 diálogos de cobranza ya migraron; estos son los que faltan.
 * components/ui exento (las primitivas SON el overlay). ⚠ CronogramaCanvas y
 * TaskDetailDrawer/TimelineAssistDialog son área de la otra PC.
 */
const DEUDA_OVERLAYS: Record<string, number> = {
  "app/portal/PortalTabs.tsx": 1,
  "components/canvas/CronogramaCanvas.tsx": 1,
  "components/canvas/TaskDetailDrawer.tsx": 1,
  "components/canvas/TimelineAssistDialog.tsx": 1,
  "components/clients/ActionItemsDialog.tsx": 1,
  "components/clients/ClientContextCards.tsx": 1,
  "components/clients/ExternalAccessPanel.tsx": 1,
  "components/clients/MinuteDialog.tsx": 2,
  "components/clients/SectionDiscoveryModal.tsx": 2,
  "components/clients/SessionHistoryDrawer.tsx": 1,
  "components/clients/StageOverlay.tsx": 1,
  "components/dashboard/PortfolioGrid.tsx": 1,
  "components/flowchart/FlowchartViewer.tsx": 1,
};

describe("Ratchet de overlays: los fixed inset-0 a mano solo ENCOGEN", () => {
  it("ningún overlay nuevo a mano; los migrados a Modal/Drawer salen", () => {
    const norm = (s: string) => s.split(/[\\/]/).join("/");
    const actual = new Map<string, number>();
    for (const rel of archivosUi(EXENTOS_TOKENS)) {
      if (norm(rel).startsWith("components/ui/")) continue;
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      let n = 0;
      for (const linea of src.split("\n")) {
        if (linea.includes("fixed inset-0")) n++;
      }
      if (n > 0) actual.set(norm(rel), n);
    }

    const subieron: string[] = [];
    const paraActualizar: string[] = [];
    for (const [archivo, n] of actual) {
      const deuda = DEUDA_OVERLAYS[archivo] ?? 0;
      if (n > deuda) subieron.push(`  ${archivo}: ${n} (deuda registrada: ${deuda})`);
      else if (n < deuda) paraActualizar.push(`  "${archivo}": ${n},`);
    }
    const paraBorrar = Object.keys(DEUDA_OVERLAYS).filter((f) => !actual.has(f));

    expect(
      subieron,
      `Overlay a mano NUEVO (sin focus-trap, sin Escape, sin role="dialog"). Usá Modal, ` +
        `Drawer o ConfirmDialog de components/ui:\n${subieron.join("\n")}`,
    ).toEqual([]);
    expect(
      [...paraActualizar, ...paraBorrar.map((f) => `  (borrar la entrada) "${f}"`)],
      `La deuda solo encoge: actualizá DEUDA_OVERLAYS:\n${[...paraActualizar, ...paraBorrar].join("\n")}`,
    ).toEqual([]);
  });
});

describe("Ratchet de tab-bars: las copias a mano solo ENCOGEN", () => {
  it("ninguna tab-bar nueva a mano; las migradas a <Tabs> salen de la lista", () => {
    const norm = (s: string) => s.split(/[\\/]/).join("/");
    const actual = new Map<string, number>();
    for (const rel of archivosUi(EXENTOS_TOKENS)) {
      if (norm(rel).startsWith("components/ui/")) continue;
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      let n = 0;
      for (const linea of src.split("\n")) {
        if (linea.includes("border-b-2")) n++;
      }
      if (n > 0) actual.set(norm(rel), n);
    }

    const subieron: string[] = [];
    const paraActualizar: string[] = [];
    for (const [archivo, n] of actual) {
      const deuda = DEUDA_TABBARS[archivo] ?? 0;
      if (n > deuda) subieron.push(`  ${archivo}: ${n} (deuda registrada: ${deuda})`);
      else if (n < deuda) paraActualizar.push(`  "${archivo}": ${n},`);
    }
    const paraBorrar = Object.keys(DEUDA_TABBARS).filter((f) => !actual.has(f));

    expect(
      subieron,
      `Tab-bar a mano NUEVA (sin role="tab" ni teclado). Usá <Tabs> de components/ui ` +
        `(modo estado con value/onChange, modo navegación con href):\n${subieron.join("\n")}`,
    ).toEqual([]);
    expect(
      [...paraActualizar, ...paraBorrar.map((f) => `  (borrar la entrada) "${f}"`)],
      `La deuda solo encoge: actualizá DEUDA_TABBARS:\n${[...paraActualizar, ...paraBorrar].join("\n")}`,
    ).toEqual([]);
  });
});

describe("Ratchet de tokens: la deuda de grises crudos solo ENCOGE", () => {
  it("ningún archivo suma grises; los arreglados actualizan o borran su entrada", () => {
    const norm = (s: string) => s.split(/[\\/]/).join("/");
    const actual = new Map<string, number>();
    for (const rel of archivosUi(EXENTOS_TOKENS)) {
      const n = contarGrises(rel);
      if (n > 0) actual.set(norm(rel), n);
    }

    const subieron: string[] = [];
    const paraActualizar: string[] = [];
    for (const [archivo, n] of actual) {
      const deuda = DEUDA_TOKENS[archivo] ?? 0;
      if (n > deuda) subieron.push(`  ${archivo}: ${n} grises (deuda registrada: ${deuda})`);
      else if (n < deuda) paraActualizar.push(`  "${archivo}": ${n},`);
    }
    // Entradas cuyo archivo ya quedó limpio (0 matches) o fue borrado/renombrado.
    const paraBorrar = Object.keys(DEUDA_TOKENS).filter((f) => !actual.has(f));

    expect(
      subieron,
      `Grises crudos NUEVOS (no flipean en modo claro — invariante #5). Usá tokens ` +
        `semánticos (bg-surface · text-fg · border-line · text-fg-muted…); un scrim que debe ` +
        `ser oscuro en ambos modos es bg-black/NN:\n${subieron.join("\n")}`,
    ).toEqual([]);
    expect(
      [...paraActualizar, ...paraBorrar.map((f) => `  (borrar la entrada) "${f}"`)],
      `La deuda solo encoge: actualizá DEUDA_TOKENS con estas líneas (pegar tal cual) ` +
        `o borrá las entradas ya limpias:\n${[...paraActualizar, ...paraBorrar].join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * ── Tinta de estado que NUNCA puede leerse en tema claro ─────────────────────
 *
 * ⚠ NO es un ratchet: es cero absoluto, y hoy está en cero. Cerró el 2026-08-05.
 *
 * LA FALLA QUE ATACA, medida sobre el cartel que la destapó:
 * el tema claro de los colores CRUDOS de estado no sale de una fórmula — es una lista de ~158
 * clases remapeadas a mano en `app/globals.css` (líneas 371-489). Si tu clase exacta está en la
 * lista, se ve; si le agregás una opacidad o usás un tono que nadie listó, cae al valor original
 * de Tailwind —pensado para fondo oscuro— y **desaparece sobre el fondo claro**.
 *
 * En el cartel de WorkspaceClient convivían las dos cosas: el título `text-amber-200` daba 8,75:1
 * (estaba en la lista) y la descripción `text-amber-200/80`, la MISMA familia con opacidad, daba
 * 1,16:1. El botón, `text-amber-100`, daba 1,00:1 — el mismo color que su fondo, literalmente
 * invisible. Ese contraste entre un título legible y el resto borrado es lo que hace el bug tan
 * difícil de ver: parece un problema de la pantalla, no del color.
 *
 * Los dos patrones de abajo son exactamente los que NO pueden estar remapeados:
 *   · tinta clara (100-300) CON opacidad → la clase con `/NN` es otra clase, y nadie la lista;
 *   · tinta 100 a secas → demasiado clara para leerse sobre cualquier tint claro, con o sin lista.
 *
 * El remedio no es agregarlas a la lista: es usar los tokens (`text-warn-ink`, `text-danger-ink`,
 * `text-success-ink`, `text-info-ink`), que están medidos en los DOS temas — o directamente
 * `<Alert variant="…">`, que ya los usa.
 *
 * Por qué el ratchet de grises no lo cazaba: su patrón solo conoce `gray`, `white` y `black`.
 * Ninguna familia de color de estado. Este bloque es el que le faltaba.
 */
const TINTA_ILEGIBLE_RE =
  /\b(?:text|border)-(?:amber|red|green|emerald|blue|yellow|orange|violet|indigo|sky|teal|rose|lime|cyan)-(?:100\/|200\/|300\/|100\b)/;

/**
 * Vacía los COMENTARIOS conservando los saltos de línea, para que el número de línea del reporte
 * siga siendo el real.
 *
 * ⚠ Hace falta y se cazó escribiendo esta guarda: la prosa que explica por qué estas clases no se
 * pueden usar las NOMBRA, así que un escaneo crudo se cae con el código correcto — y una guarda
 * que falla con el código bien es una guarda que alguien borra por molesta. Filtrar por "la línea
 * arranca con //" no alcanza: las líneas de continuación de un comentario de bloque no arrancan
 * con nada.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

describe("Tinta de estado: cero clases que no pueden ser legibles en claro", () => {
  it("ningún archivo de UI usa tinta clara de estado con opacidad ni tono 100", () => {
    const ofensores: string[] = [];
    for (const archivo of archivosUi(EXENTOS_TOKENS)) {
      const contenido = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
      sinComentarios(contenido).split("\n").forEach((linea, i) => {
        if (TINTA_ILEGIBLE_RE.test(linea)) ofensores.push(`  ${archivo}:${i + 1} — ${linea.trim().slice(0, 110)}`);
      });
    }
    expect(
      ofensores,
      `Tinta de estado que NO puede leerse en tema claro (medido: 1,00:1 y 1,16:1 en el caso que ` +
        `lo destapó). El tema claro de los colores crudos es una lista de clases remapeadas a mano; ` +
        `una opacidad o un tono no listado cae al valor de Tailwind y desaparece.\n` +
        `Usá los tokens —text-warn-ink · text-danger-ink · text-success-ink · text-info-ink— o ` +
        `directamente <Alert variant="warning|danger|success|info">, que ya los usa:\n` +
        ofensores.join("\n"),
    ).toEqual([]);
  });
});

/**
 * ── Clases de TOKEN que no corresponden a ningún token ───────────────────────
 *
 * ⚠ Cero absoluto. Cerró el 2026-08-05, después de encontrar cuatro en un solo archivo.
 *
 * LA FALLA QUE ATACA: Tailwind 4 genera la utilidad SOLO si existe el `--color-X` en el bloque
 * `@theme`. Si escribís `text-danger` y el token se llama `--color-danger-ink`, Tailwind **no
 * emite ninguna regla** — ni un warning, ni un error de build. El elemento simplemente hereda el
 * color de su padre.
 *
 * O sea que el mensaje de error más importante de un formulario puede quedar del mismo gris que
 * el texto normal, y nada avisa. Encontrado en el alta de proyectos: `text-danger` en cuatro
 * lugares —los tres mensajes de error del formulario y el aviso de "no se puede traer"— todos
 * pintándose sin color. Tres eran preexistentes y uno se había agregado ese mismo día.
 *
 * Es peor que un gris crudo: el gris crudo al menos se ve. Esto es una clase que parece correcta,
 * pasa la revisión de código porque el nombre suena bien, y no hace nada.
 */
describe("Clases de token: ninguna nombra un token que no existe", () => {
  it("toda clase con nombre de token corresponde a un --color-* declarado", () => {
    const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
    /* Los tokens declarados en el @theme — que es lo ÚNICO de lo que Tailwind 4 genera
       utilidades. Los `--x` sueltos de :root no cuentan: son valores, no utilidades. */
    const declarados = new Set(
      [...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    expect(declarados.size, "no se pudo leer el @theme; la guarda no mira nada").toBeGreaterThan(15);

    /* Solo se miran los nombres que PARECEN token (la raíz coincide con un token declarado pero
       el nombre completo no). Así el escaneo no se pelea con la paleta cruda de Tailwind, que
       tiene su propia guarda, ni con clases arbitrarias. */
    const raices = new Set([...declarados].map((d) => d.split("-")[0]));
    /* ⚠ Literal, NO `new RegExp` con plantilla. La primera versión armaba el patrón interpolando
       la lista de prefijos, y el `\b` de la plantilla se convertía en el carácter de RETROCESO
       () en vez de un límite de palabra: la expresión no matcheaba absolutamente nada y la
       guarda pasaba en verde con cuatro clases muertas en pantalla. Un regex escrito como literal
       no tiene esa ambigüedad. */
    const re = /\b(?:text|bg|border|ring|divide|from|via|to)-([a-z][a-z0-9-]*)\b/g;

    const ofensores: string[] = [];
    for (const archivo of archivosUi(EXENTOS_TOKENS)) {
      const contenido = sinComentarios(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      contenido.split("\n").forEach((linea, i) => {
        for (const m of linea.matchAll(re)) {
          const nombre = m[1];
          if (declarados.has(nombre)) continue;          // token válido
          if (!raices.has(nombre.split("-")[0])) continue; // no pretende ser token
          ofensores.push(`  ${archivo}:${i + 1} — ${m[0]} (no existe --color-${nombre})`);
        }
      });
    }
    expect(
      ofensores,
      `Clases que NOMBRAN un token inexistente. Tailwind 4 no emite regla para ellas y el ` +
        `elemento hereda el color del padre — sin warning, sin error de build, sin nada visible ` +
        `salvo que alguien mire la pantalla. Usá el token completo (p. ej. text-danger-ink, no ` +
        `text-danger) o declaralo en el @theme de app/globals.css:\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });
});
