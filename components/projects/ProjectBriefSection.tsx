"use client";

/**
 * components/projects/ProjectBriefSection.tsx — CÓMO VA ESTE PROYECTO, EN AFIRMACIONES CON FUENTE.
 *
 * Hermano de `components/cs/account/AccountBriefSection.tsx` un nivel más abajo. Dos diferencias
 * que no son de estilo:
 *
 * 1. **El cartel de vencido dice POR QUÉ.** Aquél solo sabe que `staleAt` está puesto; acá la
 *    frescura se DERIVA de los timestamps reales (`lib/projects/brief-vencido.ts`) y el aviso
 *    enumera qué cambió. «Hubo una reunión nueva» y «hubo una reunión nueva y cambió la etapa»
 *    piden reacciones distintas, y un cartel genérico las aplana en la misma.
 *
 * 2. **Se muestra cuántas afirmaciones se descartaron.** Es cuántas citó el modelo apuntando a
 *    una fuente que no existía, y es el único indicador de calidad que este circuito produce: un
 *    número alto significa que el prompt está flojo, no que el proyecto esté tranquilo.
 *    Esconderlo dejaría un resumen corto pareciendo un proyecto sin novedades.
 *
 * ⚠ `onRefresh`, no `router.refresh()` (2026-08-17). `brief` no llega por RSC: el padre
 * (`ProjectGPS`) lo trae con un `fetch` de cliente hacia un solo estado (`data`). `router.refresh()`
 * re-corre componentes de SERVIDOR — acá no hay ninguno en el medio, así que generaba el resumen
 * de verdad y la pantalla se quedaba mostrando el estado vacío hasta que alguien recargaba a mano.
 * `onRefresh` es el mismo `fetchGPS` que el padre ya usa para cualquier otro cambio.
 */
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { fmtChipDate } from "@/components/cs/SourceChip";
import { describirCita } from "@/lib/projects/brief-cita";

/** Acento por tipo de fuente — para poder escanear la lista sin leer cada línea entera.
 *  Deliberadamente discreto (un borde de 2px, no un fondo de color): la afirmación es el
 *  contenido, el acento es solo una guía para el ojo. */
const ACENTO_POR_TIPO: Record<string, string> = {
  desviacion: "border-warn-line",
  hubspot_ops: "border-sky-500/40",
  cobertura: "border-warn-line",
  sesion: "border-line",
  handoff: "border-line",
  etapa: "border-line",
};

/** El ícono de «abre en otra pestaña». Sin texto: el nombre de la reunión ya está al lado. */
function IconoEnlace() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

/**
 * LA CITA, A LA VISTA.
 *
 * ⚠ Se escribe ACÁ y no dentro de `SourceChip` a propósito. Ese chip es compartido por 8
 * pantallas de Customer Success con 16 puntos de render y CERO tests propios: meterle hora, sala
 * y enlace «por default» le cambiaría la cara al dashboard, a las KPI cards y al resumen de
 * cuenta sin que nadie lo haya pedido. La cita rica es una decisión de ESTA sección.
 *
 * ⚠ Y no lleva `whitespace-nowrap` (el chip sí): los títulos de Meet son largos por norma
 * («Smarteam <> Cliente — seguimiento semanal») y esta columna es angosta. Que envuelva.
 */
function Cita({ source }: { source: { kind: string; id: string; label: string; date: string | null } }) {
  const c = describirCita(source);
  const cuando = c.cuando && (c.cuandoPrefijo ? `${c.cuandoPrefijo} ${c.cuando}` : c.cuando);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-fg-muted">
      {c.sala && (
        <span className="font-semibold uppercase tracking-wide text-fg-secondary">{c.sala}</span>
      )}
      <span className="font-medium text-fg-secondary">{c.nombre}</span>
      {cuando && <span>· {cuando}</span>}
      {c.href && (
        <Link
          href={c.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-fg-muted hover:text-brand transition-colors"
          title={`Abrir «${c.nombre}» en otra pestaña`}
        >
          <IconoEnlace />
        </Link>
      )}
    </div>
  );
}

export interface BriefDeProyecto {
  headline: string | null;
  statements: Array<{
    text: string;
    source: { kind: string; id: string; label: string; date: string | null };
  }>;
  generatedAt: string;
  /** Lo resuelve el servidor con `evaluarFrescura`: un solo veredicto, con su motivo. */
  vencido: boolean;
  motivoDeVencimiento: string | null;
}

export default function ProjectBriefSection({
  projectId,
  brief,
  onRefresh,
}: {
  projectId: string;
  brief: BriefDeProyecto | null;
  /** Recarga los datos del padre — NO `router.refresh()`: acá no hay servidor en el medio. */
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [generando, setGenerando] = useState(false);

  async function generar() {
    setGenerando(true);
    toast.info("Leyendo el material del proyecto… (~30 segundos)");
    try {
      const r = await fetchJson<{ statements: number; discarded: number }>(
        `/api/projects/${projectId}/brief`,
        { method: "POST" },
      );
      /* El descarte se anuncia cuando es ALTO en proporción. Decirlo siempre sería ruido; no
         decirlo nunca escondería que el resumen salió corto porque el modelo citó mal. */
      const total = r.statements + r.discarded;
      if (r.discarded > 0 && r.discarded >= total / 3) {
        toast.info(
          `Resumen generado con ${r.statements} afirmaciones. Se descartaron ${r.discarded} por ` +
            `citar una fuente que no existe — si se repite, el prompt del agente necesita ajuste.`,
        );
      } else {
        toast.success(`Resumen generado con ${r.statements} afirmaciones.`);
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar el resumen.");
    } finally {
      setGenerando(false);
    }
  }

  if (!brief) {
    return (
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-fg-muted">
            Todavía no hay resumen de este proyecto. El agente lo redacta desde las reuniones, el
            estado en HubSpot y las desviaciones del cronograma, citando cada afirmación.
          </p>
          <button
            onClick={generar}
            disabled={generando}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand text-primary-fg hover:bg-brand/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generando ? "Generando…" : "✨ Generar resumen"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-line space-y-3">
      {brief.vencido && (
        <div className="flex items-start gap-2 text-[11px] border border-warn-line bg-warn-surface text-warn-ink rounded-lg px-3 py-2">
          {/* El motivo, no un «quedó viejo» genérico: es lo que dice si hace falta regenerar ya
              o si puede esperar. */}
          <span className="flex-1">{brief.motivoDeVencimiento}</span>
          <button
            onClick={generar}
            disabled={generando}
            className="font-medium underline decoration-dotted hover:text-fg disabled:opacity-50 whitespace-nowrap"
          >
            {generando ? "Regenerando…" : "↻ Regenerar"}
          </button>
        </div>
      )}
      {brief.headline && (
        <p className="text-sm font-semibold text-fg leading-snug">{brief.headline}</p>
      )}
      {/* Cada afirmación es un BLOQUE, no una línea corrida: la cita va DEBAJO del texto, no
          pegada al final. Antes competían en el mismo renglón —el texto se cortaba justo donde
          empezaba la cita, o la cita se iba sola a la línea siguiente sin avisar por qué— y con
          6-8 afirmaciones la sección se leía como un párrafo único, sin dónde apoyar la vista.
          El borde izquierdo por tipo (`ACENTO_POR_TIPO`) deja escanear "cuáles son atrasos" de
          un vistazo, sin tener que leer cada cita. */}
      <ul className="space-y-2.5">
        {brief.statements.map((s, i) => (
          <li
            key={i}
            className={`border-l-2 pl-2.5 ${ACENTO_POR_TIPO[s.source.kind] ?? "border-line"}`}
          >
            <p className="text-xs text-fg-secondary leading-relaxed">{s.text}</p>
            <Cita source={s.source} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-fg-muted">
          Generado {fmtChipDate(brief.generatedAt)}
        </span>
        {!brief.vencido && (
          <button
            onClick={generar}
            disabled={generando}
            className="text-[10px] text-brand hover:text-brand/80 disabled:opacity-50"
          >
            {generando ? "Regenerando…" : "↻ Regenerar"}
          </button>
        )}
      </div>
    </div>
  );
}
