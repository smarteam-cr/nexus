"use client";

/**
 * Resumen — lo más visible del lienzo: qué sigue y las ocho tarjetas del marco de calificación.
 *
 * Pedido de Elías (2026-10-01): el vendedor tiene que ver DE UN VISTAZO qué le falta para poder
 * proponer. Metas, planes, retos y tiempos; presupuesto y quién decide; consecuencias de no actuar e
 * implicaciones de lograrlo. Cada tarjeta muestra lo confirmado o se ve vacía cuando falta, y avisa
 * cuando el agente propuso algo para ella; al tocarla se abre la casilla para completarla o revisar
 * lo propuesto. En el mismo bloque van «qué sigue» y las propuestas pendientes, que antes eran dos
 * avisos aparte.
 *
 * Debajo, lo que sale de cada reunión (pedido de Elías, 2026-10-01): las objeciones y las
 * particularidades de la cuenta, que el agente propone al leer cada sesión, como el cronograma
 * propone sus particularidades. Y, si ya hay un proyecto, a cuál le llega la exploración.
 */
import Link from "next/link";
import { useState } from "react";
import { AgentProposal } from "@/components/ai/AgentProposal";
import { Badge, Button, Drawer } from "@/components/ui";
import type { PasoDeQueSigue } from "@/lib/exploraciones/calidad";
import {
  CASILLAS_DE_LAS_REUNIONES,
  CASILLAS_DEL_RESUMEN,
  definicionDe,
  ETIQUETA_DEL_ROL,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
} from "@/lib/exploraciones/casillas";
import type { ItemPropuesto } from "@/lib/exploraciones/contenido";
import { cn } from "@/lib/cn";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";

/** La letra del marco de cada tarjeta (GPCT, presupuesto y autoridad, C&I), con su nombre en inglés. */
const LETRA: Record<(typeof CASILLAS_DEL_RESUMEN)[number], { letra: string; marco: string }> = {
  metas: { letra: "G", marco: "Goals" },
  planes: { letra: "P", marco: "Plans" },
  retos: { letra: "C", marco: "Challenges" },
  tiempos: { letra: "T", marco: "Timeline" },
  presupuesto: { letra: "B", marco: "Budget" },
  autoridad: { letra: "A", marco: "Authority" },
  consecuencias: { letra: "C", marco: "Consequences" },
  implicaciones: { letra: "I", marco: "Implications" },
};

/** Lo confirmado de una casilla, en líneas cortas para la tarjeta. */
function lineasDe(clave: ClaveDeCasilla, valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  const tipo = definicionDe(clave).tipo;
  switch (tipo) {
    case "texto":
      return typeof valor === "string" && valor.trim() ? [valor] : [];
    case "lista":
      return valor as string[];
    case "metas":
      return (valor as Meta[]).map((m) => {
        const cifras = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ");
        return cifras ? `${m.que}: ${cifras}` : m.que;
      });
    case "retos":
      return (valor as Reto[]).map((r) => r.texto);
    case "autoridad":
      return (valor as Persona[]).map((p) => `${p.nombre} · ${ETIQUETA_DEL_ROL[p.rol]}`);
    default:
      return [];
  }
}

function Tarjeta({ clave, pendientes, onAbrir }: { clave: (typeof CASILLAS_DEL_RESUMEN)[number]; pendientes: number; onAbrir: () => void }) {
  const { exp } = useLienzo();
  const def = definicionDe(clave);
  const lineas = lineasDe(clave, exp.estado.contenido.casillas[clave]);
  const vacia = lineas.length === 0;
  const { letra, marco } = LETRA[clave];
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "flex min-h-[6.5rem] flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:bg-surface-hover",
        vacia ? "border-dashed border-line bg-surface-muted" : "border-line bg-surface",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-brand/10 text-2xs font-semibold text-brand-light" title={marco}>
            {letra}
          </span>
          <span className="truncate text-xs font-semibold text-fg">{def.etiqueta}</span>
        </span>
        {pendientes > 0 && (
          <Badge size="xs" variant="info">
            {pendientes} del agente
          </Badge>
        )}
      </span>
      {vacia ? (
        <span className="text-xs text-fg-muted">Falta</span>
      ) : (
        <span className="space-y-0.5">
          {lineas.slice(0, 2).map((l, i) => (
            <span key={i} className="line-clamp-2 block text-xs text-fg-secondary">
              {l}
            </span>
          ))}
          {lineas.length > 2 && <span className="block text-2xs text-fg-muted">y {lineas.length - 2} más</span>}
        </span>
      )}
    </button>
  );
}

export default function Resumen({
  sigue,
  nombreDelPaso,
  paraUsarTodas,
}: {
  sigue: { texto: string; paso: PasoDeQueSigue | null };
  nombreDelPaso: (p: PasoDeQueSigue) => string;
  /** Lo propuesto que se puede usar de una vez (sin los casos de uso, que se eligen uno por uno). */
  paraUsarTodas: ItemPropuesto[];
}) {
  const { pendientesPara, puedeEditar, guardando, cambiar, irA } = useLienzo();
  const [abierta, setAbierta] = useState<ClaveDeCasilla | null>(null);
  const contar = (clave: ClaveDeCasilla) => pendientesPara((d) => d.tipo === "casilla" && d.clave === clave).length;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">Qué sigue</p>
            <p className="text-sm text-fg">{sigue.texto}</p>
          </div>
          {sigue.paso && (
            <Button size="xs" variant="secondary" className="flex-shrink-0" onClick={() => irA(sigue.paso!)}>
              Ir a «{nombreDelPaso(sigue.paso)}»
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CASILLAS_DEL_RESUMEN.map((clave) => (
            <Tarjeta key={clave} clave={clave} pendientes={contar(clave)} onAbrir={() => setAbierta(clave)} />
          ))}
        </div>

        {paraUsarTodas.length > 0 && puedeEditar && (
          <AgentProposal
            title={`Hay ${paraUsarTodas.length} ${paraUsarTodas.length === 1 ? "propuesta" : "propuestas"} del agente para revisar`}
            subtitle="Están en su lugar: en estas tarjetas, en «Exploración» y en «La escala». Úsalas o descártalas mirando lo que ya está; nada se confirma solo."
            applyLabel="Usar todas"
            discardLabel="Descartar todas"
            applying={guardando}
            onApply={() =>
              void cambiar([{ op: "usarVarias", items: paraUsarTodas.map((it) => ({ itemId: it.id, valor: it.valor })) }], {
                refrescar: paraUsarTodas.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil"),
              })
            }
            onDiscard={() => void cambiar([{ op: "descartar", itemIds: paraUsarTodas.map((it) => it.id) }])}
          />
        )}

        <Drawer open={abierta !== null} onClose={() => setAbierta(null)} title={abierta ? definicionDe(abierta).etiqueta : undefined} description={abierta ? definicionDe(abierta).ayuda : undefined} size="lg">
          {abierta && <Casilla key={abierta} clave={abierta} sinTitulo editarDeEntrada onListo={() => setAbierta(null)} />}
        </Drawer>
      </section>

      {/* Lo que sale de cada reunión: lo propone el agente al leerla, con la frase del cliente. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {CASILLAS_DE_LAS_REUNIONES.map((clave) => (
          <Casilla key={clave} clave={clave} />
        ))}
      </div>

      <ProyectosQueLaReciben />
    </div>
  );
}

/** A qué proyecto le llega la exploración: lo único del viejo «Traspaso» que es un dato y no una explicación. */
function ProyectosQueLaReciben() {
  const { proyectos } = useLienzo();
  if (proyectos.length === 0) return null;
  return (
    <p className="text-xs text-fg-muted">
      Le llega al handoff de{" "}
      {proyectos.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link href={`/clients/${p.clientId}?tab=${p.id}`} className="text-brand-light hover:underline">
            {p.nombre}
          </Link>
        </span>
      ))}
      , marcada como estimada: le dice al CSE dónde mirar.
    </p>
  );
}
