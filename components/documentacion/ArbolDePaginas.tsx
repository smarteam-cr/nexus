"use client";

/**
 * components/documentacion/ArbolDePaginas.tsx — el árbol de la izquierda.
 *
 * Vive en el LAYOUT, así que sobrevive a navegar entre páginas: lo que se abre queda abierto,
 * como en Notion. Lo que hace: abrir y cerrar ramas, crear páginas y subpáginas, renombrar en el
 * lugar, mover, bloquear, archivar y arrastrar para reordenar.
 *
 * ── DOS DECISIONES QUE SE VEN AL USARLO ──────────────────────────────────────
 * · Arrastrar reordena ENTRE HERMANAS; para anidar está «Mover a…». Soltar una página adentro de
 *   otra es la parte cara de un árbol arrastrable (zonas de drop por profundidad, autoscroll,
 *   anidado accidental) y el diálogo resuelve lo mismo, con teclado y sin ambigüedad.
 * · Nada se borra: «Archivar» manda la página y sus subpáginas a la papelera, de donde el
 *   liderazgo las devuelve enteras.
 *
 * Todo cambio se manda a la API y después se hace `router.refresh()`: el árbol lo pinta el
 * servidor, así que no hay dos verdades sobre dónde está cada página.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as DndCss } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import { Menu, useToast, type MenuItemDef } from "@/components/ui";
import type { NodoDelArbol } from "@/lib/documentacion/tipos";
import MoverPaginaDialog from "./MoverPaginaDialog";
import BuscadorDocs from "./BuscadorDocs";
import PapeleraDocs from "./PapeleraDocs";

interface Props {
  arbol: NodoDelArbol[];
  puedeEscribir: boolean;
  puedeAdministrar: boolean;
}

/** El id de la madre de cada página, para saber si dos páginas son hermanas. */
function mapaDePadres(arbol: NodoDelArbol[]): Map<string, string | null> {
  const mapa = new Map<string, string | null>();
  const recorrer = (nodos: NodoDelArbol[], padre: string | null) => {
    for (const n of nodos) {
      mapa.set(n.id, padre);
      recorrer(n.hijas, n.id);
    }
  };
  recorrer(arbol, null);
  return mapa;
}

/** Las hermanas de un nivel, en orden. */
function hermanasDe(arbol: NodoDelArbol[], padre: string | null): NodoDelArbol[] {
  if (padre === null) return arbol;
  let encontradas: NodoDelArbol[] = [];
  const buscar = (nodos: NodoDelArbol[]) => {
    for (const n of nodos) {
      if (n.id === padre) {
        encontradas = n.hijas;
        return;
      }
      buscar(n.hijas);
    }
  };
  buscar(arbol);
  return encontradas;
}

/** Las ramas que tienen que nacer abiertas: las que llevan a la página que se está mirando. */
function ramasHastaElSlug(arbol: NodoDelArbol[], slug: string | null): Set<string> {
  const abiertas = new Set<string>();
  if (!slug) return abiertas;
  const buscar = (nodos: NodoDelArbol[], camino: string[]): boolean => {
    for (const n of nodos) {
      if (n.slug === slug) {
        camino.forEach((id) => abiertas.add(id));
        return true;
      }
      if (buscar(n.hijas, [...camino, n.id])) return true;
    }
    return false;
  };
  buscar(arbol, []);
  return abiertas;
}

export default function ArbolDePaginas({ arbol, puedeEscribir, puedeAdministrar }: Props) {
  const router = useRouter();
  const toast = useToast();
  const slugActual = useSelectedLayoutSegment();

  const [abiertas, setAbiertas] = useState<Set<string>>(() => ramasHastaElSlug(arbol, slugActual));
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<NodoDelArbol | null>(null);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const padrePorId = useMemo(() => mapaDePadres(arbol), [arbol]);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function conAviso(accion: () => Promise<unknown>, exito: string) {
    if (ocupado) return;
    setOcupado(true);
    try {
      await accion();
      toast.success(exito);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setOcupado(false);
    }
  }

  const alternar = (id: string) =>
    setAbiertas((previas) => {
      const proximas = new Set(previas);
      if (proximas.has(id)) proximas.delete(id);
      else proximas.add(id);
      return proximas;
    });

  const crear = (parentId: string | null) =>
    conAviso(async () => {
      const r = await fetchJson<{ pagina: { slug: string } }>("/api/documentacion/paginas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: "Página nueva", parentId }),
      });
      if (parentId) setAbiertas((previas) => new Set(previas).add(parentId));
      router.push(`/documentacion/${r.pagina.slug}`);
    }, "Página creada.");

  const renombrar = (id: string, titulo: string) =>
    conAviso(
      () =>
        fetchJson(`/api/documentacion/paginas/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo }),
        }),
      "Título cambiado.",
    );

  const mover = (id: string, parentId: string | null, indice?: number) =>
    conAviso(
      () =>
        fetchJson(`/api/documentacion/paginas/${id}/mover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId, ...(indice === undefined ? {} : { indice }) }),
        }),
      "Página movida.",
    );

  const bloquear = (id: string, bloqueada: boolean) =>
    conAviso(
      () =>
        fetchJson(`/api/documentacion/paginas/${id}/bloquear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bloqueada }),
        }),
      bloqueada ? "Página bloqueada." : "Página desbloqueada.",
    );

  const archivar = (id: string) =>
    conAviso(
      () => fetchJson(`/api/documentacion/paginas/${id}/archivar`, { method: "POST" }),
      "Archivada. Queda en la papelera.",
    );

  const alSoltar = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const id = String(active.id);
    const sobre = String(over.id);
    const padre = padrePorId.get(id) ?? null;
    // Soltar sobre otra rama NO anida (para eso está «Mover a…»): solo se reordena entre hermanas.
    if ((padrePorId.get(sobre) ?? null) !== padre) return;
    const hermanas = hermanasDe(arbol, padre).map((h) => h.id);
    const hasta = hermanas.indexOf(sobre);
    if (hasta < 0) return;
    void mover(id, padre, hasta);
  };

  function Nivel({ nodos, profundidad }: { nodos: NodoDelArbol[]; profundidad: number }) {
    return (
      <SortableContext items={nodos.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-0.5">
          {nodos.map((n) => (
            <Fila key={n.id} nodo={n} profundidad={profundidad} />
          ))}
        </ul>
      </SortableContext>
    );
  }

  function Fila({ nodo, profundidad }: { nodo: NodoDelArbol; profundidad: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: nodo.id,
      disabled: !puedeEscribir,
    });
    const abierta = abiertas.has(nodo.id);
    const activa = nodo.slug === slugActual;

    const acciones: MenuItemDef[] = [
      { key: "renombrar", label: "Renombrar", onSelect: () => setRenombrando(nodo.id) },
      { key: "nueva", label: "Nueva subpágina", onSelect: () => void crear(nodo.id) },
      { key: "mover", label: "Mover a…", onSelect: () => setMoviendo(nodo) },
      {
        key: "bloquear",
        label: nodo.bloqueada ? "Desbloquear" : "Bloquear",
        onSelect: () => void bloquear(nodo.id, !nodo.bloqueada),
        disabled: !puedeAdministrar,
        separatorBefore: true,
      },
      {
        key: "archivar",
        label: "Archivar",
        danger: true,
        disabled: nodo.fija,
        onSelect: () => void archivar(nodo.id),
      },
    ];

    return (
      <li
        ref={setNodeRef}
        style={{ transform: DndCss.Translate.toString(transform), transition }}
        className={cn("relative", isDragging && "opacity-80")}
      >
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-sm",
            activa ? "bg-surface-active text-fg" : "text-fg-secondary hover:bg-surface-hover",
          )}
          style={{ paddingLeft: 4 + profundidad * 12 }}
        >
          <button
            type="button"
            onClick={() => alternar(nodo.id)}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg",
              nodo.hijas.length === 0 && "invisible",
            )}
            aria-label={abierta ? "Cerrar" : "Abrir"}
            aria-expanded={abierta}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={cn("h-3 w-3 transition-transform", abierta && "rotate-90")}
              aria-hidden="true"
            >
              <path d="M7 5l6 5-6 5V5z" />
            </svg>
          </button>

          <span className="w-4 shrink-0 text-center text-xs" aria-hidden="true">
            {nodo.icono ?? "📄"}
          </span>

          {renombrando === nodo.id ? (
            <input
              autoFocus
              defaultValue={nodo.titulo}
              className="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-sm text-fg"
              onBlur={(e) => {
                setRenombrando(null);
                const titulo = e.target.value.trim();
                if (titulo && titulo !== nodo.titulo) void renombrar(nodo.id, titulo);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = nodo.titulo;
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <Link
              href={`/documentacion/${nodo.slug}`}
              className="min-w-0 flex-1 truncate py-1"
              title={nodo.bloqueada ? `${nodo.titulo} · bloqueada` : nodo.titulo}
            >
              {nodo.titulo}
              {nodo.bloqueada && <span className="ml-1 text-2xs text-fg-muted">🔒</span>}
            </Link>
          )}

          {puedeEscribir && (
            <span className="flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                {...attributes}
                {...listeners}
                className="cursor-grab px-1 text-fg-muted hover:text-fg"
                title="Arrastrá para reordenar"
                aria-label="Reordenar"
              >
                ⠿
              </button>
              <button
                type="button"
                onClick={() => void crear(nodo.id)}
                className="px-1 text-fg-muted hover:text-fg"
                title="Nueva subpágina"
                aria-label="Nueva subpágina"
              >
                +
              </button>
              <Menu
                trigger="…"
                items={acciones}
                align="start"
                panelWidth="w-48"
                triggerClassName="px-1 text-fg-muted hover:text-fg"
                triggerTitle="Más acciones"
                aria-label={`Acciones de ${nodo.titulo}`}
              />
            </span>
          )}
        </div>

        {abierta && nodo.hijas.length > 0 && (
          <Nivel nodos={nodo.hijas} profundidad={profundidad + 1} />
        )}
      </li>
    );
  }

  return (
    <nav aria-label="Páginas de Documentación" className="text-sm">
      <div className="mb-2 flex items-center gap-1 px-1">
        <Link
          href="/documentacion"
          className="mr-auto text-2xs font-semibold uppercase tracking-wide text-fg-muted hover:text-fg"
        >
          Documentación
        </Link>
        <button
          type="button"
          onClick={() => setBuscadorAbierto(true)}
          className="rounded px-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          title="Buscar en la documentación (Ctrl+K)"
          aria-label="Buscar en la documentación"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden="true">
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14l4 4" strokeLinecap="round" />
          </svg>
        </button>
        {puedeEscribir && (
          <button
            type="button"
            onClick={() => void crear(null)}
            className="rounded px-1 text-lg leading-none text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            title="Nueva página"
            aria-label="Nueva página"
          >
            +
          </button>
        )}
      </div>

      {arbol.length === 0 ? (
        <p className="px-2 py-4 text-xs text-fg-muted">
          Todavía no hay páginas.
          {puedeEscribir ? " Creá la primera con el «+»." : ""}
        </p>
      ) : (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
          <Nivel nodos={arbol} profundidad={0} />
        </DndContext>
      )}

      <div className="mt-4 border-t border-line pt-2">
        <button
          type="button"
          onClick={() => setPapeleraAbierta(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <span aria-hidden="true">🗑️</span> Papelera
        </button>
      </div>

      <MoverPaginaDialog
        nodo={moviendo}
        arbol={arbol}
        onCerrar={() => setMoviendo(null)}
        onElegir={(parentId) => {
          const id = moviendo?.id;
          setMoviendo(null);
          if (id) void mover(id, parentId);
        }}
      />

      {/* Los dos viven acá porque el árbol está en el LAYOUT: así el Ctrl+K funciona en cualquier
          página de la documentación, y la papelera se abre desde donde se archiva. */}
      <BuscadorDocs abierto={buscadorAbierto} onCambiar={setBuscadorAbierto} />
      <PapeleraDocs
        abierta={papeleraAbierta}
        puedeRestaurar={puedeAdministrar}
        onCerrar={() => setPapeleraAbierta(false)}
      />
    </nav>
  );
}
