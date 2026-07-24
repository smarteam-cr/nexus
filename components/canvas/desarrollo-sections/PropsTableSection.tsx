"use client";

/**
 * components/canvas/desarrollo-sections/PropsTableSection.tsx
 *
 * EL DICCIONARIO DE LA INTEGRACIÓN: una fila por propiedad/campo que participa del flujo
 * (dónde vive · a qué objeto pertenece · nombre técnico · tipo · si entra/sale · si es la
 * llave que empareja registros · si es obligatoria · para qué se usa).
 *
 * El agente siembra el esqueleto desde `arquitectura`/`relacion_objetos`; el equipo la
 * completa MIENTRAS construye. Por eso las columnas de vocabulario cerrado se editan con
 * desplegable y casilla (`InlineSelect`/`InlineCheck`) y no escribiendo texto: si cada quien
 * escribe "entra"/"Entrada"/"inbound", la tabla deja de poder filtrarse o contarse.
 *
 * ⚠ ESTA SECCIÓN LA VE EL CLIENTE (se publica en /external/desarrollo, decisión de producto):
 * la columna `descripcion` es el "por qué se usa" en lenguaje llano, no jerga de implementación.
 *
 * Las filas NO son ordenables a propósito: `SortableItems` envuelve cada ítem en un `<div>`,
 * que dentro de un `<tbody>` es HTML inválido (el navegador lo expulsa de la tabla). El orden
 * lo da la agrupación por sistema/objeto que trae el agente; si algún día hace falta reordenar,
 * la vía es una tabla de CSS grid, no meter divs en el tbody.
 */
import { type FC } from "react";
import {
  Editable,
  InlineSelect,
  InlineCheck,
  RemoveBtn,
  AddBtn,
  isSi,
  replaceAt,
  removeAt,
  appendItem,
} from "@/components/landing/inline";
import type { SectionProps } from "@/components/landing/types";
import { PROP_TIPOS, PROP_DIRECCIONES } from "@/components/landing/configs/desarrollo.defs";

export interface PropRow {
  sistema?: string;
  objeto?: string;
  campo?: string;
  tipo?: string;
  direccion?: string;
  esLlave?: string;
  obligatorio?: string;
  descripcion?: string;
}
export interface PropsTableData {
  intro?: string;
  filas?: PropRow[];
  __legacyMd?: string;
}

const EMPTY_ROW: PropRow = {
  sistema: "",
  objeto: "",
  campo: "",
  tipo: "",
  direccion: "",
  esLlave: "no",
  obligatorio: "no",
  descripcion: "",
};

/** Flecha del sentido del dato — se lee de un vistazo sin depender del color. */
const DIR_GLYPH: Record<string, string> = { entra: "↓", sale: "↑", ambas: "↕" };

export const PropsTableSection: FC<SectionProps<PropsTableData>> = ({ data, editable, onChange }) => {
  const filas = data.filas ?? [];
  const set = (next: Partial<PropsTableData>) => onChange?.({ ...data, ...next });
  const setRow = (i: number, patch: Partial<PropRow>) =>
    set({ filas: replaceAt(filas, i, { ...filas[i], ...patch }) });

  if (!editable && filas.length === 0) {
    // Sin filas y en lectura no hay nada que mostrar: una tabla con encabezados vacíos
    // en el documento del cliente se lee como un error, no como "todavía no se llenó".
    return data.intro ? <p className="stl-lead">{data.intro}</p> : null;
  }

  return (
    <>
      {(editable || data.intro) && (
        <Editable
          as="p"
          className="stl-lead"
          editable={editable}
          value={data.intro ?? ""}
          placeholder="Una frase de contexto (opcional)…"
          onCommit={(v) => set({ intro: v })}
        />
      )}

      {/* 8 columnas no entran en móvil → la tabla scrollea DENTRO de su contenedor
          (nunca el body de la página). */}
      <div className="stl-props-scroll">
        <table className="stl-props">
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Objeto</th>
              <th>Propiedad</th>
              <th>Tipo</th>
              <th>Dirección</th>
              <th className="stl-props-mid">Llave</th>
              <th className="stl-props-mid">Obligatorio</th>
              <th>Para qué se usa</th>
              {editable && <th aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>
                  <Editable
                    as="span"
                    editable={editable}
                    value={f.sistema ?? ""}
                    placeholder="HubSpot / SAP…"
                    onCommit={(v) => setRow(i, { sistema: v })}
                  />
                </td>
                <td>
                  <Editable
                    as="span"
                    editable={editable}
                    value={f.objeto ?? ""}
                    placeholder="Contacto / Empresa…"
                    onCommit={(v) => setRow(i, { objeto: v })}
                  />
                </td>
                <td>
                  <Editable
                    as="code"
                    className="stl-props-campo"
                    editable={editable}
                    value={f.campo ?? ""}
                    placeholder="email / id_cliente_erp…"
                    onCommit={(v) => setRow(i, { campo: v })}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={f.tipo ?? ""}
                    options={PROP_TIPOS}
                    editable={editable}
                    ariaLabel={`Tipo de ${f.campo || "la propiedad"}`}
                    onCommit={(v) => setRow(i, { tipo: v })}
                  />
                </td>
                <td>
                  {editable ? (
                    <InlineSelect
                      value={f.direccion ?? ""}
                      options={PROP_DIRECCIONES}
                      editable
                      ariaLabel={`Dirección de ${f.campo || "la propiedad"}`}
                      onCommit={(v) => setRow(i, { direccion: v })}
                    />
                  ) : (
                    <span className="stl-props-dir">
                      {/* La flecha es refuerzo visual del label, no información propia. */}
                      <span aria-hidden="true">{DIR_GLYPH[(f.direccion ?? "").trim().toLowerCase()] ?? ""}</span>
                      <InlineSelect value={f.direccion ?? ""} options={PROP_DIRECCIONES} ariaLabel="Dirección" />
                    </span>
                  )}
                </td>
                <td className="stl-props-mid">
                  <InlineCheck
                    value={f.esLlave ?? ""}
                    editable={editable}
                    ariaLabel={`${f.campo || "La propiedad"} es la llave que empareja los registros`}
                    onCommit={(v) => setRow(i, { esLlave: v })}
                  />
                </td>
                <td className="stl-props-mid">
                  <InlineCheck
                    value={f.obligatorio ?? ""}
                    editable={editable}
                    ariaLabel={`${f.campo || "La propiedad"} es obligatoria`}
                    onCommit={(v) => setRow(i, { obligatorio: v })}
                  />
                </td>
                <td>
                  <Editable
                    as="span"
                    className="stl-props-desc"
                    editable={editable}
                    value={f.descripcion ?? ""}
                    placeholder="Por qué se usa, en lenguaje que entienda el cliente…"
                    onCommit={(v) => setRow(i, { descripcion: v })}
                  />
                </td>
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn title="Quitar propiedad" onClick={() => set({ filas: removeAt(filas, i) })} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <AddBtn label="Agregar propiedad" onClick={() => set({ filas: appendItem(filas, { ...EMPTY_ROW }) })} />
      )}
      {editable && filas.length > 0 && !filas.some((f) => isSi(f.esLlave)) && (
        // Una integración sin llave no puede emparejar registros: crea duplicados en vez de
        // actualizar. Es el error de diseño más caro y el más fácil de olvidar marcar.
        <p className="stl-props-warn">
          Ninguna propiedad está marcada como llave — sin una, la integración no puede emparejar
          registros y va a duplicarlos.
        </p>
      )}
    </>
  );
};
