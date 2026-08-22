"use client";

/**
 * components/landing/sections-tabla.tsx
 *
 * TablaSection — una tabla genérica: encabezados y filas. `sectionType: "tabla"`.
 *
 * ── POR QUÉ HUBO QUE CONSTRUIRLA ─────────────────────────────────────────────
 * Elías la pidió por nombre («que pueda crear tablas»), y el motor no tenía ninguna genérica. Las
 * dos que existían son de propósito único: la de inversión son líneas de factura con totales
 * calculados, y la de propiedades tiene columnas cerradas con desplegables. Ofrecer una de esas
 * cuando alguien pide «una tabla comparativa» sería elegir la opción más parecida — el modo de
 * falla que un vocabulario cerrado existe para impedir.
 *
 * ── ⛔ LAS FILAS NO SE ARRASTRAN, Y NO ES UN OLVIDO ──────────────────────────
 * `SortableItems` envuelve cada ítem en un `<div>`, y un `<div>` dentro de un `<tbody>` es HTML
 * inválido: el navegador lo expulsa de la tabla. Es la misma lección ya escrita en
 * `PropsTableSection`. Reordenar filas se hace con las flechas; si algún día hace falta arrastrar,
 * la vía es una tabla de CSS grid, no meter divs en el tbody.
 *
 * ── ⚠ FILAS Y COLUMNAS SE DESINCRONIZAN SOLAS ───────────────────────────────
 * Nada garantiza que `celdas.length === columnas.length`: el agente agrega una columna y no
 * rellena las filas, o una fila viene de una versión anterior con menos. Se NORMALIZA al pintar —
 * se dibujan tantas celdas como columnas, rellenando con vacío e ignorando el sobrante— en vez de
 * confiar en el dato. Una tabla que se rompe porque a una fila le falta una celda es una tabla que
 * se va a romper.
 *
 * Estilos: reusa `.stl-props` / `.stl-props-scroll`, que ya son la tabla del motor (encabezado,
 * bordes, hover) y ya traen su propio scroll horizontal — la página nunca scrollea de lado.
 */
import { type FC } from "react";
import type { SectionProps } from "./types";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";

export interface TablaColumna {
  titulo: string;
  /** "izquierda" | "derecha" | "centro". TEXTO, no enum: ver el catálogo. */
  alineacion?: string;
}
export interface TablaFila {
  celdas: string[];
}
export interface TablaData {
  intro?: string;
  columnas: TablaColumna[];
  filas: TablaFila[];
  nota?: string;
}

/** Cuántas columnas caben antes de que la tabla deje de leerse en pantalla y en el PDF. */
const MAX_COLUMNAS = 6;

/**
 * La alineación efectiva. Cualquier cosa que no sea una de las tres cae a la izquierda: el valor
 * llega como texto libre (`coerceToSchema` aplana toda hoja a string, así que un enum no
 * sobrevive) y el modelo puede escribir "left", "right" o cualquier otra cosa.
 */
function alineacionDe(v: string | undefined): "left" | "right" | "center" {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "derecha" || s === "right") return "right";
  if (s === "centro" || s === "center") return "center";
  return "left";
}

export const TablaSection: FC<SectionProps<TablaData>> = ({ data, editable, onChange }) => {
  const columnas = Array.isArray(data.columnas) ? data.columnas : [];
  const filas = Array.isArray(data.filas) ? data.filas : [];
  const set = (next: Partial<TablaData>) => onChange?.({ ...data, ...next });

  /** Las celdas de una fila, ya normalizadas al número de columnas. Ver el encabezado. */
  const celdasDe = (f: TablaFila): string[] => {
    const c = Array.isArray(f?.celdas) ? f.celdas : [];
    return columnas.map((_, i) => c[i] ?? "");
  };

  const setCelda = (fi: number, ci: number, valor: string) => {
    const fila = filas[fi];
    const celdas = celdasDe(fila).slice();
    celdas[ci] = valor;
    set({ filas: replaceAt(filas, fi, { ...fila, celdas }) });
  };

  /* Agregar una columna toca TODAS las filas: es la única operación de esta sección con efecto
     sobre otro campo, y por eso se hace acá y no se le pide al que llama que se acuerde. */
  const agregarColumna = () => {
    if (columnas.length >= MAX_COLUMNAS) return;
    set({
      columnas: appendItem(columnas, { titulo: "", alineacion: "" }),
      filas: filas.map((f) => ({ ...f, celdas: [...celdasDe(f), ""] })),
    });
  };

  const quitarColumna = (ci: number) => {
    set({
      columnas: removeAt(columnas, ci),
      filas: filas.map((f) => ({ ...f, celdas: removeAt(celdasDe(f), ci) })),
    });
  };

  const moverFila = (fi: number, delta: number) => {
    const destino = fi + delta;
    if (destino < 0 || destino >= filas.length) return;
    const next = filas.slice();
    [next[fi], next[destino]] = [next[destino], next[fi]];
    set({ filas: next });
  };

  // Sin columnas y sin permiso de edición no hay nada que dibujar: el motor ya la trata como vacía.
  if (columnas.length === 0 && !editable) return null;

  return (
    <>
      {(data.intro || editable) && (
        <Editable
          as="p"
          className="stl-lead"
          editable={editable}
          value={data.intro ?? ""}
          placeholder="Una frase que enmarca la tabla (opcional)…"
          onCommit={(v) => set({ intro: v })}
        />
      )}

      <div className="stl-props-scroll">
        <table className="stl-props">
          <thead>
            <tr>
              {columnas.map((c, ci) => (
                <th key={ci} style={{ textAlign: alineacionDe(c.alineacion) }}>
                  <Editable
                    as="span"
                    editable={editable}
                    value={c.titulo ?? ""}
                    placeholder="Columna…"
                    onCommit={(v) => set({ columnas: replaceAt(columnas, ci, { ...c, titulo: v }) })}
                  />
                  {editable && columnas.length > 1 && (
                    <RemoveBtn onClick={() => quitarColumna(ci)} title="Quitar esta columna" />
                  )}
                </th>
              ))}
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, fi) => (
              <tr key={fi}>
                {celdasDe(f).map((celda, ci) => (
                  <td key={ci} style={{ textAlign: alineacionDe(columnas[ci]?.alineacion) }}>
                    <Editable
                      as="span"
                      editable={editable}
                      value={celda}
                      placeholder="—"
                      onCommit={(v) => setCelda(fi, ci, v)}
                    />
                  </td>
                ))}
                {editable && (
                  <td className="stl-props-actions">
                    {/* Flechas y no arrastre: ver el encabezado — un div en un tbody es inválido. */}
                    <button
                      type="button"
                      onClick={() => moverFila(fi, -1)}
                      disabled={fi === 0}
                      aria-label="Subir esta fila"
                      title="Subir"
                      style={{ opacity: fi === 0 ? 0.3 : 1, cursor: fi === 0 ? "default" : "pointer" }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moverFila(fi, 1)}
                      disabled={fi === filas.length - 1}
                      aria-label="Bajar esta fila"
                      title="Bajar"
                      style={{
                        opacity: fi === filas.length - 1 ? 0.3 : 1,
                        cursor: fi === filas.length - 1 ? "default" : "pointer",
                      }}
                    >
                      ↓
                    </button>
                    <RemoveBtn onClick={() => set({ filas: removeAt(filas, fi) })} title="Quitar esta fila" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <AddBtn
            label="Agregar fila"
            onClick={() =>
              set({ filas: appendItem(filas, { celdas: columnas.map(() => "") }) })
            }
          />
          {columnas.length < MAX_COLUMNAS && (
            <AddBtn label="Agregar columna" onClick={agregarColumna} />
          )}
        </div>
      )}

      {(data.nota || editable) && (
        <Editable
          as="p"
          className="stl-note"
          editable={editable}
          value={data.nota ?? ""}
          placeholder="Nota al pie (opcional)…"
          onCommit={(v) => set({ nota: v })}
        />
      )}
    </>
  );
};
