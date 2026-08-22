"use client";

/**
 * components/landing/card-grid.tsx — UNA GRILLA DE TARJETAS, DOS SABORES.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
 * Elías, 2026-08-22: *«a veces las cards de kickoff son diferentes a las cards del canvas de
 * exploración. Me interesa que a nivel de motor eso esté estandarizado: card con ícono y card sin
 * ícono, y que sea completamente estándar en cuanto al CSS y a cómo el motor funciona por dentro»*.
 *
 * Medido antes de tocar nada: **el CSS ya era el mismo**. Las dos rinden `.stl-item .stl-card` con
 * `.stl-card-title` y `.stl-card-detail`, definidos una sola vez en `landing-engine.css`. Lo
 * duplicado era el JSX —el mismo markup escrito en dos archivos— y una diferencia real:
 * `PainSection` pisaba el token `.stl-card-icon` con un ámbar en línea.
 *
 * Así que esto no reescribe la presentación: le da UN dueño al markup que ya estaba repetido, y
 * deja las tres diferencias legítimas como PROPS —cuántas columnas, si lleva ícono, si tiene
 * intro—. El ámbar sigue existiendo, pero ahora es una decisión declarada de quien la usa y no un
 * estilo quemado en el componente compartido.
 *
 * ⛔ NO toca los `schema` ni los `sectionType`: los agentes siguen emitiendo contra lo mismo y el
 * registro congelado no se entera. Esta es una unificación de render, no de contrato.
 */
import type { ReactNode } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";

/** Un ítem de tarjeta: titular corto arriba, explicación abajo. */
export interface ItemDeTarjeta {
  title: string;
  detail?: string;
}

/**
 * ⚠ GENÉRICO EN EL ÍTEM, y hace falta: cada sección tipa el suyo (unas exigen `detail`, otras no)
 * y algunas llevan campos propios que este componente no toca pero tiene que CONSERVAR. Con un
 * ítem fijo, el `replaceAt` de acá los borraría al editar el título.
 */
export interface CardGridProps<T extends ItemDeTarjeta> {
  items: T[];
  editable?: boolean;
  onItems: (items: T[]) => void;
  /** 2 para lectura pausada (kickoff), 4 para un vistazo (dolores). */
  columnas: 2 | 4;
  /** El ícono de la tarjeta N, si esta grilla lleva. */
  icono?: (i: number) => ReactNode;
  /**
   * El color del ícono, cuando no es el del tema.
   *
   * ⚠ Existe para no cambiarle la cara a lo que ya se publicó: los dolores de una propuesta salen
   * en ámbar desde siempre. Lo nuevo es que la excepción se DECLARA en quien la quiere, en vez de
   * estar quemada en el markup compartido pisando el token.
   */
  acentoIcono?: { background: string; color: string };
  addLabel: string;
  placeholderTitulo: string;
  placeholderDetalle: string;
}

export function CardGrid<T extends ItemDeTarjeta>({
  items,
  editable,
  onItems,
  columnas,
  icono,
  acentoIcono,
  addLabel,
  placeholderTitulo,
  placeholderDetalle,
}: CardGridProps<T>) {
  return (
  <>
    <SortableItems
      items={items}
      disabled={!editable}
      onReorder={onItems}
      container={(nodes) => <div className={`stl-grid stl-grid-${columnas}`}>{nodes}</div>}
    >
      {(it, i, handle) => (
        <div className="stl-item stl-card">
          {handle}
          {editable && <RemoveBtn onClick={() => onItems(removeAt(items, i))} />}
          {icono && (
            <div className="stl-card-icon" style={acentoIcono}>
              {icono(i)}
            </div>
          )}
          {/* Titular corto arriba, explicación abajo: las dos clases las define el motor una sola
              vez. Sin ellas el <h3> cae al reset y queda del mismo tamaño que el <p>. */}
          <Editable
            as="h3"
            className="stl-card-title"
            editable={editable}
            value={it.title}
            placeholder={placeholderTitulo}
            onCommit={(v) => onItems(replaceAt(items, i, { ...it, title: v }))}
          />
          <Editable
            as="p"
            className="stl-card-detail"
            editable={editable}
            value={it.detail ?? ""}
            placeholder={placeholderDetalle}
            onCommit={(v) => onItems(replaceAt(items, i, { ...it, detail: v }))}
          />
        </div>
      )}
    </SortableItems>
    {editable && (
      <AddBtn
        label={addLabel}
        onClick={() => onItems(appendItem(items, { title: "", detail: "" } as unknown as T))}
      />
    )}
  </>
  );
}
