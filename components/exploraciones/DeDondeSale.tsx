"use client";

/**
 * DeDondeSale — de dónde sale un dato del Resumen de La escala: lo dicho, quién y cuándo (y quién lo confirmó). SOLO en la
 * página interna (PaginaDeLaEscala › `edicion.deDonde`): el cliente nunca lo ve.
 *
 * Desde el 24 nov es un ícono (i) con las citas en un globo (Elías: el recuadro «Solo lo ves tú · de dónde sale» empujaba
 * el contenido hacia abajo). El globo es propio de esta página: el de la app (components/ui/Tooltip.tsx) muestra solo
 * texto plano de hasta 300 px, y aquí van varias citas con su autor y su fecha. Va en un portal con `position: fixed`
 * (usePanelFlotante): el marco de la página tiene `overflow-hidden` y un globo `absolute` quedaba cortado. Se abre al pasar
 * el cursor o con el foco, y sigue abierto mientras el cursor va hacia él y está encima (para leer o copiar una cita larga);
 * un clic (o Enter) lo deja abierto hasta tocar fuera o apretar Escape. Hex literal
 * (resultado.css): la página usa el estilo del cliente y no cambia de tema.
 *
 * `noSostiene`: la cifra se cambió a mano y la cita ya no la dice (queda para corregirla con lo que dijo la empresa); el
 * ícono va en ámbar.
 *
 * Desde el 25 nov va PEGADO AL FINAL del texto que sostiene, en su mismo renglón (la `cola` de TextoEditableDeLaPagina,
 * que lo une a la última palabra; Elías: caía debajo de cada línea).
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePanelFlotante } from "@/components/ui/usePanelFlotante";
import { zClass } from "@/lib/ui/z";
import type { CitaDelResumen } from "@/lib/exploraciones/resumen-de-la-escala";
import { diaCorto } from "@/lib/exploraciones/fechas";

/** Lo que espera el globo antes de cerrarse al sacar el cursor (lo que tarda en llegar a él). */
const MS_ANTES_DE_CERRAR = 200;

/** Lo que dice el globo arriba de las citas (y el nombre del ícono para un lector de pantalla). */
export function rotuloDeDondeSale(citas: readonly CitaDelResumen[], noSostiene: boolean): { titulo: string; nombre: string } {
  if (!citas.length) return { titulo: "Lo escribió tu equipo: no tiene cita.", nombre: "De dónde sale: lo escribió tu equipo, sin cita" };
  if (noSostiene) return { titulo: "Solo lo ves tú · la cita que tenía (no dice esta cifra):", nombre: "De dónde salía: la cita ya no dice esta cifra" };
  return { titulo: "Solo lo ves tú · de dónde sale:", nombre: `De dónde sale (${citas.length === 1 ? "una cita" : `${citas.length} citas`})` };
}

function IconoDeInformacion() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}

export default function DeDondeSale({ citas, noSostiene = false }: { citas: readonly CitaDelResumen[]; noSostiene?: boolean }) {
  const { abierto, alternar, cerrar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({ side: "bottom", align: "start", selectorDeItems: "[data-cita-del-globo]" });
  /** Abierto con un clic: no se cierra al sacar el cursor. */
  const [fijado, setFijado] = useState(false);
  const id = useId();
  const { titulo, nombre } = rotuloDeDondeSale(citas, noSostiene);
  /** Al sacar el cursor, un momento antes de cerrar: el que va hacia el globo llega antes de que se cierre. */
  const cierre = useRef<number | null>(null);
  const seguir = () => {
    if (cierre.current !== null) window.clearTimeout(cierre.current);
    cierre.current = null;
  };
  useEffect(() => seguir, []);
  const abrirSinFijar = () => {
    seguir();
    if (abierto) return;
    setFijado(false);
    alternar();
  };
  const soltar = () => {
    seguir();
    if (abierto && !fijado) cierre.current = window.setTimeout(cerrar, MS_ANTES_DE_CERRAR);
  };
  const alClic = () => {
    seguir();
    if (!abierto) {
      setFijado(true);
      alternar();
    } else if (!fijado) setFijado(true);
    else {
      setFijado(false);
      cerrar();
    }
  };
  return (
    <span ref={rootRef} className="rs-de-donde" onMouseEnter={abrirSinFijar} onMouseLeave={soltar}>
      <button
        ref={btnRef}
        type="button"
        className={`rs-de-donde-i${noSostiene && citas.length ? " rs-de-donde-aviso" : ""}`}
        aria-label={nombre}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        onFocus={abrirSinFijar}
        onBlur={soltar}
        onClick={alClic}
      >
        <IconoDeInformacion />
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="tooltip"
            className={`rs-de-donde-globo ${zClass("POPOVER")}`}
            style={{ position: "fixed", ...pos }}
            onMouseEnter={seguir}
            onMouseLeave={soltar}
          >
            <p className="rs-de-donde-k">{titulo}</p>
            {citas.length > 0 && (
              <ul>
                {citas.map((c) => (
                  <li key={`${c.reunion}-${c.turno}`}>
                    «{c.texto}» <span>{c.delEquipo ? `— lo dijo ${c.delEquipo.nombre} del equipo, ${diaCorto(c.delEquipo.en)}` : `— ${c.hablante}, ${diaCorto(c.fecha)}`}</span>
                    {c.confirmo && <span> · lo confirmó {c.confirmo.hablante}: «{c.confirmo.texto}»</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
