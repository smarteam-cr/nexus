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
 *
 * ── SE GENERA SOLO AL ABRIR EL RESUMEN (2026-10-04, decisión de Elías) ──────
 * Si no existe o quedó viejo cuando alguien abre el Resumen del proyecto, se pide una vez, sin
 * avisos: quien abre la ficha quiere leer cómo va, no apretar un botón. Una vez por sesión del
 * navegador y por versión del resumen (`nexus-brief-auto:{proyecto}:{fecha o none}`): si falla o
 * no hay material, no se reintenta en cada apertura. Lo sigue disparando una persona al mirar,
 * nunca un cron.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { fmtChipDate } from "@/components/cs/SourceChip";
import { describirCita } from "@/lib/projects/brief-cita";
import { BotonEnlace, IconoDeSugerencia } from "@/components/ui/sistema";
import { useContextoDelResumen } from "@/components/clients/contexto-del-resumen";

/** El chip de la fuente de cada hallazgo (rediseño del 2026-10-04): deja escanear de dónde sale
 *  cada punto y «cuáles son atrasos» sin leer la cita. Los que piden atención van en ámbar. */
const FUENTE_POR_TIPO: Record<string, { texto: string; tono: "atencion" | "neutro" }> = {
  sesion: { texto: "Reunión", tono: "neutro" },
  handoff: { texto: "Handoff", tono: "neutro" },
  etapa: { texto: "Etapa", tono: "neutro" },
  hubspot_ops: { texto: "HubSpot", tono: "neutro" },
  desviacion: { texto: "Desviación", tono: "atencion" },
  cobertura: { texto: "Cobertura", tono: "atencion" },
};

/** Cuántos hallazgos se ven sin abrir «Ver los N hallazgos». */
const HALLAZGOS_A_LA_VISTA = 3;

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
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted">
      {c.sala && (
        <span className="font-semibold text-fg-secondary">{c.sala}</span>
      )}
      <span>{c.nombre}</span>
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
  /**
   * El resumen en PROSA, arriba de las afirmaciones (2026-09-22).
   *
   * Las afirmaciones citadas contestan «qué pasó»; esto contesta «de qué se trata este proyecto y
   * dónde está parado»: qué se vendió y para qué (el handoff), por dónde viene el recorrido y
   * hacia dónde va. Sin eso, quien no venía siguiendo el proyecto lee ocho hallazgos sueltos y
   * tiene que reconstruir la historia solo.
   *
   * `null` en los resúmenes generados antes de este cambio: la sección simplemente no lo pinta.
   */
  narrativa: string | null;
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
  const { aLaVista } = useContextoDelResumen();
  const [generando, setGenerando] = useState(false);
  /* Los hallazgos de más arrancan plegados (rediseño del 2026-10-04): el titular, la narrativa y
     los primeros tres contestan «cómo va esto»; el resto está a un clic. */
  const [abierto, setAbierto] = useState(false);

  async function generar(silencioso = false) {
    setGenerando(true);
    if (!silencioso) toast.info("Leyendo el material del proyecto… (~30 segundos)");
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
      } else if (!silencioso) {
        toast.success(`Resumen generado con ${r.statements} afirmaciones.`);
      }
      onRefresh();
    } catch (e) {
      /* La generación automática no grita: si no hay material o falló, queda el botón. */
      if (!silencioso) toast.error(e instanceof ApiError ? e.message : "No se pudo generar el resumen.");
    } finally {
      setGenerando(false);
    }
  }

  /* Solo al abrir el Resumen, y una vez por versión: ver el comentario del encabezado. */
  const pedido = useRef<string | null>(null);
  const falta = !brief || brief.vencido;
  const versionDelResumen = brief?.generatedAt ?? "none";
  useEffect(() => {
    if (!aLaVista || !falta || pedido.current === versionDelResumen) return;
    const clave = `nexus-brief-auto:${projectId}:${versionDelResumen}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
    } catch {
      /* Sin sessionStorage (modo privado estricto): igual se pide una sola vez por montaje. */
    }
    pedido.current = versionDelResumen;
    void generar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `generar` cambia en cada render; la clave ya evita repetir
  }, [aLaVista, falta, projectId, versionDelResumen]);

  /* La cabecera de la tarjeta, igual con y sin resumen: la chispa (lo escribe la IA), el nombre, su
     edad y, arriba a la derecha, la acción en azul (pedido de Elías, 2026-10-04). */
  const cabecera = (sub: string, accion: string) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <IconoDeSugerencia className="h-[15px] w-[15px] flex-shrink-0 text-brand" />
          <h3 className="text-[15px] font-semibold text-fg">Resumen del proyecto</h3>
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">{sub}</p>
      </div>
      <BotonEnlace className="flex-shrink-0" onClick={() => void generar()} disabled={generando}>
        {accion}
      </BotonEnlace>
    </div>
  );

  if (!brief) {
    return (
      <section data-recorrido="ficha.resumen" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        {cabecera(generando ? "Generándose…" : "Todavía sin generar", generando ? "Generando…" : "Generar")}
        <p className="text-[13px] leading-relaxed text-fg-secondary">
          {generando
            ? "La IA está leyendo las reuniones, el estado en HubSpot y las desviaciones del cronograma. Tarda unos 30 segundos."
            : "La IA lo redacta desde las reuniones, el estado en HubSpot y las desviaciones del cronograma, citando cada afirmación."}
        </p>
      </section>
    );
  }

  const ocultos = Math.max(0, brief.statements.length - HALLAZGOS_A_LA_VISTA);
  return (
    <section data-recorrido="ficha.resumen" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      {cabecera(
        `${brief.statements.length} hallazgo${brief.statements.length === 1 ? "" : "s"} · generado ${fmtChipDate(brief.generatedAt)}` +
          (brief.vencido ? (generando ? " · actualizándose" : " · quedó viejo") : ""),
        generando ? "Regenerando…" : "Regenerar",
      )}
      {/* El titular y el aviso de vencido están SIEMPRE a la vista: lo único que se pliega son los
          hallazgos de más. */}
      {brief.headline && <p className="text-[14.5px] font-semibold leading-snug text-fg">{brief.headline}</p>}
      {brief.vencido && (
        <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface text-warn-ink px-3 py-2 text-xs">
          {/* El motivo, no un «quedó viejo» genérico: es lo que dice si hace falta regenerar ya
              o si puede esperar. */}
          <span className="flex-1">{brief.motivoDeVencimiento}</span>
          <button
            onClick={() => void generar()}
            disabled={generando}
            className="whitespace-nowrap font-semibold hover:text-fg disabled:opacity-50"
          >
            {generando ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      )}
      {brief.narrativa && (
        /* La NARRATIVA va primero y se lee como texto corrido: es el contexto que vuelve
           interpretables a los hallazgos de abajo. Sin cita al pie a propósito —es una síntesis
           de todo el material, no una afirmación puntual—; lo que se afirma con evidencia va en
           la lista, donde cada línea trae su fuente. */
        <div className="flex flex-col gap-2">
          {brief.narrativa.split(/\n{2,}/).map((parrafo, i) => (
            <p key={i} className="text-[13px] leading-relaxed text-fg-secondary">
              {parrafo.trim()}
            </p>
          ))}
        </div>
      )}
      {/* Cada afirmación: de qué fuente sale (chip), el texto y, debajo, la cita. Los hallazgos de
          más se OCULTAN, no se desmontan: el scroll y el foco sobreviven al pliegue. */}
      <ul className="flex flex-col gap-2.5">
        {brief.statements.map((s, i) => {
          const fuente = FUENTE_POR_TIPO[s.source.kind] ?? { texto: "Fuente", tono: "neutro" as const };
          return (
            <li key={i} hidden={!abierto && i >= HALLAZGOS_A_LA_VISTA} className="flex items-start gap-2.5">
              <span
                className={`mt-px flex-shrink-0 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-semibold ${
                  fuente.tono === "atencion"
                    ? "border-warn-line bg-warn-surface text-warn-ink"
                    : "border-line bg-surface-muted text-fg-secondary"
                }`}
              >
                {fuente.texto}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] leading-[1.45] text-fg">{s.text}</p>
                <Cita source={s.source} />
              </div>
            </li>
          );
        })}
      </ul>
      {ocultos > 0 && (
        <div className="self-start">
          <BotonEnlace onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
            {abierto ? "Ver menos" : `Ver los ${brief.statements.length} hallazgos`}
          </BotonEnlace>
        </div>
      )}
    </section>
  );
}
