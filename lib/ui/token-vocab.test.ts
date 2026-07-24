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
  "app/(shell)/archived/page.tsx": 10,
  "app/(shell)/archived/UnarchiveButton.tsx": 5,
  "app/(shell)/audits/[id]/AuditDetailClient.tsx": 11,
  "app/(shell)/audits/[id]/CompanyFunnelWidget.tsx": 22,
  "app/(shell)/audits/[id]/ContactFunnelWidget.tsx": 22,
  "app/(shell)/audits/[id]/GenerateInsightsButton.tsx": 1,
  "app/(shell)/audits/[id]/LifecycleReport.tsx": 39,
  "app/(shell)/audits/[id]/OwnerAssignmentWidget.tsx": 28,
  "app/(shell)/audits/AuditsTable.tsx": 3,
  "app/(shell)/clients/[id]/error.tsx": 1,
  "app/(shell)/clients/[id]/layout.tsx": 19,
  "app/(shell)/clients/[id]/projects/[projectId]/stage/[stageNum]/page.tsx": 23,
  "app/(shell)/clients/[id]/projects/[projectId]/StageTabs.tsx": 7,
  "app/(shell)/clients/[id]/ProjectsClient.tsx": 26,
  "app/(shell)/clients/[id]/settings/page.tsx": 42,
  "app/(shell)/clients/[id]/stage/[stageNum]/NewAuditButtonClient.tsx": 7,
  "app/(shell)/clients/[id]/stage/[stageNum]/NewImplementationButton.tsx": 13,
  "app/(shell)/clients/[id]/StageTabs.tsx": 7,
  "app/(shell)/clients/[id]/WorkspaceClient.tsx": 17,
  "app/(shell)/clients/ClientsGrid.tsx": 14,
  "app/(shell)/clients/DeleteClientButton.tsx": 1,
  "app/(shell)/clients/NewClientButton.tsx": 3,
  "app/(shell)/clients/page.tsx": 1,
  "app/(shell)/error.tsx": 1,
  "app/(shell)/implementation/[id]/layout.tsx": 14,
  "app/(shell)/integrations/GoogleMeetCard.tsx": 29,
  "app/(shell)/integrations/HubspotSystemCard.tsx": 23,
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
  "app/(shell)/sessions/SessionsClient.tsx": 165,
  "app/(shell)/settings/page.tsx": 19,
  "app/(shell)/team/page.tsx": 2,
  "app/dashboard/ImplementationsList.tsx": 22,
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
  "components/canvas/TimelineGantt.tsx": 108,
  "components/charts/EChartRenderer.tsx": 4,
  "components/chat/ExecutionModal.tsx": 33,
  "components/chat/PlanningChat.tsx": 66,
  "components/clients/ActionItemsDialog.tsx": 2,
  "components/clients/CanvasBoundary.tsx": 1,
  "components/clients/CanvasToggleButtons.tsx": 5,
  "components/clients/ClientCanvasPanel.tsx": 66,
  "components/clients/ClientContextCards.tsx": 108,
  "components/clients/ClientDataLakeFindings.tsx": 8,
  "components/clients/ClientDocuments.tsx": 31,
  "components/clients/ClientInfoPanel.tsx": 12,
  "components/clients/ClientSharing.tsx": 28,
  "components/clients/CronogramaProgressButton.tsx": 1,
  "components/clients/DocumentUpload.tsx": 23,
  "components/clients/ExternalAccessPanel.tsx": 3,
  "components/clients/MinuteDialog.tsx": 44,
  "components/clients/ProjectCanvasPanel.tsx": 54,
  "components/clients/ProjectContextSection.tsx": 1,
  "components/clients/ProjectHandoffSection.tsx": 2,
  "components/clients/ProjectSessionsReview.tsx": 1,
  "components/clients/SectionDiscoveryModal.tsx": 37,
  "components/clients/SendToCanvasMenu.tsx": 27,
  "components/clients/ServiceMap.tsx": 25,
  "components/clients/ServiceMapHeader.tsx": 1,
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
  "components/implementation/ExecutionView.tsx": 33,
  "components/layout/Sidebar.tsx": 12,
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
  "app/(shell)/clients/[id]/stage/[stageNum]/NewImplementationButton.tsx": 1,
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
  "components/chat/ExecutionModal.tsx": 1,
  "components/clients/ClientCanvasPanel.tsx": 1,
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
  "components/chat/ExecutionModal.tsx": 1,
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
