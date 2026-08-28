/**
 * lib/ui/prestamo-de-title.ts
 *
 * El `title` que la capa de ayuda le PRESTA al sistema operativo — y le devuelve.
 *
 * ── POR QUÉ ES UN PRÉSTAMO Y NO UNA MIGRACIÓN ───────────────────────────────────
 * `TooltipLayer` tiene que sacarle el `title` al elemento: si lo deja puesto, el navegador
 * pinta su caja negra ENCIMA del tooltip con tema. Durante un tiempo eso se hizo como una
 * migración definitiva — se guardaba el texto en un `data-nexus-tip` sobre el mismo nodo y
 * el `title` no volvía nunca.
 *
 * ⚠ Eso rompía la hidratación, y el defecto era real, no teórico. La capa vive en el shell,
 * que hidrata PRIMERO, y escucha el documento entero. Una pantalla grande —`/clients`— pinta
 * su HTML y recién después React hidrata ese subárbol; si el cursor pasa por encima en esa
 * ventana, la capa le saca el `title` a un nodo que React todavía no tocó. Cuando React llega,
 * su prop dice `title="27/5/2026, 13:30:00"` y el DOM ya no lo tiene:
 *
 *     + title="27/5/2026, 13:30:00"        ← lo que React renderiza
 *     - title={null}                       ← lo que encontró en el DOM
 *     - data-nexus-tip="27/5/2026, …"      ← lo que había puesto esta capa
 *
 * El `data-nexus-tip` es la huella que delata al culpable: no hay un solo componente en la
 * app que lo escriba, así que solo pudo ponerlo la capa.
 *
 * El préstamo cierra las dos mitades: el texto se guarda FUERA del DOM (un `WeakMap`, que
 * además deja que el nodo se recolecte solo cuando la fila se desmonta) y el `title` se
 * devuelve al salir. El nodo vuelve a quedar exactamente como React lo dejó, así que la
 * divergencia dura lo que dura el hover en vez de lo que dura la página.
 *
 * ── POR QUÉ ES UN MÓDULO PURO Y NO CÓDIGO ADENTRO DEL COMPONENTE ────────────────
 * Los dos proyectos de vitest corren en `node` y el repo no tiene jsdom: adentro del `.tsx`
 * esto solo se podría afirmar leyendo el archivo como texto, que es lo que hace hoy
 * `lib/ui/tooltips.test.ts`. Acá el contrato se prueba de verdad —adoptar, devolver, y el
 * caso del botón mudo— contra un nodo de mentira que implementa las cuatro operaciones.
 */

/** Lo mínimo de un `HTMLElement` que hace falta para prestar y devolver. */
export interface NodoConAtributos {
  getAttribute(nombre: string): string | null;
  setAttribute(nombre: string, valor: string): void;
  removeAttribute(nombre: string): void;
  readonly textContent: string | null;
}

interface Prestamo {
  /** El `title` original, tal cual lo escribió React. Se devuelve carácter por carácter. */
  texto: string;
  /** ¿El `aria-label` lo puso esta capa? Solo entonces se saca al devolver. */
  ariaPropio: boolean;
}

export interface PrestamoDeTitle {
  /** Saca el `title` y devuelve su texto. `null` si el elemento no tenía nada que decir. */
  adoptar(el: NodoConAtributos): string | null;
  /** Deja el nodo como estaba. Idempotente: devolver dos veces no duplica nada. */
  devolver(el: NodoConAtributos | null): void;
  /** ¿Este nodo tiene el `title` prestado ahora mismo? */
  enPrestamo(el: NodoConAtributos): boolean;
}

export function crearPrestamoDeTitle(): PrestamoDeTitle {
  const prestados = new WeakMap<NodoConAtributos, Prestamo>();

  return {
    adoptar(el) {
      const ya = prestados.get(el);
      if (ya) return ya.texto;

      const nativo = el.getAttribute("title");
      if (!nativo || !nativo.trim()) return null;

      /* El `title` puede haber sido el ÚNICO nombre accesible del elemento (un botón que es
         solo un ícono). Sacarlo sin dejar nada lo deja mudo para un lector de pantalla, así
         que se copia a `aria-label` — y se anota que fue esta capa quien lo puso, porque al
         devolver hay que sacar ese y NO el que ya venía del componente. */
      const tieneNombre =
        !!el.getAttribute("aria-label") ||
        !!el.getAttribute("aria-labelledby") ||
        (el.textContent ?? "").trim().length > 0;

      prestados.set(el, { texto: nativo, ariaPropio: !tieneNombre });
      el.removeAttribute("title");
      if (!tieneNombre) el.setAttribute("aria-label", nativo);
      return nativo;
    },

    devolver(el) {
      if (!el) return;
      const p = prestados.get(el);
      if (!p) return;
      prestados.delete(el);
      el.setAttribute("title", p.texto);
      if (p.ariaPropio) el.removeAttribute("aria-label");
    },

    enPrestamo(el) {
      return prestados.has(el);
    },
  };
}

/** Lo mínimo de un `Node` para saber quién está adentro de quién. */
export interface NodoAnidado {
  contains(otro: NodoAnidado | null): boolean;
}

/**
 * Cuál de los dos elementos dispara el tooltip.
 *
 * ⚠ Existe por una consecuencia directa del préstamo: al elemento que tiene el `title`
 * prestado **`closest("[title]")` ya no lo encuentra**, porque el atributo no está puesto.
 * Sin este rescate, mover el mouse un pixel DENTRO del elemento que acaba de abrir su
 * tooltip lo daría por abandonado y lo cerraría — el parpadeo clásico.
 *
 * El desempate reproduce el orden que daba `closest` cuando el atributo seguía puesto: gana
 * el que está MÁS CERCA del cursor. Si adentro del prestado hay otro `title`, ese gana.
 */
export function disparadorEntre<T extends NodoAnidado>(
  prestado: T | null,
  conTitle: T | null,
  target: NodoAnidado,
): T | null {
  if (!prestado) return conTitle;
  if (prestado !== target && !prestado.contains(target)) return conTitle;
  if (conTitle && prestado.contains(conTitle)) return conTitle;
  return prestado;
}

/**
 * ¿Ya se puede tocar el DOM?
 *
 * ⚠ Cierra la mitad que el préstamo solo no alcanza a cerrar. Devolver el `title` al salir
 * achica la ventana de riesgo a "mientras el cursor está encima" — pero eso es exactamente lo
 * que hace alguien esperando que cargue una tabla: deja el mouse quieto sobre una fila. Si la
 * hidratación de ese subárbol cae en ese rato, el error vuelve.
 *
 * Mientras el documento sigue llegando (`readyState === "loading"`) hay HTML pintado que React
 * todavía no hidrató, y esa es la ventana entera. La capa se abstiene: el `title` se queda
 * puesto y lo pinta el sistema operativo. Un segundo de caja negra a cambio de no romper la
 * pantalla — y se cura solo apenas termina de cargar, sin recargar ni volver a pasar el mouse.
 */
export function sePuedePrestar(estado: DocumentReadyState): boolean {
  return estado !== "loading";
}
