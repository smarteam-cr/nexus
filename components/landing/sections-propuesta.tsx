"use client";

/**
 * components/landing/sections-propuesta.tsx — lo propio de la PROPUESTA.
 *
 * Tres secciones:
 *  · `PropuestaSmarteamSection` — a qué empresa entraría quien lee: propósito +
 *    el esqueleto del equipo.
 *  · `PropuestaSesionesSection` — las mismas sesiones de seguimiento que el
 *    perfil de puesto, pero en rejilla de 2 columnas en vez de la escalera
 *    vertical. Es un componente aparte y NO un prop del de roles porque el mapa
 *    sectionType → Component es POR PLANTILLA: cambiar el mapa de la propuesta
 *    deja intactos los 3 perfiles de puesto, que siguen con su escalera.
 *  · `PropuestaEconomicaSection` — la oferta.
 *
 * Las tres son vista Y editor inline, como el resto del motor (`Editable`,
 * `SortableItems`, `RemoveBtn`/`AddBtn`). Nacieron solo-lectura porque el
 * contenido estaba hardcodeado, y eso dejó a una propuesta creada desde /roles
 * imposible de completar por pantalla: con el assist de IA cortado (409 en
 * PROPUESTA) y el PDF apagado, no quedaba ningún camino que no fuera la base.
 *
 * ⚠ REGLA DEL DOCUMENTO YA PRESENTADO: en LECTURA el HTML no se mueve — mismas
 * etiquetas y mismas clases `.stl-*` que antes de que fueran editables. Por eso
 * `stl-item` (el ancla del chrome absoluto: × y ⠿) se agrega SOLO en edición y
 * la columna de acciones de la tabla ni se renderiza.
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import type { RoleCadenceData } from "./sections-roles";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";

const IconCheck = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
  </svg>
);

/** `stl-item` solo ancla el chrome de edición (`position: relative` para el × y el ⠿).
 *  En lectura no hay chrome, así que tampoco va la clase: el documento publicado
 *  conserva exactamente el markup con el que se presentó. */
const itemCls = (editable: boolean | undefined, cls: string) => (editable ? `stl-item ${cls}` : cls);

// ── Quiénes somos: propósito + esqueleto del equipo ─────────────────────────

export interface SmarteamNodo { nodo: string; equipo?: string }
export interface PropuestaSmarteamData {
  proposito: string;
  estructuraTitulo?: string;
  estructuraNota?: string;
  estructura: SmarteamNodo[];
}

export const PropuestaSmarteamSection: FC<SectionProps<PropuestaSmarteamData>> = ({ data, editable, onChange }) => {
  const estructura = Array.isArray(data.estructura) ? data.estructura : [];
  const set = (next: Partial<PropuestaSmarteamData>) => onChange?.({ ...data, ...next });
  const setNodo = (i: number, next: Partial<SmarteamNodo>) =>
    set({ estructura: replaceAt(estructura, i, { ...estructura[i], ...next }) });

  return (
    <div className="stl-smarteam">
      <Editable as="blockquote" className="stl-smarteam-proposito" editable={editable} value={data.proposito}
        placeholder="El propósito de Smarteam, en una frase…" onCommit={(v) => set({ proposito: v })} />

      {/* En edición el bloque se muestra aunque no haya nada: si dependiera de que
          ya existan nodos, el "Agregar" que los crea sería inalcanzable. */}
      {(editable || estructura.length > 0) && (
        <div className="stl-smarteam-estructura">
          {(editable || (data.estructuraTitulo ?? "").trim()) && (
            <Editable as="h3" className="stl-card-title" editable={editable} value={data.estructuraTitulo ?? ""}
              placeholder="Título del esqueleto (ej. Cómo está armado el equipo)…"
              onCommit={(v) => set({ estructuraTitulo: v })} />
          )}
          {/* La nota importa: la lista es el ESQUELETO del equipo, no el
              organigrama de mando. Sin decirlo, se lee como jerarquía. */}
          {(editable || (data.estructuraNota ?? "").trim()) && (
            <Editable as="p" className="stl-card-detail" editable={editable} value={data.estructuraNota ?? ""}
              placeholder="Una línea que aclare que es el esqueleto, no una cadena de mando…"
              onCommit={(v) => set({ estructuraNota: v })} />
          )}
          {/* Sin reordenar por arrastre a propósito: `SortableItems` envuelve cada ítem
              en un `<div>`, y un div suelto dentro de un `<ul>` no es una lista. El orden
              lo fija quien escribe el documento, con Agregar/Quitar. */}
          <ul className="stl-checklist">
            {estructura.map((n, i) => (
              <li key={i} className={editable ? "stl-item" : undefined}>
                {editable && (
                  <RemoveBtn title="Quitar del esqueleto" onClick={() => set({ estructura: removeAt(estructura, i) })} />
                )}
                <span className="stl-check" aria-hidden>
                  {IconCheck}
                </span>
                <span>
                  <Editable as="span" className="stl-smarteam-nombre" editable={editable} value={n.nodo}
                    placeholder="Puesto o área…" onCommit={(v) => setNodo(i, { nodo: v })} />
                  {/* El espacio queda FUERA del campo: adentro sería contenido editable
                      que se borra sin querer y pega el nombre con el equipo. */}
                  {(editable || (n.equipo ?? "").trim()) && (
                    <>
                      {" "}
                      <Editable as="span" className="stl-smarteam-equipo" editable={editable} value={n.equipo ?? ""}
                        placeholder="con su equipo de… (opcional)" onCommit={(v) => setNodo(i, { equipo: v })} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {editable && (
            <AddBtn label="Agregar al esqueleto"
              onClick={() => set({ estructura: appendItem(estructura, { nodo: "", equipo: "" }) })} />
          )}
        </div>
      )}
    </div>
  );
};

// ── Sesiones de seguimiento (2 por fila) ────────────────────────────────────

export const PropuestaSesionesSection: FC<SectionProps<RoleCadenceData>> = ({ data, editable, onChange }) => {
  const items = Array.isArray(data.items) ? data.items : [];
  const set = (next: Partial<RoleCadenceData>) => onChange?.({ ...data, ...next });
  const setItem = (i: number, next: Partial<RoleCadenceData["items"][number]>) =>
    set({ items: replaceAt(items, i, { ...items[i], ...next }) });

  return (
    <>
      {(editable || (data.intro ?? "").trim()) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Una línea de encuadre (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      {/* Rejilla de 2 columnas (pedido explícito: 4 cards, 2 por fila) — es lo ÚNICO
          que separa a esta sección de `RoleCadenceSection`, que va en escalera. */}
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2" style={{ marginTop: 18 }}>{nodes}</div>}>
        {(it, i, handle) => (
          <div className={itemCls(editable, "stl-card stl-cadence")}>
            {handle}
            {editable && <RemoveBtn title="Quitar sesión" onClick={() => set({ items: removeAt(items, i) })} />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={it.evento}
              placeholder="Nombre de la sesión…" onCommit={(v) => setItem(i, { evento: v })} />
            <div className="stl-cadence-meta">
              <div>
                <div className="stl-kpi-field-label">Quiénes</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.quienes}
                  placeholder="Quién participa…" onCommit={(v) => setItem(i, { quienes: v })} />
              </div>
              <div>
                <div className="stl-kpi-field-label">Cuándo</div>
                {/* En la propuesta va la FRECUENCIA, no el horario: quien lee todavía
                    no tiene agenda acá. */}
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.cuando}
                  placeholder="Cada cuánto (ej. Semanal, al arrancar la semana)…"
                  onCommit={(v) => setItem(i, { cuando: v })} />
              </div>
            </div>
            <div>
              <div className="stl-kpi-field-label">De qué se trata</div>
              <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.formato}
                placeholder="Qué pasa en la sesión y qué sale de ella…"
                onCommit={(v) => setItem(i, { formato: v })} />
            </div>
          </div>
        )}
      </SortableItems>
      {editable && (
        <AddBtn label="Agregar sesión"
          onClick={() => set({ items: appendItem(items, { evento: "", quienes: "", cuando: "", formato: "" }) })} />
      )}
    </>
  );
};

// ── Propuesta económica ─────────────────────────────────────────────────────

export interface PropuestaFila { concepto: string; quincenal: string; mensual: string }
export interface PropuestaDestacado { titulo: string; texto: string; enfasis?: boolean }
export interface PropuestaBloque { titulo: string; items: string[] }
export interface PropuestaEncabezados { concepto: string; quincenal: string; mensual: string }
export interface PropuestaEconomicaData {
  tituloTabla: string;
  encabezados: PropuestaEncabezados;
  filas: PropuestaFila[];
  /** Lo que no es salario base: crecimiento, comisiones. Cards, 2 por fila. */
  destacados?: PropuestaDestacado[];
  /** Listas (condiciones, beneficios). Cards con viñetas de verdad. */
  bloques?: PropuestaBloque[];
}

const ENCABEZADOS_VACIOS: PropuestaEncabezados = { concepto: "", quincenal: "", mensual: "" };

export const PropuestaEconomicaSection: FC<SectionProps<PropuestaEconomicaData>> = ({ data, editable, onChange }) => {
  const filas = Array.isArray(data.filas) ? data.filas : [];
  const destacados = Array.isArray(data.destacados) ? data.destacados : [];
  const bloques = Array.isArray(data.bloques) ? data.bloques : [];
  // `encabezados` llega de la base y puede faltar (documento creado vacío, data vieja):
  // leerlo sin respaldo tiraba la sección entera, que acá es la OFERTA.
  const enc = data.encabezados ?? ENCABEZADOS_VACIOS;

  const set = (next: Partial<PropuestaEconomicaData>) => onChange?.({ ...data, ...next });
  const setEnc = (next: Partial<PropuestaEncabezados>) => set({ encabezados: { ...enc, ...next } });
  const setFila = (i: number, next: Partial<PropuestaFila>) =>
    set({ filas: replaceAt(filas, i, { ...filas[i], ...next }) });
  // `enfasis` (el realce del bloque de comisión) viaja en el spread y se conserva:
  // es presentación, no texto, y el motor no tiene control para un booleano así.
  const setDestacado = (i: number, next: Partial<PropuestaDestacado>) =>
    set({ destacados: replaceAt(destacados, i, { ...destacados[i], ...next }) });
  const setBloque = (i: number, next: Partial<PropuestaBloque>) =>
    set({ bloques: replaceAt(bloques, i, { ...bloques[i], ...next }) });

  return (
    <div className="stl-oferta">
      <table className="stl-oferta-tabla">
        <Editable as="caption" className="stl-oferta-caption" editable={editable} value={data.tituloTabla}
          placeholder="Título de la tabla (ej. Propuesta de pago · 3 meses iniciales)…"
          onCommit={(v) => set({ tituloTabla: v })} />
        <thead>
          {/* Las celdas llevan `scope`, que `Editable` no sabe rendir: el campo va
              ADENTRO y solo en edición, así la tabla de lectura queda igual que hoy.
              Las filas tampoco se arrastran — un `<div>` dentro de un `<tbody>` lo
              expulsa el parser (misma razón que la tabla de propiedades). */}
          <tr>
            <th scope="col">
              {editable ? (
                <Editable as="span" editable value={enc.concepto} placeholder="Concepto"
                  onCommit={(v) => setEnc({ concepto: v })} />
              ) : (
                enc.concepto
              )}
            </th>
            <th scope="col">
              {editable ? (
                <Editable as="span" editable value={enc.quincenal} placeholder="Quincenal"
                  onCommit={(v) => setEnc({ quincenal: v })} />
              ) : (
                enc.quincenal
              )}
            </th>
            <th scope="col">
              {editable ? (
                <Editable as="span" editable value={enc.mensual} placeholder="Mensual"
                  onCommit={(v) => setEnc({ mensual: v })} />
              ) : (
                enc.mensual
              )}
            </th>
            {editable && <th aria-label="Acciones" />}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            // `stl-item` acá NO posiciona nada: la celda de acciones deja el × en el
            // flujo (`.stl-props-actions`) y esta clase es la que lo revela al hover.
            <tr key={i} className={editable ? "stl-item" : undefined}>
              <th scope="row">
                {editable ? (
                  <Editable as="span" editable value={f.concepto} placeholder="Puesto o concepto…"
                    onCommit={(v) => setFila(i, { concepto: v })} />
                ) : (
                  f.concepto
                )}
              </th>
              <td>
                {editable ? (
                  <Editable as="span" editable value={f.quincenal} placeholder="$0.00"
                    onCommit={(v) => setFila(i, { quincenal: v })} />
                ) : (
                  f.quincenal
                )}
              </td>
              <td>
                {editable ? (
                  <Editable as="span" editable value={f.mensual} placeholder="$0.00"
                    onCommit={(v) => setFila(i, { mensual: v })} />
                ) : (
                  f.mensual
                )}
              </td>
              {editable && (
                <td className="stl-props-actions">
                  <RemoveBtn title="Quitar fila" onClick={() => set({ filas: removeAt(filas, i) })} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <AddBtn label="Agregar fila"
          onClick={() => set({ filas: appendItem(filas, { concepto: "", quincenal: "", mensual: "" }) })} />
      )}

      {(editable || destacados.length > 0) && (
        <SortableItems items={destacados} disabled={!editable} onReorder={(next) => set({ destacados: next })}
          container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
          {(d, i, handle) => (
            <div className={itemCls(editable, `stl-card stl-oferta-destacado${d.enfasis ? " is-enfasis" : ""}`)}>
              {handle}
              {editable && (
                <RemoveBtn title="Quitar destacado" onClick={() => set({ destacados: removeAt(destacados, i) })} />
              )}
              <Editable as="h3" className="stl-card-title" editable={editable} value={d.titulo}
                placeholder="Título del destacado (ej. Comisión por expansión)…"
                onCommit={(v) => setDestacado(i, { titulo: v })} />
              <Editable as="p" className="stl-card-detail" editable={editable} value={d.texto}
                placeholder="Qué incluye, en 1-2 líneas…" onCommit={(v) => setDestacado(i, { texto: v })} />
            </div>
          )}
        </SortableItems>
      )}
      {editable && (
        <AddBtn label="Agregar destacado"
          onClick={() => set({ destacados: appendItem(destacados, { titulo: "", texto: "" }) })} />
      )}

      {/* Los bloques (otros detalles / beneficios) van EN UNA MISMA FILA: son
          dos listas del mismo peso y apiladas alargaban la sección de gusto. */}
      {(editable || bloques.length > 0) && (
        <SortableItems items={bloques} disabled={!editable} onReorder={(next) => set({ bloques: next })}
          container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
          {(b, i, handle) => {
            const lineas = Array.isArray(b.items) ? b.items : [];
            return (
              <div className={itemCls(editable, "stl-card stl-oferta-bloque")}>
                {handle}
                {editable && (
                  <RemoveBtn title="Quitar bloque" onClick={() => set({ bloques: removeAt(bloques, i) })} />
                )}
                <Editable as="h3" className="stl-card-title" editable={editable} value={b.titulo}
                  placeholder="Título del bloque (ej. Beneficios de la contratación)…"
                  onCommit={(v) => setBloque(i, { titulo: v })} />
                <ul className="stl-checklist">
                  {lineas.map((it, j) => (
                    <li key={j} className={editable ? "stl-item" : undefined}>
                      {editable && (
                        <RemoveBtn title="Quitar línea" onClick={() => setBloque(i, { items: removeAt(lineas, j) })} />
                      )}
                      <span className="stl-check" aria-hidden>
                        {IconCheck}
                      </span>
                      <Editable as="span" editable={editable} value={it} placeholder="Una línea del bloque…"
                        onCommit={(v) => setBloque(i, { items: replaceAt(lineas, j, v) })} />
                    </li>
                  ))}
                </ul>
                {editable && (
                  <AddBtn label="Agregar línea" onClick={() => setBloque(i, { items: appendItem(lineas, "") })} />
                )}
              </div>
            );
          }}
        </SortableItems>
      )}
      {editable && (
        <AddBtn label="Agregar bloque" onClick={() => set({ bloques: appendItem(bloques, { titulo: "", items: [] }) })} />
      )}
    </div>
  );
};
