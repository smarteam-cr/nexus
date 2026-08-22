"use client";

/**
 * components/canvas/EntregaWorkspace.tsx
 *
 * Editor del canvas "Entrega" —el documento con el que se cierra un proyecto— sobre el motor
 * `LandingView`. Documento de CARA AL CLIENTE: paleta de MARCA, no interna.
 *
 * ⚠ La paleta no es cosmética acá. Este documento se le comparte al cliente, así que lo que
 * el CSE revisa tiene que verse exactamente como lo que el cliente va a abrir. La paleta
 * entra por PROP y no envolviendo el motor (guard `lib/ui/landing-palette-scope.test.ts`).
 *
 * DOS SECCIONES NO SE EDITAN COMO LAS DEMÁS: «El plan, cumplido» y «Qué queda abierto» las
 * escribe Nexus desde el cronograma, no la IA y no el CSE a mano. Siguen siendo editables en
 * pantalla —el CSE puede matizar una redacción— pero se regeneran de la fuente, y por eso el
 * documento nunca puede afirmar un número que el cronograma no respalde.
 */
import { useEjecutarOperacionesDelChat } from "@/components/asistente/ejecutar-operaciones";
/* ⚠ La MISMA tabla que usa el servidor para correr el ejecutor en seco antes de acordar. Con
   dos literales, el chat podía acordar algo que este editor rechaza al aplicar. */
import { CAPACIDADES_POR_PIEZA } from "@/lib/canvas/capacidades-de-documento";
import { ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";
import { useEffect, useMemo, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "./useCanvasSections";
import { buildEntregaConfig, buildEntregaSections } from "./entrega-landing-adapter";
import DocumentAssist from "@/components/ai/DocumentAssist";

const MAXW = 860;

/** Slug de la pieza — `POST /pieces/[slug]` materializa sus secciones canónicas. */
const PIECE_SLUG = "delivery";

/** Sección resuelta contra la base: dónde escribir y si ya tiene un CARD que pisar. */
interface TargetSection {
  id: string;
  cardBlockId: string | null;
  hasBlocks: boolean;
}

const SIN_SECCION =
  "No se pudo guardar ese cambio: esta sección todavía no existe en este documento y no se pudo crear. " +
  "Copiá el texto, recargá la página y volvé a intentarlo.";

export default function EntregaWorkspace({
  projectId,
  clientId,
  canvasId,
}: {
  projectId: string;
  clientId: string;
  canvasId: string;
}) {
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });

  /* El chat de este documento ejecuta acá: el editor es el único que escribe, con su optimismo y
     su deshacer. Ocultar y crear están cableados en los seis desde el 2026-08-21. */
  useEjecutarOperacionesDelChat(cs, ENTREGA_DEF_BY_KEY, CAPACIDADES_POR_PIEZA["delivery"]);
  const [aviso, setAviso] = useState<string | null>(null);

  /* Qué va a decir el documento ANTES de generarlo. Un documento honesto puede ser vergonzoso:
     la primera corrida sobre un proyecto real salió con «1 de 10 fases cerradas» — cierto, y
     terrible en un papel titulado «Entrega». El CSE lo ve acá y decide, en vez de enterarse
     leyendo el resultado. Sin dato no se pinta nada: un error de red no puede alarmar. */
  const [avisos, setAvisos] = useState<Array<{ key: string; efecto: string; texto: string }>>([]);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/delivery/readiness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAvisos(d?.avisos ?? []))
      .catch(() => setAvisos([]));
  }, [projectId]);

  const hasGeneratedContent = useMemo(
    () => cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0),
    [cs.sections],
  );

  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => buildEntregaConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildEntregaSections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      hidden: s.hidden === true,
    }));
  }, [cs.sections]);

  /* El ctx del cliente. ⚠ Deliberadamente FLACO: no lleva —ni puede llevar— nada de los
     términos de partner (uso, seats, MRR), que están declarados confidenciales y no pueden
     cruzar a una vista del cliente. Fail-closed por construcción: no hay campo donde meterlo. */
  const ctx: LandingContext = useMemo(
    () => ({ clientName: "", lang: "es" as const, clientId }),
    [clientId],
  );

  /**
   * Resuelve una `key` de la plantilla a su fila REAL en la base, MATERIALIZÁNDOLA si el
   * documento todavía no la tiene. Igual que sus gemelos: el motor pinta como editables TODAS
   * las secciones de la plantilla, también las que la base no tiene, y sin esto editar una de
   * ésas termina en un `return` mudo — el CSE escribe, recarga, y el texto no está.
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
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ minHeight: 120, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}
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

      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
          Documento de cierre · se le comparte al cliente
        </span>
      </div>

      {avisos.length > 0 && (
        <div style={{ padding: "10px 16px", background: "rgba(245, 158, 11, 0.08)", borderBottom: "1px solid rgba(245, 158, 11, 0.3)", fontSize: 13, color: "#92400e" }}>
          <strong style={{ display: "block", marginBottom: 4 }}>
            Antes de generar, mirá esto:
          </strong>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            {avisos.map((a) => (
              <li key={a.key}>
                {a.efecto === "FRENA_PUBLICAR" && <strong>No vas a poder publicarlo: </strong>}
                {a.texto}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasGeneratedContent && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-2)" }}>
          <span>
            Todavía sin generar. Podés escribirlo a mano o usar <strong>Generar entrega</strong> arriba.
            Los números del plan los calcula Nexus del cronograma — la IA no los escribe.
          </span>
        </div>
      )}

      {/* Assist de documento: instrucción → propuesta → revisar → aplicar por
          upsertCardData (a diferencia de Regenerar, que reescribe TODO). */}
      {hasGeneratedContent && (
        <DocumentAssist
          url={`/api/projects/${projectId}/canvas-assist`}
          extraBody={{ canvasId }}
          dialogTitle="Mejorar el documento de entrega con IA"
          chips={["Hazlo más cercano al negocio del cliente", "Destaca mejor los logros alcanzados", "Resume las secciones largas"]}
          placeholder='Ej: "contá el antes y el después con más claridad"'
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
        mode="edit"
        // MARCA, no interna: el cliente va a ver esto.
        palette="brand"
        showBriefs={false}
        onSectionChange={(key, data) => {
          void (async () => {
            const target = await resolveSection(key);
            if (!target) return setAviso(SIN_SECCION);
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
        onToggleHidden={(key, hidden) => {
          const id = idByKey.get(key);
          if (id) void cs.setHidden(id, hidden);
        }}
        onReorder={(keys) => {
          const heroId = idByKey.get("portada");
          const contentIds = keys.map((kk) => idByKey.get(kk)).filter((x): x is string => !!x);
          const ordered = [heroId, ...contentIds].filter((x): x is string => !!x);
          if (ordered.length) cs.reorderSections(ordered);
        }}
      />
    </div>
  );
}
