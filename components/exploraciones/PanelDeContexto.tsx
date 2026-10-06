"use client";

/**
 * PanelDeContexto — la columna de la derecha del lienzo: lo que el vendedor quiere tener a la vista
 * en cualquier pieza (rediseño de escritorio, 2026-10-03). Qué sigue —y, si el agente sugirió algo,
 * un solo botón para revisarlo todo—; cómo va la arquitectura de la venta (las ocho casillas del
 * marco, en una cuadrícula que se lee de un vistazo: verde confirmado, azul sugerido, punteado falta);
 * dónde parece estar cada área; y las objeciones que ya puso el cliente.
 *
 * No repite contenido: es un índice. Cada cosa abre su lugar (la casilla en el cajón, la pieza).
 */
import Link from "next/link";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PasoDeQueSigue } from "@/lib/exploraciones/calidad";
import { CASILLAS_DEL_RESUMEN, definicionDe, ETIQUETA_DE_LA_OBJECION, type Objecion } from "@/lib/exploraciones/casillas";
import { useLienzo, type PasoDelLienzoUI } from "./contexto";
import { NivelChip } from "./QueVaPrimero";
import { LETRA_DEL_MARCO, lineasDe } from "./Resumen";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";

function Bloque({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Las ocho casillas del marco, de a cuatro: verde lo confirmado, azul lo que sugirió el agente, punteado lo que falta. */
function Arquitectura() {
  const { exp, pendientesPara, abrirCasilla } = useLienzo();
  const confirmadas = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, exp.estado.contenido.casillas[c]).length > 0).length;
  return (
    <Bloque titulo="Arquitectura de la venta" accion={<span className="text-[11px] text-fg-muted">{confirmadas} de 8</span>}>
      <div data-recorrido="preventa.panel.marco" className="grid grid-cols-4 gap-1.5">
        {CASILLAS_DEL_RESUMEN.map((clave) => {
          const lleno = lineasDe(clave, exp.estado.contenido.casillas[clave]).length > 0;
          const propuestas = pendientesPara((d) => d.tipo === "casilla" && d.clave === clave).length;
          const etiqueta = definicionDe(clave).etiqueta;
          return (
            <button
              key={clave}
              type="button"
              onClick={() => abrirCasilla(clave)}
              title={`${etiqueta}: ${lleno ? "confirmado" : propuestas > 0 ? `${propuestas} ${propuestas === 1 ? "sugerida" : "sugeridas"} por el agente` : "falta"}`}
              className={cn(
                "relative flex h-[46px] flex-col items-center justify-center rounded-lg border text-xs font-bold transition-colors",
                lleno
                  ? "border-transparent bg-success-surface text-success-ink"
                  : propuestas > 0
                    ? "border-transparent bg-info-surface text-brand"
                    : "border-dashed border-line text-fg-muted hover:bg-surface-hover",
              )}
            >
              {!lleno && propuestas > 0 && <IconoDeSugerencia className="absolute right-[3px] top-[3px] h-3 w-3" />}
              {LETRA_DEL_MARCO[clave].letra}
              <span className="w-full truncate px-1 text-center text-[10px] font-medium leading-tight">{etiqueta}</span>
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" /> confirmado
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" /> sugerido
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-dashed border-line" aria-hidden="true" /> falta
        </span>
      </p>
    </Bloque>
  );
}

/** Dónde parece estar cada área en juego, y si sale de evidencia o de hipótesis. */
function LaEscala() {
  const { mapa, irA } = useLienzo();
  const areas = mapa.chequeo.areas;
  return (
    <Bloque
      titulo="La escala"
      accion={
        <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => irA("escala")}>
          Ver el mapa
        </button>
      }
    >
      {areas.length === 0 ? (
        <p data-recorrido="preventa.panel.escala" className="text-xs text-fg-muted">Elige las áreas en juego en «La escala».</p>
      ) : (
        <ul data-recorrido="preventa.panel.escala" className="space-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5">
          {areas.map((a) => {
            const hipotesis = a.dimensiones.some((d) => d.aplica && mapa.posiciones[d.id]?.clase === "hipotesis");
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-medium text-fg">{a.nombre}</span>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  {a.nivel ? <NivelChip nivel={a.nivel} className="text-[13px]" /> : <span className="text-[11px] text-fg-muted">falta ubicar {a.faltan.length}</span>}
                  {a.nivel && hipotesis && <span className="text-[11px] text-warn-ink">hipótesis</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Bloque>
  );
}

function Objeciones() {
  const { exp, pendientesPara, abrirCasilla, abrirObjeciones } = useLienzo();
  const dichas = (exp.estado.contenido.casillas.objeciones as Objecion[] | undefined) ?? [];
  const propuestas = pendientesPara((d) => d.tipo === "casilla" && d.clave === "objeciones").length;
  if (dichas.length === 0 && propuestas === 0) return null;
  return (
    <Bloque
      titulo="Ya objetó"
      accion={
        <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => abrirCasilla("objeciones")}>
          {propuestas > 0 ? `${propuestas} ${propuestas === 1 ? "sugerida" : "sugeridas"}` : "Ver todas"}
        </button>
      }
    >
      <ul className="space-y-1.5">
        {dichas.slice(0, 3).map((o, i) => (
          <li key={i} className="rounded-xl border border-line bg-surface px-3 py-2.5" title={`${ETIQUETA_DE_LA_OBJECION[o.clase]} · ${o.respuesta ? "respondida" : "abierta"}`}>
            <p className="line-clamp-2 text-[13.5px] text-fg">«{o.texto}»</p>
            <button type="button" className="mt-1 text-[12.5px] text-brand hover:underline" onClick={abrirObjeciones}>
              Cómo responder
            </button>
          </li>
        ))}
        {dichas.length > 3 && <li className="text-[11px] text-fg-muted">y {dichas.length - 3} más</li>}
      </ul>
    </Bloque>
  );
}

function Proyectos() {
  const { proyectos } = useLienzo();
  if (proyectos.length === 0) return null;
  return (
    <p className="text-2xs text-fg-muted">
      Le llega al handoff de{" "}
      {proyectos.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link href={`/clients/${p.clientId}?tab=${p.id}`} className="text-brand hover:underline">
            {p.nombre}
          </Link>
        </span>
      ))}
      , marcada como estimada: le dice al CSE dónde mirar.
    </p>
  );
}

export default function PanelDeContexto({
  sigue,
  nombreDelPaso,
  paso,
}: {
  sigue: { texto: string; paso: PasoDeQueSigue | null };
  nombreDelPaso: (p: PasoDelLienzoUI) => string;
  /** La pieza abierta: en «La escala» no se repite dónde está cada área (tablero del 2026-10-05). */
  paso: PasoDelLienzoUI;
}) {
  const { irA, revisables, abrirRevision } = useLienzo();
  return (
    <div className="space-y-6">
      <section data-recorrido="que-sigue" className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-3.5">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-brand">Qué sigue</h2>
        <p className="text-sm leading-[1.4] text-fg">{sigue.texto}</p>
        {sigue.paso ? (
          <Button size="sm" variant="primary" className="self-start rounded-md font-semibold" onClick={() => irA(sigue.paso!)}>
            Ir a «{nombreDelPaso(sigue.paso)}»
          </Button>
        ) : (
          revisables.length > 0 && (
            <Button size="sm" variant="primary" className="self-start rounded-md font-semibold" onClick={() => abrirRevision()}>
              Revisar {revisables.length === 1 ? "la sugerencia" : `las ${revisables.length}`} →
            </Button>
          )
        )}
      </section>
      <Arquitectura />
      {paso !== "escala" && <LaEscala />}
      <Objeciones />
      <Proyectos />
    </div>
  );
}
