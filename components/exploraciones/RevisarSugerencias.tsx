"use client";

/**
 * RevisarSugerencias — el cajón «Lo que sugirió el agente» (diseño del 2026-10-03, «Revisar todo lo
 * sugerido»). Todo lo pendiente en un solo lugar, agrupado por pieza y por casilla, con un filtro por
 * pieza, «Usar las N» por grupo y atajos de teclado: U usa, D descarta, ↑ y ↓ se mueven. Cada fila
 * es una sugerencia en una línea; la cita entera y el porqué, al tocar «ver de dónde sale».
 *
 * Se abre desde «Qué sigue» (a la derecha) y desde la franja de una pieza, ya filtrado a esa pieza.
 */
import { useState, type KeyboardEvent } from "react";
import { Button, ConfirmDialog, Drawer, IconButton, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { definicionDe } from "@/lib/exploraciones/casillas";
import type { CasoDeUsoElegido, EstimadoGuardado, ItemPropuesto } from "@/lib/exploraciones/contenido";
import { useLienzo, type PasoDelLienzoUI } from "./contexto";
import { NOMBRE_DEL_PASO, ORDEN_DE_PIEZAS, piezaDelDestino } from "./piezas";
import { DeDondeSale, describirPropuesta, origenEnUnaLinea } from "./Propuestas";
import { NivelChip } from "./QueVaPrimero";

type Filtro = "todo" | PasoDelLienzoUI;

interface Grupo {
  clave: string;
  titulo: string;
  items: ItemPropuesto[];
}

export default function RevisarSugerencias({ abierto, filtroInicial, onCerrar }: { abierto: boolean; filtroInicial: Filtro; onCerrar: () => void }) {
  const { revisables, escala, nombreDeNivel, cambiar, puedeEditar, guardando } = useLienzo();
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [visto, setVisto] = useState({ abierto, filtroInicial });
  const [foco, setFoco] = useState(0);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [revisadas, setRevisadas] = useState(0);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  // Al abrir, arranca en el filtro con que se pidió y con la cuenta en cero.
  if (visto.abierto !== abierto || visto.filtroInicial !== filtroInicial) {
    setVisto({ abierto, filtroInicial });
    if (abierto) {
      setFiltro(filtroInicial);
      setFoco(0);
      setRevisadas(0);
      setAbiertas(new Set());
    }
  }

  const dimensiones = escala.areas.flatMap((a) => a.dimensiones.map((d) => ({ ...d, area: a.nombre })));
  const dimension = (id: string) => dimensiones.find((d) => d.id === id);
  const dimensionDelCriterio = (criterioId: string) => dimension(criterioId.split(".").slice(0, 2).join("."));

  const grupoDe = (it: ItemPropuesto): { clave: string; titulo: string } => {
    const pieza = piezaDelDestino(it.destino);
    const d = it.destino;
    let sub: string;
    switch (d.tipo) {
      case "casilla":
        sub = definicionDe(d.clave).etiqueta;
        break;
      case "nivel":
      case "aExplorar":
        sub = dimension(d.dimensionId)?.area ?? "Dimensiones";
        break;
      case "falta":
        sub = dimensionDelCriterio(d.criterioId)?.area ?? "Criterios";
        break;
      case "casoDeUso": {
        const areaId = (it.valor as CasoDeUsoElegido).areaId;
        sub = escala.areas.find((a) => a.id === areaId)?.nombre ?? "Sin área";
        break;
      }
      default:
        sub = "Qué se mide";
    }
    return { clave: `${pieza}:${sub}`, titulo: `${NOMBRE_DEL_PASO[pieza]} · ${sub}` };
  };

  const textoDe = (it: ItemPropuesto) => {
    const d = it.destino;
    if (d.tipo === "nivel") {
      const e = it.valor as EstimadoGuardado;
      return (
        <>
          {dimension(d.dimensionId)?.nombre ?? d.dimensionId}: <NivelChip nivel={e.nivel} className="ml-0.5 text-sm" />
        </>
      );
    }
    if (d.tipo === "falta") return `${dimensionDelCriterio(d.criterioId)?.nombre ?? "Criterio"} · ${describirPropuesta(it, escala, nombreDeNivel)}`;
    return describirPropuesta(it, escala, nombreDeNivel);
  };

  const porPieza = ORDEN_DE_PIEZAS.map((p) => ({ paso: p, cuantas: revisables.filter((it) => piezaDelDestino(it.destino) === p).length })).filter((p) => p.cuantas > 0);
  const visibles = filtro === "todo" ? revisables : revisables.filter((it) => piezaDelDestino(it.destino) === filtro);

  // Agrupadas en el orden del recorrido; dentro de cada grupo, en el orden en que llegaron.
  const grupos: Grupo[] = [];
  for (const p of ORDEN_DE_PIEZAS) {
    for (const it of visibles) {
      if (piezaDelDestino(it.destino) !== p) continue;
      const g = grupoDe(it);
      const existente = grupos.find((x) => x.clave === g.clave);
      if (existente) existente.items.push(it);
      else grupos.push({ ...g, items: [it] });
    }
  }
  const enOrden = grupos.flatMap((g) => g.items);
  const focoReal = Math.min(foco, Math.max(0, enOrden.length - 1));

  const refrescar = (its: ItemPropuesto[]) => its.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil");
  const usar = (its: ItemPropuesto[]) => {
    if (its.length === 0) return;
    setRevisadas((n) => n + its.length);
    void cambiar(
      its.length === 1 ? [{ op: "usar", itemId: its[0].id, valor: its[0].valor }] : [{ op: "usarVarias", items: its.map((it) => ({ itemId: it.id, valor: it.valor })) }],
      { refrescar: refrescar(its) },
    );
  };
  const descartar = (its: ItemPropuesto[]) => {
    if (its.length === 0) return;
    setRevisadas((n) => n + its.length);
    void cambiar([{ op: "descartar", itemIds: its.map((it) => it.id) }]);
  };

  const alTeclear = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    const actual = enOrden[focoReal];
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setFoco(Math.min(focoReal + 1, enOrden.length - 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setFoco(Math.max(focoReal - 1, 0));
    } else if (puedeEditar && !guardando && actual && (ev.key === "u" || ev.key === "U")) {
      ev.preventDefault();
      usar([actual]);
    } else if (puedeEditar && !guardando && actual && (ev.key === "d" || ev.key === "D")) {
      ev.preventDefault();
      descartar([actual]);
    }
  };

  const total = revisables.length;

  return (
    <Drawer
      open={abierto}
      onClose={onCerrar}
      title="Lo que sugirió el agente"
      description={total > 0 ? `${total} por revisar. Nada se confirma solo: úsalo o descártalo.` : "No queda nada por revisar."}
      size="lg"
      footer={
        puedeEditar && enOrden.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-xs text-fg-muted">
              Revisadas {revisadas} · teclas: <b>U</b> usar · <b>D</b> descartar · <b>↓</b> siguiente
            </span>
            <Button size="sm" variant="secondary" disabled={guardando} onClick={() => setConfirmarDescarte(true)}>
              Descartar las {enOrden.length}
            </Button>
            <Button size="sm" variant="primary" disabled={guardando} onClick={() => usar(enOrden)}>
              Usar las {enOrden.length}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="-mx-5 -my-4 outline-none" tabIndex={0} onKeyDown={alTeclear} aria-label="Sugerencias del agente; U usa, D descarta, flechas para moverse">
        {porPieza.length > 1 && (
          <div className="px-5 py-3">
            <Tabs<Filtro>
              aria-label="Filtrar por pieza"
              variant="pill"
              size="sm"
              value={filtro}
              onChange={(f) => {
                setFiltro(f);
                setFoco(0);
              }}
              items={[{ key: "todo", label: "Todo", count: total }, ...porPieza.map((p) => ({ key: p.paso, label: NOMBRE_DEL_PASO[p.paso], count: p.cuantas }))]}
            />
          </div>
        )}

        {enOrden.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-muted">Todo revisado. Lo que sugiera el agente después aparece acá.</p>
        ) : (
          grupos.map((g) => (
            <section key={g.clave}>
              <header className="flex items-center gap-2 border-b border-line bg-surface-muted px-5 py-2">
                <h3 className="text-2xs font-semibold uppercase tracking-widest text-fg-muted">{g.titulo}</h3>
                <span className="text-2xs text-fg-muted">{g.items.length}</span>
                <span className="flex-1" />
                {puedeEditar && g.items.length > 1 && (
                  <Button size="xs" variant="secondary" disabled={guardando} onClick={() => usar(g.items)}>
                    Usar las {g.items.length}
                  </Button>
                )}
              </header>
              <ul>
                {g.items.map((it) => {
                  const i = enOrden.indexOf(it);
                  const origen = origenEnUnaLinea(it);
                  const abierta = abiertas.has(it.id);
                  return (
                    <li
                      key={it.id}
                      onClick={() => setFoco(i)}
                      className={cn("flex items-start gap-3 border-b border-line px-5 py-3", i === focoReal ? "bg-info-surface" : "bg-surface")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-fg">{textoDe(it)}</p>
                        <p className="mt-0.5 flex min-w-0 items-baseline gap-1 text-xs text-fg-muted">
                          <span className="min-w-0 truncate">
                            {origen.etiqueta}
                            {origen.cita && <span className="italic"> · «{origen.cita}»</span>}
                          </span>
                          <button
                            type="button"
                            aria-expanded={abierta}
                            className="flex-shrink-0 font-medium text-brand hover:underline"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setAbiertas((s) => {
                                const n = new Set(s);
                                if (n.has(it.id)) n.delete(it.id);
                                else n.add(it.id);
                                return n;
                              });
                            }}
                          >
                            {abierta ? "ocultar" : "ver de dónde sale"}
                          </button>
                        </p>
                        {abierta && <DeDondeSale item={it} />}
                      </div>
                      {puedeEditar && (
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          <IconButton variant="subtle" aria-label="Descartar" title="Descartar (D)" disabled={guardando} icon={<span aria-hidden="true">✕</span>} onClick={() => descartar([it])} />
                          <Button size="xs" variant="primary" aria-label="Usar" title="Usar (U)" className="h-7 w-7 px-0" disabled={guardando} onClick={() => usar([it])}>
                            ✓
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmarDescarte}
        z="z-[60]"
        title={`¿Descartar las ${enOrden.length}?`}
        description="Lo descartado no vuelve: el agente no lo va a sugerir de nuevo."
        confirmLabel="Descartar"
        onCancel={() => setConfirmarDescarte(false)}
        onConfirm={() => {
          setConfirmarDescarte(false);
          descartar(enOrden);
        }}
      />
    </Drawer>
  );
}
