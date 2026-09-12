"use client";

/**
 * components/documentacion/SelectorDeIcono.tsx — el ícono de una página.
 *
 * Es una GRILLA CON BUSCADOR, no una lista. La primera versión reusó `Menu`, que apila un ítem por
 * fila: con cuarenta emojis quedaba una columna altísima tapando media pantalla para elegir un
 * dibujo de 16 píxeles. Un selector de íconos se escanea con la vista y se filtra escribiendo.
 *
 * ── DOS DETALLES QUE SE VEÍAN MAL Y POR QUÉ ESTÁN ASÍ ────────────────────────
 * · El botón NO lleva `title`. La capa global de tooltips lo dibujaba justo debajo, y como el
 *   ícono vive arriba del todo, el globo tapaba el título de la página. El botón ya se explica
 *   solo (cambia de fondo al apuntarlo) y conserva su `aria-label` para lectores de pantalla.
 * · Sin ícono no se muestra un emoji gris de relleno: aparece «Agregar ícono», que es una acción.
 *   Un ícono por defecto enorme parece elegido cuando nadie eligió nada.
 *
 * La mecánica flotante sí es la de la casa (`usePanelFlotante`): posición fija calculada desde el
 * botón, el scroll externo cierra, Escape devuelve el foco y las flechas recorren las opciones.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { usePanelFlotante } from "@/components/ui";
import { normalizarTexto } from "@/lib/ui/text-search";
import { IconoDocumento } from "./iconos";

/** Los íconos ofrecidos, con el nombre por el que se buscan. El orden es el de la grilla. */
const ICONOS: [emoji: string, nombre: string][] = [
  ["📄", "documento hoja pagina"],
  ["📝", "nota escribir"],
  ["📚", "libros biblioteca"],
  ["🗂️", "carpetas archivo"],
  ["🧭", "brujula guia manual"],
  ["🗺️", "mapa recorrido"],
  ["📌", "chinche fijar"],
  ["🔖", "marcador etiqueta"],
  ["📈", "grafico crecimiento escala"],
  ["📊", "tablero datos metricas"],
  ["🎯", "objetivo meta"],
  ["🏁", "meta final cierre"],
  ["✅", "listo hecho aprobado"],
  ["⚠️", "aviso cuidado riesgo"],
  ["⛔", "prohibido no"],
  ["💡", "idea propuesta"],
  ["💼", "ventas negocio trabajo"],
  ["📣", "marketing anuncio comunicacion"],
  ["🎧", "servicio soporte atencion"],
  ["🤝", "acuerdo alianza traspaso"],
  ["👥", "equipo personas roles"],
  ["🧑‍💻", "desarrollo tecnico"],
  ["🛠️", "herramientas implementacion"],
  ["⚙️", "configuracion ajustes"],
  ["🔍", "buscar analisis diagnostico"],
  ["🧩", "pieza integracion"],
  ["🧱", "base cimiento"],
  ["🔐", "permisos seguridad acceso"],
  ["🔔", "alerta recordatorio"],
  ["⏱️", "tiempo cronograma plazo"],
  ["📅", "calendario agenda"],
  ["💬", "conversacion chat reunion"],
  ["💰", "plata cobranza finanzas"],
  ["🧾", "factura cobro"],
  ["🚀", "arranque kickoff lanzamiento"],
  ["🌱", "crecimiento inicio"],
  ["⭐", "destacado importante"],
  ["🧠", "conocimiento aprendizaje"],
  ["🪄", "automatizacion magia ia"],
  ["❓", "duda pregunta faq"],
  ["🏷️", "etiqueta tag"],
  ["📥", "entrada recibido"],
  ["📤", "salida enviado"],
  ["🗃️", "registro base datos"],
  ["🧪", "prueba experimento"],
  ["🔗", "enlace conexion"],
  ["📦", "entrega paquete"],
  ["🏗️", "construccion en obra"],
];

interface Props {
  icono: string | null;
  /** Falso = solo se muestra, sin abrir nada. */
  editable: boolean;
  onElegir: (icono: string | null) => void;
}

export default function SelectorDeIcono({ icono, editable, onElegir }: Props) {
  const { abierto, setAbierto, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({
    side: "bottom",
    align: "start",
    selectorDeItems: '[role="menuitem"]',
  });
  const [filtro, setFiltro] = useState("");

  const visibles = useMemo(() => {
    const q = normalizarTexto(filtro);
    if (!q) return ICONOS;
    return ICONOS.filter(([, nombre]) => normalizarTexto(nombre).includes(q));
  }, [filtro]);

  if (!editable) {
    return icono ? (
      <span className="text-4xl leading-none" aria-hidden="true">
        {icono}
      </span>
    ) : null;
  }

  const elegir = (valor: string | null) => {
    setAbierto(false);
    setFiltro("");
    onElegir(valor);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={icono ? "Cambiar el ícono de la página" : "Agregar un ícono a la página"}
        className={cn(
          "rounded-lg transition-colors hover:bg-surface-hover",
          icono
            ? "-ml-1 px-1 text-4xl leading-none"
            : "flex items-center gap-1.5 px-2 py-1 text-xs text-fg-muted hover:text-fg",
        )}
      >
        {icono ?? (
          <>
            <IconoDocumento className="h-4 w-4" />
            Agregar ícono
          </>
        )}
      </button>

      {abierto && pos && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Íconos"
          className="fixed z-50 w-80 rounded-xl border border-line bg-surface p-2 shadow-xl"
          style={{ ...pos, maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}
        >
          <input
            autoFocus
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar un ícono…"
            className="mb-2 w-full rounded-md border border-line bg-surface-muted px-2 py-1.5 text-xs text-fg placeholder:text-fg-muted"
          />

          {visibles.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-fg-muted">Ninguno coincide.</p>
          ) : (
            <div className="grid grid-cols-8 gap-1">
              {visibles.map(([emoji, nombre]) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  onClick={() => elegir(emoji)}
                  aria-label={nombre}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-surface-hover",
                    emoji === icono && "bg-surface-active ring-1 ring-line",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {icono && (
            <button
              type="button"
              role="menuitem"
              onClick={() => elegir(null)}
              className="mt-2 w-full rounded-md border-t border-line px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              Quitar el ícono
            </button>
          )}
        </div>
      )}
    </div>
  );
}
