"use client";

/**
 * components/documentacion/PanelDelArbolAjustable.tsx — el panel del árbol, con el ancho que elige
 * cada persona.
 *
 * Se arrastra el borde derecho; doble clic vuelve al ancho de siempre; con el teclado, las flechas
 * (Shift, de a más). El ancho se guarda en una cookie al soltar y el layout la lee en el servidor:
 * la próxima vez la página nace con ese ancho, sin salto.
 *
 * El árbol llega como `children`, ya armado en el servidor: arrastrar solo cambia el ancho de la
 * caja, no vuelve a pedir las páginas.
 */
import { useRef, useState } from "react";
import {
  ANCHO_DEL_ARBOL,
  COOKIE_ANCHO_DEL_ARBOL,
  acotarAncho,
} from "@/lib/documentacion/ancho-del-arbol";

/** Un año, igual que `nexus-sidebar`. */
function guardarAncho(ancho: number) {
  document.cookie = `${COOKIE_ANCHO_DEL_ARBOL}=${ancho};path=/;max-age=31536000;SameSite=Lax`;
}

/** Lo que mueve cada flecha del teclado; con Shift, el triple. */
const PASO_DE_TECLADO = 16;

export default function PanelDelArbolAjustable({
  anchoInicial,
  children,
}: {
  anchoInicial: number;
  children: React.ReactNode;
}) {
  const [ancho, setAncho] = useState(anchoInicial);
  const [arrastrando, setArrastrando] = useState(false);
  // Dónde arrancó el arrastre: el ancho sale de cuánto se movió el puntero desde ahí.
  const inicio = useRef<{ x: number; ancho: number } | null>(null);

  const fijar = (px: number) => {
    const acotado = acotarAncho(px);
    setAncho(acotado);
    guardarAncho(acotado);
  };

  const soltar = (px: number) => {
    if (!inicio.current) return;
    inicio.current = null;
    setArrastrando(false);
    fijar(px);
  };

  return (
    <div
      className="sticky top-0 hidden h-[calc(100vh-1px)] shrink-0 lg:block"
      style={{ width: ancho }}
    >
      <aside className="h-full overflow-y-auto border-r border-line bg-surface-muted px-2 py-4">
        {children}
      </aside>

      {/* La zona de agarre: 12 px centrados sobre el borde, más fácil de atrapar que la línea de 1 px.
          Va afuera del `aside` porque adentro se iría con el scroll del árbol. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho del panel de páginas"
        aria-valuemin={ANCHO_DEL_ARBOL.minimo}
        aria-valuemax={ANCHO_DEL_ARBOL.maximo}
        aria-valuenow={ancho}
        tabIndex={0}
        title="Arrastra para cambiar el ancho · doble clic para volver al de siempre"
        className="group absolute inset-y-0 -right-1.5 w-3 cursor-col-resize touch-none outline-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          // Sin esto, arrastrar selecciona el texto del árbol y de la página.
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          inicio.current = { x: e.clientX, ancho };
          setArrastrando(true);
        }}
        onPointerMove={(e) => {
          const desde = inicio.current;
          if (desde) setAncho(acotarAncho(desde.ancho + e.clientX - desde.x));
        }}
        onPointerUp={(e) => {
          const desde = inicio.current;
          if (desde) soltar(desde.ancho + e.clientX - desde.x);
        }}
        // Si el navegador corta el arrastre, queda donde estaba.
        onPointerCancel={() => soltar(ancho)}
        onDoubleClick={() => fijar(ANCHO_DEL_ARBOL.porDefecto)}
        onKeyDown={(e) => {
          const paso = e.shiftKey ? PASO_DE_TECLADO * 3 : PASO_DE_TECLADO;
          const destino: Record<string, number> = {
            ArrowLeft: ancho - paso,
            ArrowRight: ancho + paso,
            Home: ANCHO_DEL_ARBOL.minimo,
            End: ANCHO_DEL_ARBOL.maximo,
          };
          if (!(e.key in destino)) return;
          e.preventDefault();
          fijar(destino[e.key]);
        }}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
            arrastrando
              ? "bg-brand"
              : "bg-transparent group-hover:bg-brand/60 group-focus-visible:bg-brand"
          }`}
        />
      </div>
    </div>
  );
}
