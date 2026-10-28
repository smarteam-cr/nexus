"use client";

/**
 * components/external/test/ComboConBuscador.tsx — un campo con buscador para elegir de una lista (cómo gestionan a sus clientes, industria y
 * país del teléfono en la portada del test). Calca el de la aplicación vieja: al entrar se vacía y muestra toda la lista,
 * lo escrito la filtra sin importar tildes, se navega con ↑ ↓ Enter y Esc, y al salir sin elegir vuelve lo que estaba.
 * Solo acepta una opción de la lista: si lo escrito no es una, se borra. Página del cliente: las clases de diagnostico.css.
 */
import { useId, useRef, useState } from "react";
import { filtrar, opcionExacta } from "@/lib/tests-diagnostico/formulario";

export default function ComboConBuscador({
  id,
  opciones,
  valor,
  alCambiar,
  alEscribir,
  placeholder,
  invalido = false,
  etiquetaAccesible,
  className = "",
}: {
  id: string;
  opciones: readonly string[];
  valor: string;
  alCambiar: (v: string) => void;
  /** Al escribir (sin elegir todavía): para borrar el mensaje de error en vivo, como la aplicación vieja. */
  alEscribir?: () => void;
  placeholder: string;
  invalido?: boolean;
  etiquetaAccesible?: string;
  className?: string;
}) {
  const lista = useId();
  const [abierta, setAbierta] = useState(false);
  const [escrito, setEscrito] = useState<string | null>(null);
  const [resaltada, setResaltada] = useState(-1);
  const ref = useRef<HTMLUListElement>(null);
  const items = filtrar(opciones, escrito ?? "");

  const elegir = (v: string) => {
    alCambiar(v);
    setEscrito(null);
    setAbierta(false);
    setResaltada(-1);
  };
  const mover = (n: number) => {
    if (!items.length) return;
    const i = (n + items.length) % items.length;
    setResaltada(i);
    ref.current?.children[i]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className={`combo ${className}`}>
      <input
        id={id}
        className={`composer-input combo-input${invalido ? " is-invalid" : ""}`}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={abierta}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-label={etiquetaAccesible}
        aria-invalid={invalido || undefined}
        placeholder={placeholder}
        // Mientras busca se ve lo que escribe; si no, lo elegido.
        value={escrito ?? valor}
        onFocus={() => {
          setEscrito("");
          setAbierta(true);
          setResaltada(-1);
        }}
        onChange={(e) => {
          setEscrito(e.target.value);
          setAbierta(true);
          setResaltada(-1);
          alEscribir?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!abierta) setAbierta(true);
            else mover(resaltada + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            mover(resaltada - 1);
          } else if (e.key === "Enter" && abierta && resaltada >= 0 && items[resaltada]) {
            e.preventDefault();
            elegir(items[resaltada]);
          } else if (e.key === "Enter" && escrito && (opcionExacta(opciones, escrito) || items.length === 1)) {
            // Escribió la opción entera (o lo escrito deja una sola): Enter la elige, no manda el formulario a medias.
            e.preventDefault();
            elegir(opcionExacta(opciones, escrito) ?? items[0]);
          } else if (e.key === "Escape") {
            setAbierta(false);
          }
        }}
        onBlur={() => {
          // Lo escrito vale si es una opción; si no escribió nada (o algo que no está), queda lo que había.
          const exacta = escrito ? opcionExacta(opciones, escrito) : null;
          if (exacta) alCambiar(exacta);
          setEscrito(null);
          setAbierta(false);
        }}
      />
      {abierta && (
        <ul ref={ref} id={lista} className="combo-list" role="listbox">
          {items.length ? (
            items.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={i === resaltada}
                className={`combo-opt${i === resaltada ? " is-on" : ""}`}
                // mousedown gana al blur del campo.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
              >
                {o}
              </li>
            ))
          ) : (
            <li className="combo-empty">Sin coincidencias.</li>
          )}
        </ul>
      )}
    </div>
  );
}
