"use client";

/**
 * components/landing/partes.tsx — LAS PIEZAS DE UNA SECCIÓN, con manija y X (2026-10-23).
 *
 * Elías, armando el diagnóstico de CEMACO: «el subtítulo y la intro no tienen la X ni la manija para moverse», y «todas
 * las partes del Diagnóstico y de la Planificación deben poder moverse y eliminarse». Las tarjetas ya las tenían
 * (SortableItems); las piezas de la sección —el subtítulo, la intro, el cuerpo— no.
 *
 * Una sección se arma con `<PartesDeLaSeccion partes={[…]}>`. En edición:
 *   · cada pieza visible lleva la manija ⠿ (con dos o más) y, si se puede quitar, la X, igual que un ítem;
 *   · una pieza OPCIONAL vacía no deja hueco ni su ayuda («Subtítulo (opcional)…» separaba el título del contenido):
 *     se agrega con «+ Subtítulo» al pie, junto a las que se quitaron;
 *   · quitar borra su texto y la anota en `data.__partes.quitadas`: regenerar no la vuelve a mostrar.
 * En lectura (el cliente y el PDF) se pinta cada pieza en su orden, sin nada más: el mismo DOM de antes.
 *
 * El estado vive en `data.__partes` (lib/landing/partes.ts). El cuerpo no se quita: para eso está el ojo de la sección.
 */
import { useState, type ReactNode } from "react";
import { SortableItems } from "./sortable";
import { Editable, RemoveBtn } from "./inline";
import {
  CLAVE_DE_LAS_PARTES,
  conParteQuitada,
  leerPartes,
  ordenDeLasPartes,
  reordenarVisibles,
  type EstadoDeLasPartes,
} from "@/lib/landing/partes";

export interface ParteDeSeccion {
  id: string;
  /** Cómo se llama en el botón de agregar y en el de quitar («Subtítulo», «Introducción»). */
  rotulo: string;
  /** Opcional (subtítulo, intro): vacía no se pinta en edición, se agrega. El cuerpo siempre se pinta. */
  opcional?: boolean;
  /** ¿Tiene algo escrito? Decide si una opcional ocupa lugar. */
  conContenido: boolean;
  /** Lo que se escribe al quitarla (sus campos en blanco). Sin esto, no lleva X. */
  alQuitar?: Record<string, unknown>;
  render: () => ReactNode;
}

export function PartesDeLaSeccion({
  data,
  editable,
  onCambios,
  partes,
  className,
}: {
  data: object;
  editable?: boolean;
  /**
   * Lo que cambió, SOLO esas claves (`__partes` y los campos de la pieza quitada): la sección lo escribe con su propio
   * `set`, que sabe armar su forma. Escribir la data entera desde acá pisaría la forma limpia que guardan algunas.
   */
  onCambios?: (cambios: Record<string, unknown>) => void;
  partes: ParteDeSeccion[];
  className?: string;
}) {
  // Las que alguien acaba de agregar con «+»: se pintan vacías, con su ayuda, para escribirlas.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const estado = leerPartes(data);
  const porId = new Map(partes.map((p) => [p.id, p]));
  const orden = ordenDeLasPartes(
    partes.map((p) => p.id),
    estado.orden,
  );
  const quitadas = new Set(estado.quitadas);
  const visibles = orden
    .map((id) => porId.get(id)!)
    .filter((p) => !quitadas.has(p.id) && (!editable || !p.opcional || p.conContenido || abiertas.has(p.id)));
  const paraAgregar = editable ? orden.map((id) => porId.get(id)!).filter((p) => p.opcional && !visibles.includes(p)) : [];

  const guardar = (e: EstadoDeLasPartes, extra: Record<string, unknown> = {}) =>
    onCambios?.({ ...extra, [CLAVE_DE_LAS_PARTES]: { orden: e.orden, quitadas: e.quitadas } });
  const quitar = (p: ParteDeSeccion) => {
    setAbiertas((a) => {
      const n = new Set(a);
      n.delete(p.id);
      return n;
    });
    guardar(conParteQuitada({ ...estado, orden }, p.id, true), p.alQuitar);
  };
  const agregar = (p: ParteDeSeccion) => {
    setAbiertas((a) => new Set(a).add(p.id));
    if (quitadas.has(p.id)) guardar(conParteQuitada({ ...estado, orden }, p.id, false));
  };

  return (
    <div className={className ? `stl-partes ${className}` : "stl-partes"}>
      <SortableItems
        items={visibles}
        disabled={!editable}
        onReorder={(next) => guardar({ ...estado, orden: reordenarVisibles(orden, next.map((p) => p.id)) })}
        container={(nodes) => <>{nodes}</>}
      >
        {(p, _i, handle) =>
          editable ? (
            <div className="stl-parte" data-parte={p.id}>
              {handle}
              {p.alQuitar && <RemoveBtn onClick={() => quitar(p)} title={`Quitar ${p.rotulo.toLowerCase()}`} />}
              {p.render()}
            </div>
          ) : (
            p.render()
          )
        }
      </SortableItems>
      {paraAgregar.length > 0 && (
        <div className="stl-partes-agregar">
          {paraAgregar.map((p) => (
            <button key={p.id} type="button" onClick={() => agregar(p)}>
              + {p.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La forma más común: una intro opcional y el cuerpo de la sección (la tabla, el hilo, las tarjetas). La intro se quita
 * con la X, se agrega con «+ Introducción» y se mueve debajo del cuerpo con la manija.
 */
export function ConIntro({
  data,
  editable,
  onCambios,
  placeholder,
  claseIntro = "stl-lead",
  campo = "intro",
  children,
}: {
  data: object;
  editable?: boolean;
  /** Lo que cambió (la intro y/o `__partes`): la sección lo escribe con su `set`. */
  onCambios?: (cambios: Record<string, unknown>) => void;
  placeholder: string;
  claseIntro?: string;
  /** El campo de la intro, si no se llama `intro`. */
  campo?: string;
  children: ReactNode;
}) {
  const d = data as Record<string, unknown>;
  const valor = typeof d[campo] === "string" ? (d[campo] as string) : "";
  return (
    <PartesDeLaSeccion
      data={d}
      editable={editable}
      onCambios={onCambios}
      partes={[
        {
          id: campo,
          rotulo: "Introducción",
          opcional: true,
          conContenido: !!valor.trim(),
          alQuitar: { [campo]: "" },
          render: () => (
            <Editable as="p" className={claseIntro} editable={editable} value={valor} placeholder={placeholder} onCommit={(v) => onCambios?.({ [campo]: v })} />
          ),
        },
        { id: "cuerpo", rotulo: "Contenido", conContenido: true, render: () => <>{children}</> },
      ]}
    />
  );
}
