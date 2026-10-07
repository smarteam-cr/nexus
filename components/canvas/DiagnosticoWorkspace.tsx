"use client";

/**
 * components/canvas/DiagnosticoWorkspace.tsx
 *
 * Editor del canvas "Diagnóstico" (informe de rendimiento para el cliente) sobre el
 * motor `LandingView`. Su agente se dispara desde el HEADER del canvas
 * (`CANVAS_PRIMARY_AGENT`, asíncrono: la corrida se ve en el centro de corridas),
 * igual que Exploración.
 *
 * A diferencia de ExploracionWorkspace, este documento es DE CARA AL CLIENTE: se
 * renderiza con la paleta de MARCA (`stl`, no `stl-internal`) — lo que el CSE ve es lo
 * que el cliente va a ver en la sesión o en el PDF. La publicación con link propio llega
 * en su propia tanda; hasta entonces la vía de entrega es la sesión en vivo y el export.
 */
import { useEjecutarOperacionesDelChat } from "@/components/asistente/ejecutar-operaciones";
/* ⚠ La MISMA tabla que usa el servidor para correr el ejecutor en seco antes de acordar. Con
   dos literales, el chat podía acordar algo que este editor rechaza al aplicar. */
import { CAPACIDADES_POR_PIEZA } from "@/lib/canvas/capacidades-de-documento";
import { DIAGNOSTICO_DEF_BY_KEY } from "@/components/landing/configs/diagnostico.defs";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildDiagnosticoConfig, buildDiagnosticoSections, ctxDelDiagnostico } from "./diagnostico-landing-adapter";
import DocumentAssist from "@/components/ai/DocumentAssist";
import { revisarHilo, seccionesDelHilo } from "@/lib/canvas/revisar-hilo";
import EstadoDelDocumento from "./EstadoDelDocumento";
import { lineaDelDocumento, MENSAJE_APROBADO, revisarParaPresentar, type EstadoVista } from "@/lib/canvas/estado-del-documento";
import { POLITICA_RECTORA_KEY } from "@/components/landing/configs/diagnostico.defs";

const MAXW = 860;

/** Slug de la pieza — `POST /pieces/[slug]` materializa sus secciones canónicas. */
const PIECE_SLUG = "diagnosis";

/** Sección resuelta contra la base: dónde escribir y si ya tiene un CARD que pisar. */
interface TargetSection {
  id: string;
  cardBlockId: string | null;
  hasBlocks: boolean;
}

const SIN_SECCION =
  "No se pudo guardar ese cambio: esta sección todavía no existe en este documento y no se pudo crear. " +
  "Copia el texto, recarga la página y vuelve a intentarlo.";

export default function DiagnosticoWorkspace({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  // poll:false — el runner persiste CONFIRMED; tras generar, el remonte lo fuerza el
  // padre (`key` con su `agentNonce` al terminar el agente del header).
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  /* El chat de este documento ejecuta acá: el editor es el único que escribe, con su optimismo y
     su deshacer. Ocultar y crear están cableados en los seis desde el 2026-08-21. */
  /* El estado del documento (2026-10-02): aprobado por el cliente = cerrado, también para el chat. */
  const [estado, setEstado] = useState<EstadoVista | null>(null);
  const aprobado = estado?.estado === "aprobado";
  useEjecutarOperacionesDelChat(cs, DIAGNOSTICO_DEF_BY_KEY, CAPACIDADES_POR_PIEZA["diagnosis"], undefined, aprobado ? MENSAJE_APROBADO : null);

  // ¿Ya corrió la generación? El seed solo siembra el bloque del `cierre` (curado).
  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0),
    [cs.sections],
  );

  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => buildDiagnosticoConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildDiagnosticoSections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      hidden: s.hidden === true,
    }));
  }, [cs.sections]);

  // Aviso propio del workspace (separado de `cs.error`, que es del hook): lo usamos cuando
  // ni siquiera pudimos llegar a guardar porque la sección no existe, o no se guardó un resultado.
  const [aviso, setAviso] = useState<string | null>(null);

  /* Los resultados medibles del HANDOFF (2026-10-02): los objetivos cuantitativos muestran su línea
     base, meta y plazo desde ahí, y completarlos acá los guarda allá — una sola captura. El editor se
     remonta al terminar de generar, así que se vuelven a leer solos. */
  const [resultados, setResultados] = useState<ResultadoMedible[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/handoff-resultados`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { resultados?: ResultadoMedible[] } | null) => {
        if (vivo) setResultados(Array.isArray(j?.resultados) ? j!.resultados : []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId]);
  const editarResultado = useCallback(
    (id: string, campo: "lineaBase" | "meta" | "plazo", valor: string) => {
      const antes = resultados;
      setResultados((rs) => rs.map((r) => (r.id === id ? { ...r, [campo]: valor } : r)));
      void fetch(`/api/projects/${projectId}/handoff-resultados`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, campo, valor }),
      })
        .then(async (r) => {
          if (r.ok) return;
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          setResultados(antes);
          setAviso(j?.error ?? "No se pudo guardar ese dato del resultado. Vuelve a intentarlo.");
        })
        .catch(() => {
          setResultados(antes);
          setAviso("No se pudo guardar ese dato del resultado. Revisa la conexión y vuelve a intentarlo.");
        });
    },
    [projectId, resultados],
  );

  /* El canal del diagnóstico (ctxDelDiagnostico): la cuarta columna del problema lee la tabla de
     Acciones del mismo documento, en vivo — editar una acción la cambia en las dos partes. */
  const ctx: LandingContext = useMemo(
    () => ({
      clientName: "",
      diagnostico: {
        ...ctxDelDiagnostico(sections),
        resultados,
        onEditarResultado: aprobado ? undefined : editarResultado,
        lineaDelDocumento: estado
          ? lineaDelDocumento({ cliente: estado.cliente, fecha: estado.fecha ? new Date(estado.fecha) : null, version: estado.version, estado: estado.estado })
          : undefined,
      },
    }),
    [sections, resultados, editarResultado, estado, aprobado],
  );

  /* Los cabos sueltos del hilo (lib/canvas/revisar-hilo.ts): una causa sin acción, una acción sin causa
     o sin objetivo, un código citado que ya no existe. Se AVISAN, no se corrigen solos: decide la
     persona (o se lo pide al chat). Los que `bloquean` impiden presentar el diagnóstico. */
  const cabosTodos = useMemo(() => {
    const dataDe = (key: string) => {
      const s = cs.sections.find((x) => x.key === key);
      if (!s || s.hidden) return undefined; // una sección oculta no es parte de lo que se presenta
      const card = s.blocks.find((b) => b.blockType === "CARD");
      return (card?.data ?? undefined) as Record<string, unknown> | undefined;
    };
    return revisarHilo(seccionesDelHilo(dataDe));
  }, [cs.sections]);
  const cabos = useMemo(() => cabosTodos.filter((c) => c.bloquea), [cabosTodos]);
  const avisos = useMemo(() => cabosTodos.filter((c) => !c.bloquea), [cabosTodos]);
  const [verCabos, setVerCabos] = useState(false);

  /* Lo que hoy impide presentar, en vivo (el servidor lo vuelve a revisar al presentar). */
  const motivosParaNoPresentar = useMemo(() => {
    const politica = cs.sections.find((x) => x.key === POLITICA_RECTORA_KEY);
    const dataPolitica = politica && !politica.hidden ? politica.blocks.find((b) => b.blockType === "CARD")?.data : undefined;
    return revisarParaPresentar({
      estado: estado?.estado ?? "borrador",
      tieneContenido: hasGeneratedContent,
      cabos: cabosTodos,
      politica: dataPolitica,
    }).motivos;
  }, [cs.sections, cabosTodos, estado?.estado, hasGeneratedContent]);

  /**
   * Resuelve una `key` de la plantilla a su fila REAL en la base, MATERIALIZÁNDOLA si el
   * documento es viejo y todavía no la tiene.
   *
   * POR QUÉ existe: los diagnósticos escritos con el formato anterior no traen las secciones
   * que la plantilla actual sumó (el hero `diagnostico`, `escala`, `cierre`), pero el motor
   * igual las pinta editables. Antes, editarlas terminaba en un `return` mudo — el CSE
   * escribía el titular, recargaba y el texto ya no estaba. Perder texto tipeado es el peor
   * resultado posible, así que primero intentamos CONSERVARLO: `POST /pieces/[slug]` es
   * idempotente y no destructivo (crea las secciones faltantes, nunca borra bloques), y
   * recién con la sección creada guardamos. Si aun así no se puede, el caller AVISA.
   */
  const resolveSection = async (key: string): Promise<TargetSection | null> => {
    const local = cs.sections.find((x) => x.key === key);
    if (local) {
      const card = local.blocks.find((b) => b.blockType === "CARD");
      return { id: local.id, cardBlockId: card?.id ?? null, hasBlocks: local.blocks.length > 0 };
    }
    try {
      const ensured = await fetch(`/api/projects/${projectId}/pieces/${PIECE_SLUG}`, { method: "POST" });
      const info = ensured.ok
        ? ((await ensured.json().catch(() => null)) as { canvasId?: string } | null)
        : null;
      // Si el proyecto tuviera OTRO canvas de esta pieza, el reconcile fue sobre ESE:
      // escribir igual mandaría el texto a un documento que el CSE no tiene abierto.
      if (!info || info.canvasId !== canvasId) return null;
      const listed = await fetch(`/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`);
      if (!listed.ok) return null;
      const payload = (await listed.json().catch(() => null)) as {
        sections?: Array<{ id: string; key: string; blocks?: Array<{ id: string; blockType: string }> }>;
      } | null;
      const row = payload?.sections?.find((s) => s.key === key);
      if (!row) return null;
      const card = row.blocks?.find((b) => b.blockType === "CARD");
      return { id: row.id, cardBlockId: card?.id ?? null, hasBlocks: (row.blocks?.length ?? 0) > 0 };
    } catch {
      return null;
    }
  };

  if (cs.loading) {
    return (
      <div className="stl">
        <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cáscara DELINEADA, no un slab macizo (DECISIONS §Estados de carga). */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                minHeight: 120,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div className="skeleton-shimmer" style={{ height: 12, width: "35%", borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ height: 10, width: "85%", borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ height: 10, width: "70%", borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
    {/* El «Contexto» de este documento (sus reuniones y notas) lo monta el panel del proyecto ARRIBA
        del marco del documento (ProjectCanvasPanel, 2026-10-05). */}
    {/* Borrador → presentado → aprobado (2026-10-02). También fuera de `.stl`: es del equipo. */}
    <EstadoDelDocumento projectId={projectId} canvasId={canvasId} motivosLocales={motivosParaNoPresentar} onEstado={setEstado} />
    <div className="stl">
      {cs.error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{cs.error}</span>
          <button onClick={() => cs.clearError()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {aviso && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border-strong)", color: "var(--text-2)", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{aviso}</span>
          <button onClick={() => setAviso(null)} title="Cerrar" style={{ color: "var(--text-2)", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Estado IDLE: abrir la pieza recién activada sin generar es lo normal. */}
      {!hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span>
            Todavía sin generar. Revisa el contexto de arriba y usa <strong>Generar diagnóstico</strong>, junto
            al nombre del canvas — la corrida aparece en el centro de corridas y puedes seguir navegando.
          </span>
        </div>
      )}

      {hasGeneratedContent && (cabos.length > 0 || avisos.length > 0) && (
        <div
          style={
            cabos.length
              ? { padding: "10px 16px", background: "#FFF7ED", borderBottom: "1px solid #FED7AA", color: "#9A3412", fontSize: 13 }
              : { padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: 13 }
          }
        >
          <button
            type="button"
            onClick={() => setVerCabos((v) => !v)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 600 }}
          >
            {cabos.length
              ? `El hilo tiene ${cabos.length} ${cabos.length === 1 ? "cabo suelto" : "cabos sueltos"}`
              : `El hilo está cerrado`}
            {avisos.length ? ` y ${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"}` : ""} {verCabos ? "▾" : "▸"}
          </button>
          <span>
            {cabos.length
              ? " — así no se puede presentar. Puedes corregirlo a mano o pedírselo al 💬 Asistente."
              : " — se puede presentar; los avisos conviene mirarlos."}
          </span>
          {verCabos && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {cabos.map((c, i) => (
                <li key={`c${i}`}>{c.texto}</li>
              ))}
              {avisos.map((c, i) => (
                <li key={`a${i}`} style={{ opacity: 0.8 }}>
                  Aviso: {c.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Assist de documento: instrucción → propuesta → revisar → aplicar por
          upsertCardData (a diferencia de Regenerar, que reescribe TODO). */}
      {hasGeneratedContent && !aprobado && (
        <DocumentAssist
          url={`/api/projects/${projectId}/canvas-assist`}
          extraBody={{ canvasId }}
          dialogTitle="Mejorar el diagnóstico con IA"
          chips={["Hazlo más directo y menos técnico", "Ancla los síntomas a datos de las sesiones", "Resume las secciones largas"]}
          placeholder='Ej: "sé más concreto en las causas de la Explicación del problema"'
          labelFor={(key) => cs.sections.find((s) => s.key === key)?.label ?? key}
          onApplySection={(key, data) => {
            const s = cs.sections.find((x) => x.key === key);
            if (!s) return;
            const card = s.blocks.find((b) => b.blockType === "CARD");
            return cs.upsertCardData(s.id, card?.id ?? null, data);
          }}
          className="px-4 pt-3"
        />
      )}
      <LandingView
        config={config}
        ctx={ctx}
        sections={sections}
        mode={aprobado ? "read" : "edit"}
        showBriefs={false}
        onSectionChange={(key, data) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
            // Legacy con bloques TEXT y sin CARD: read-only (manda el fallback markdown).
            if (!target.cardBlockId && target.hasBlocks) return;
            await cs.upsertCardData(target.id, target.cardBlockId, data);
          })();
        }}
        onTitleChange={(key, title) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
            await cs.renameSection(target.id, title);
          })();
        }}
        onEyebrowChange={(key, eyebrow) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
            await cs.setEyebrow(target.id, eyebrow);
          })();
        }}
        /* El ojo: apaga la sección para quien lee el documento, sin borrar nada. Se guarda en el
           Json del canvas (`patchSectionEntry`) y NO en una columna — regla dual-PC. */
        onToggleHidden={(key, hidden) => {
          const id = idByKey.get(key);
          if (id) void cs.setHidden(id, hidden);
        }}
        onReorder={(keys) => {
          const heroId = idByKey.get("diagnostico");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
    </>
  );
}
