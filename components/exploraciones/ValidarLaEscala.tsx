"use client";

/**
 * ValidarLaEscala — «Validar (N)»: lo que propuso Nexus en el Diagnóstico de rendimiento, UNA POR UNA (26 nov, Elías:
 * «la pantalla dice qué falta validar»). Reemplaza al «Revisar una por una» de la franja de sugerencias, que abría la
 * lista entera debajo. En el mismo orden que la escala (lib/exploraciones/validar-la-escala.ts › `paraValidar`): primero
 * cada parte con su nivel propuesto, después lo demás de la pieza (un área, qué explorar a fondo, con qué se mide).
 *
 * De cada una: dónde cae, lo que propone Nexus y de dónde sale. «Validar» la usa tal cual (con su aviso y Ctrl+Z, como
 * cualquier «Usar»); en una parte, otro de los cinco niveles la deja en ese (`nivelDelVendedor`, lo mismo que el detalle)
 * y descarta lo que proponía Nexus; «Descartar» la saca; «Saltar» deja esa para después. Al usar o descartar, la siguiente toma su lugar. Sin recorrido
 * guiado (Elías: «por ahora no hagamos lo de los recorridos»).
 */
import { useState } from "react";
import { Button, Drawer } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Letra } from "@/lib/escala/documento/tipos";
import type { EstimadoGuardado, ItemPropuesto } from "@/lib/exploraciones/contenido";
import type { EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { nivelDelVendedor } from "@/lib/exploraciones/mapa";
import { useLienzo } from "./contexto";
import { DeDondeSale, describirPropuesta } from "./Propuestas";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

/** Dónde cae una propuesta, en una línea: «Ventas · Datos», «Áreas», «Con qué se mide». */
export function dondeCae(it: ItemPropuesto, escala: EscalaDelLienzo): string {
  const d = it.destino;
  const deDim = (id: string) => {
    const area = escala.areas.find((a) => a.dimensiones.some((x) => x.id === id));
    const dim = area?.dimensiones.find((x) => x.id === id);
    return area && dim ? `${area.nombre} · ${dim.nombre}` : id;
  };
  switch (d.tipo) {
    case "nivel":
    case "aExplorar":
      return deDim(d.dimensionId);
    case "falta":
      return deDim(d.criterioId.split(".").slice(0, 2).join("."));
    case "area":
      return "Áreas";
    case "edicion":
    case "perfil":
      return "Con qué se mide";
    default:
      return "La escala";
  }
}

export default function ValidarLaEscala({ items, abierto, onCerrar }: { items: readonly ItemPropuesto[]; abierto: boolean; onCerrar: () => void }) {
  const { exp, mapa, escala, nombreDeNivel, usar, cambiar, guardando, puedeEditar } = useLienzo();
  const [posicion, setPosicion] = useState(0);
  // Cuántas se resolvieron en esta vuelta (validadas, cambiadas o descartadas), para el cierre.
  const [hechas, setHechas] = useState(0);
  const [visto, setVisto] = useState(abierto);
  if (visto !== abierto) {
    setVisto(abierto);
    if (abierto) {
      setPosicion(0);
      setHechas(0);
    }
  }
  const total = items.length;
  const i = total ? Math.min(posicion, total - 1) : 0;
  const it = items[i];
  const alHacer = (ok: boolean) => {
    // La que se usó o descartó sale de la lista: la siguiente queda en el mismo lugar.
    if (ok) setHechas((n) => n + 1);
  };
  const validar = async () => alHacer(await usar([it]));
  const descartar = async () => alHacer(await cambiar([{ op: "descartar", itemIds: [it.id] }]));
  /* Otro nivel: queda ese, marcado por quien valida, y lo que proponía Nexus se descarta en el mismo cambio (si no, una
     propuesta con evidencia seguiría «por validar» encima). */
  const enOtroNivel = async (l: Letra) => {
    if (it.destino.tipo !== "nivel") return;
    const id = it.destino.dimensionId;
    /* El nivel que ya estaba confirmado (revisión del 26 nov): `nivelDelVendedor` no cambia nada, pero se vuelve a escribir
       tal cual para que quede quién lo validó. */
    const estimado = nivelDelVendedor(l, exp.estado.contenido.chequeo[id], mapa.posiciones[id]) ?? exp.estado.contenido.chequeo[id] ?? null;
    alHacer(await cambiar([...(estimado ? [{ op: "nivel" as const, dimensionId: id, estimado }] : []), { op: "descartar", itemIds: [it.id] }]));
  };
  const nivel = it?.destino.tipo === "nivel" ? (it.valor as EstimadoGuardado).nivel : null;

  return (
    <Drawer
      open={abierto}
      onClose={onCerrar}
      title={total ? `Validar · ${i + 1} de ${total}` : "Validar"}
      size="md"
      footer={
        total && puedeEditar ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={guardando || total < 2} onClick={() => setPosicion((p) => (Math.min(p, total - 1) + 1) % total)}>
                Saltar
              </Button>
              <Button size="sm" variant="ghost" disabled={guardando} onClick={() => void descartar()}>
                Descartar
              </Button>
            </span>
            <Button size="sm" variant="primary" loading={guardando} onClick={() => void validar()}>
              Validar
            </Button>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <Button size="sm" variant="secondary" onClick={onCerrar}>
              Cerrar
            </Button>
          </div>
        )
      }
    >
      {!it ? (
        <div className="flex flex-col gap-1 py-6 text-center">
          <p className="text-sm font-semibold text-success-ink">✓ No queda nada por validar</p>
          {hechas > 0 && <p className="text-xs text-fg-muted">Resolviste {hechas === 1 ? "1" : hechas} en esta vuelta.</p>}
        </div>
      ) : (
        <div key={it.id} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-brand">{dondeCae(it, escala)}</p>
            {nivel ? (
              <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-fg">
                <span className={cn("h-2.5 w-2.5 rounded-full", PUNTO_DE_NIVEL[nivel])} aria-hidden="true" />
                {nombreDeNivel(nivel)}
              </p>
            ) : (
              <p className="text-sm font-semibold text-fg">{describirPropuesta(it, escala, nombreDeNivel)}</p>
            )}
            {nivel && (it.valor as EstimadoGuardado).porQue && <p className="text-[13px] leading-[1.45] text-fg-secondary">{(it.valor as EstimadoGuardado).porQue}</p>}
            <DeDondeSale item={it} />
          </div>
          {nivel && puedeEditar && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-fg-muted">Otro nivel</p>
              <div role="radiogroup" aria-label="Otro nivel" className="flex flex-wrap gap-1.5">
                {LETRAS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={l === nivel}
                    disabled={guardando}
                    onClick={() => void (l === nivel ? validar() : enOtroNivel(l))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-hover disabled:opacity-60",
                      l === nivel ? "border-fg" : "border-line bg-surface",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[l])} aria-hidden="true" />
                    {nombreDeNivel(l)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
