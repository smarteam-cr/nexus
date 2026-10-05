"use client";

/**
 * Las piezas de la auditoría, con las medidas del sistema «Nexus · interfaz interna». Los botones,
 * la franja y la chispa de IA son los de la exploración de venta (components/exploraciones/
 * FranjaDeSugerencias.tsx): se reusan, no se copian.
 *
 * La auditoría se lee como un INFORME (2026-10-04, segunda vuelta): lo que escribe el análisis va
 * arriba (la lectura de la sección y, en cada reporte, su lectura sobre los datos), y un hallazgo es
 * una entrada del informe con su cifra, por qué importa y qué hacer. Confirmarlo no lo mueve ni lo
 * pinta de verde: deja de ser una sugerencia y queda en el informe, en el mismo lugar.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BotonAzul, BotonTexto, IconoDeSugerencia } from "@/components/exploraciones/FranjaDeSugerencias";
import { cifra, porcentaje } from "@/lib/auditoria-portal/cifras";
import { ETIQUETA_DE_DECISION, ETIQUETA_DE_SECCION, type Hallazgo, type Severidad } from "@/lib/auditoria-portal/foto";

/** Rótulo en mayúscula sobre un bloque (11 px, 0,08em). Azul cuando el bloque lo escribió el análisis. */
export function Rotulo({ children, ia, accion }: { children: ReactNode; ia?: boolean; accion?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]", ia ? "text-brand" : "text-fg-muted")}>
        {ia && <IconoDeSugerencia className="h-[13px] w-[13px]" />}
        {children}
      </h3>
      {accion}
    </div>
  );
}

/** Chip blanco de cabecera (12 px). */
export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary">
      {children}
    </span>
  );
}

/** Chip chico de estado: ámbar atención, rojo crítico, verde funciona, punteado por confirmar, gris neutro. */
export function ChipDeEstado({ tono, children, title }: { tono: "critico" | "atencion" | "bien" | "punteado" | "neutro"; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[11px] font-semibold",
        tono === "critico" && "border-danger-line bg-danger-surface text-danger-ink",
        tono === "atencion" && "border-warn-line bg-warn-surface text-warn-ink",
        tono === "bien" && "border-success-line bg-success-surface text-success-ink",
        tono === "punteado" && "border-dashed border-line font-normal text-fg-muted",
        tono === "neutro" && "border-line bg-surface font-medium text-fg-secondary",
      )}
    >
      {children}
    </span>
  );
}

/** Tarjeta de contenido: borde, fondo de superficie, 16 px de aire. */
export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-surface p-4", className)}>{children}</div>;
}

/** Una cifra grande con su rótulo y una línea de contexto. */
export function Cifra({ rotulo, valor, nota }: { rotulo: string; valor: number | null; nota?: ReactNode }) {
  return (
    <Tarjeta className="flex h-full flex-col gap-1">
      <span className="text-[13px] text-fg-secondary">{rotulo}</span>
      {valor === null ? (
        <span className="text-[22px] font-bold leading-7 text-fg-muted" title="No se pudo leer: ver «Comprobar a mano»">
          —
        </span>
      ) : (
        <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{cifra(valor)}</span>
      )}
      {nota && <span className="text-xs text-fg-muted">{nota}</span>}
    </Tarjeta>
  );
}

/** Filas de barras horizontales (etiqueta · carril · cifra · porcentaje). Sin color: aquí el color es estado. */
export function Barras({ filas, total }: { filas: { etiqueta: string; valor: number }[]; total: number }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div className="space-y-2.5">
      {filas.map((f) => (
        <div key={f.etiqueta} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4rem_3.5rem] items-center gap-3 text-[13px]">
          <span className="truncate text-fg-secondary" title={f.etiqueta}>
            {f.etiqueta}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
            <div className="h-2 min-w-[3px] rounded-full bg-fg-muted" style={{ width: `${(f.valor / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-fg">{cifra(f.valor)}</span>
          <span className="text-right text-xs text-fg-muted">{porcentaje(f.valor, total)}</span>
        </div>
      ))}
    </div>
  );
}

/** Lo que ocupa el lugar de un reporte cuando alguna de sus lecturas falló. */
export function SinLeer({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-muted p-5">
      <p className="text-sm font-semibold text-fg">{titulo}</p>
      <p className="mt-1 text-[13px] text-fg-muted">
        {children ?? "No se pudo leer completo. No se muestra a medias para no confundir un error de lectura con un cero: qué faltó y dónde mirarlo está en «Comprobar a mano»."}
      </p>
    </div>
  );
}

/** Lo que escribió el análisis sobre una sección: arriba de todo, azul y con la chispa. */
export function LecturaDelAnalisis({ titulo = "Lo que dice el análisis", children, pie }: { titulo?: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-info-line bg-info-surface px-4 py-3.5">
      <Rotulo ia>{titulo}</Rotulo>
      <div className="text-sm leading-relaxed text-fg">{children}</div>
      {pie && <div className="pt-0.5 text-xs text-fg-muted">{pie}</div>}
    </section>
  );
}

/**
 * Un reporte de la ficha: título, una línea de contexto y, ARRIBA de los datos, lo que el análisis
 * lee en él (con la chispa). Sin lectura, el reporte se muestra igual: los datos no dependen de la IA.
 */
export function Reporte({
  titulo,
  subtitulo,
  lectura,
  accion,
  children,
  plano,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  lectura?: string | null;
  accion?: ReactNode;
  children: ReactNode;
  /** Sin tarjeta alrededor (para grillas de cifras que ya traen las suyas). */
  plano?: boolean;
}) {
  const cabecera = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-fg-muted">{subtitulo}</p>}
        </div>
        {accion}
      </div>
      {lectura && (
        <p className="flex gap-2 rounded-lg bg-info-surface px-3 py-2 text-[13px] leading-relaxed text-fg">
          <IconoDeSugerencia className="mt-0.5 h-[14px] w-[14px] flex-shrink-0 text-brand" />
          <span>{lectura}</span>
        </p>
      )}
    </>
  );
  if (plano) {
    return (
      <section className="space-y-3">
        {cabecera}
        {children}
      </section>
    );
  }
  return (
    <section className="space-y-3.5 rounded-xl border border-line bg-surface p-5">
      {cabecera}
      {children}
    </section>
  );
}

const ORDEN_DE_SEVERIDAD: Record<Severidad, number> = { critico: 0, atencion: 1, bien: 2 };
export const porSeveridad = (a: Hallazgo, b: Hallazgo) => ORDEN_DE_SEVERIDAD[a.severidad] - ORDEN_DE_SEVERIDAD[b.severidad];

const ETIQUETA_DE_SEVERIDAD: Record<Severidad, string> = { critico: "Crítico", atencion: "Atención", bien: "Funciona" };
const BARRA_DE_SEVERIDAD: Record<Severidad, string> = { critico: "bg-danger-ink", atencion: "bg-warning", bien: "bg-success" };

/** «8 workflows» → la cifra grande y el rótulo chico; sin número adelante, todo como rótulo. */
function partirDato(dato: string): { cifra: string; rotulo: string } {
  const m = /^([−-]?[\d.,]+\s?%?)\s*(.*)$/.exec(dato.trim());
  return m ? { cifra: m[1].trim(), rotulo: m[2].trim() } : { cifra: "", rotulo: dato.trim() };
}

const fechaCorta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "");

/**
 * Un hallazgo como entrada del informe: la severidad en la barra de la izquierda, el título como
 * afirmación, la cifra que lo resume a la derecha, y debajo por qué importa y qué hacer. Mientras es
 * sugerencia lleva la chispa y los botones; confirmado queda igual, sin color de tarea.
 */
export function TarjetaDeHallazgo({
  hallazgo,
  etiquetas,
  conSeccion,
  ocupado,
  onDecidir,
  onIrASeccion,
}: {
  hallazgo: Hallazgo;
  etiquetas: Record<string, string>;
  conSeccion?: boolean;
  ocupado?: boolean;
  onDecidir?: (estado: "confirmado" | "descartado" | "sugerido") => void;
  onIrASeccion?: () => void;
}) {
  const h = hallazgo;
  const sugerido = h.estado === "sugerido";
  const descartado = h.estado === "descartado";
  const deDonde = h.evidencia.map((c) => etiquetas[c]).filter(Boolean);
  const dato = h.dato ? partirDato(h.dato) : null;
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border bg-surface",
        sugerido ? "border-info-line" : "border-line",
        descartado && "border-dashed opacity-60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", BARRA_DE_SEVERIDAD[h.severidad])} aria-hidden="true" />
      <div className="space-y-3 py-4 pl-5 pr-4">
        {sugerido && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Sugerido por el análisis
          </p>
        )}
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <ChipDeEstado tono={h.severidad}>{ETIQUETA_DE_SEVERIDAD[h.severidad]}</ChipDeEstado>
              <ChipDeEstado tono="neutro" title="Qué haría Smarteam con esto al reimplementar">
                {ETIQUETA_DE_DECISION[h.decision]}
              </ChipDeEstado>
              {conSeccion &&
                (onIrASeccion ? (
                  <button type="button" onClick={onIrASeccion} className="text-xs text-fg-muted hover:text-brand">
                    {ETIQUETA_DE_SECCION[h.seccion]} →
                  </button>
                ) : (
                  <span className="text-xs text-fg-muted">{ETIQUETA_DE_SECCION[h.seccion]}</span>
                ))}
            </div>
            <h4 className="text-[15px] font-semibold leading-snug text-fg">{h.titulo}</h4>
            <p className="text-sm leading-relaxed text-fg-secondary">{h.hallazgo}</p>
          </div>
          {dato && (
            <div className="w-28 flex-shrink-0 text-right">
              {dato.cifra && <p className="text-[22px] font-bold leading-7 tabular-nums text-fg">{dato.cifra}</p>}
              {dato.rotulo && <p className="text-xs leading-snug text-fg-muted">{dato.rotulo}</p>}
            </div>
          )}
        </div>

        <dl className="grid gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[13px] sm:grid-cols-[8.5rem_minmax(0,1fr)]">
          {h.porQueImporta && (
            <>
              <dt className="text-xs font-medium text-fg-muted sm:pt-px">Por qué importa</dt>
              <dd className="text-fg">{h.porQueImporta}</dd>
            </>
          )}
          {h.recomendacion && (
            <>
              <dt className="text-xs font-medium text-fg-muted sm:pt-px">Qué hacer</dt>
              <dd className="text-fg">{h.recomendacion}</dd>
            </>
          )}
          {h.pregunta && (
            <>
              <dt className="text-xs font-medium text-fg-muted sm:pt-px">Pregúntale al cliente</dt>
              <dd className="text-fg">«{h.pregunta}»</dd>
            </>
          )}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-xs text-fg-muted">
            {deDonde.length > 0 ? `Sale de: ${deDonde.join(" · ")}` : "Sin datos citados"}
            {h.estado === "confirmado" && h.decididoPor ? ` · Revisado por ${h.decididoPor}${h.decididoEn ? ` el ${fechaCorta(h.decididoEn)}` : ""}` : ""}
          </p>
          {onDecidir && (
            <div className="flex flex-shrink-0 items-center gap-1">
              {sugerido ? (
                <>
                  <BotonTexto disabled={ocupado} onClick={() => onDecidir("descartado")}>
                    Descartar
                  </BotonTexto>
                  <BotonAzul className="px-[11px] py-[5px]" disabled={ocupado} onClick={() => onDecidir("confirmado")}>
                    Confirmar
                  </BotonAzul>
                </>
              ) : (
                <BotonTexto disabled={ocupado} onClick={() => onDecidir("sugerido")}>
                  {descartado ? "Restaurar" : "Deshacer"}
                </BotonTexto>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Un hallazgo en una línea, para el Resumen: severidad, título, cifra y a qué sección lleva. */
export function FilaDeHallazgo({ hallazgo, onIr }: { hallazgo: Hallazgo; onIr: () => void }) {
  const h = hallazgo;
  return (
    <button
      type="button"
      onClick={onIr}
      className="group flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-surface-hover"
    >
      <span className={cn("h-8 w-1 flex-shrink-0 rounded-full", BARRA_DE_SEVERIDAD[h.severidad])} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {h.estado === "sugerido" && <IconoDeSugerencia className="h-[13px] w-[13px] flex-shrink-0 text-brand" />}
          <span className="truncate text-sm font-semibold text-fg">{h.titulo}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-muted">
          {ETIQUETA_DE_SEVERIDAD[h.severidad]} · {ETIQUETA_DE_DECISION[h.decision]} · {ETIQUETA_DE_SECCION[h.seccion]}
        </span>
      </span>
      {h.dato && <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-fg">{h.dato}</span>}
      <span className="flex-shrink-0 text-xs text-fg-muted group-hover:text-brand" aria-hidden="true">
        →
      </span>
    </button>
  );
}
