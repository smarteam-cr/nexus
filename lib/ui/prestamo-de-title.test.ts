/**
 * lib/ui/prestamo-de-title.test.ts
 *
 * Correr: `npx vitest run lib/ui/prestamo-de-title.test.ts --project unit`.
 *
 * El contrato que hace que la capa de ayuda no rompa la hidratación: **un nodo que pasó por
 * adoptar + devolver tiene que quedar EXACTAMENTE como estaba**. React compara atributo por
 * atributo cuando hidrata; cualquier cosa que la capa deje puesta —o se lleve— es una
 * diferencia que React reporta y no repara.
 *
 * Por eso las afirmaciones centrales no miran un atributo: comparan el mapa entero.
 */
import { describe, it, expect } from "vitest";
import {
  crearPrestamoDeTitle,
  disparadorEntre,
  sePuedePrestar,
  type NodoAnidado,
  type NodoConAtributos,
} from "./prestamo-de-title";

/** Un nodo de mentira con las cuatro operaciones que usa el préstamo. */
function nodo(attrs: Record<string, string> = {}, texto = "") {
  const mapa: Record<string, string> = { ...attrs };
  const el: NodoConAtributos & { attrs: Record<string, string> } = {
    attrs: mapa,
    textContent: texto,
    getAttribute: (n) => (n in mapa ? mapa[n]! : null),
    setAttribute: (n, v) => {
      mapa[n] = v;
    },
    removeAttribute: (n) => {
      delete mapa[n];
    },
  };
  return el;
}

const FECHA = "27/5/2026, 13:30:00";

describe("el nodo vuelve como React lo dejó", () => {
  it("ida y vuelta deja el mapa de atributos IDÉNTICO — es el contrato de hidratación", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ class: "text-fg-muted whitespace-nowrap", title: FECHA }, "hace 3 sem");
    const antes = { ...el.attrs };

    p.adoptar(el);
    p.devolver(el);

    expect(el.attrs).toEqual(antes);
  });

  it("mientras dura el préstamo NO deja ningún atributo propio en el nodo", () => {
    /* La versión vieja guardaba el texto en un `data-nexus-tip` sobre el elemento, y ESE
       atributo —que ningún componente escribe— era la mitad visible del error de hidratación.
       El texto ahora vive en un WeakMap: el DOM no se entera. */
    const p = crearPrestamoDeTitle();
    const el = nodo({ class: "x", title: FECHA }, "hace 3 sem");

    p.adoptar(el);

    expect(Object.keys(el.attrs).filter((k) => k.startsWith("data-"))).toEqual([]);
    expect(el.attrs).toEqual({ class: "x" });
  });

  it("devuelve el texto carácter por carácter, incluidos los separadores", () => {
    const p = crearPrestamoDeTitle();
    const largo = `Última reunión: Kickoff Wherex · ${FECHA}`;
    const el = nodo({ title: largo }, "ayer");

    expect(p.adoptar(el)).toBe(largo);
    p.devolver(el);
    expect(el.attrs.title).toBe(largo);
  });
});

describe("el nombre accesible", () => {
  it("un botón de solo ícono no queda mudo: el `title` se copia a `aria-label`", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: "Cerrar" }, "");

    p.adoptar(el);

    expect(el.attrs["aria-label"]).toBe("Cerrar");
    expect(el.attrs.title).toBeUndefined();
  });

  it("ese `aria-label` prestado se retira al devolver — si no, queda basura para siempre", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: "Cerrar" }, "");

    p.adoptar(el);
    p.devolver(el);

    expect(el.attrs).toEqual({ title: "Cerrar" });
  });

  it("un `aria-label` que ya venía del componente NO se toca ni al adoptar ni al devolver", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: "Ver detalle", "aria-label": "Abrir la cuenta de Wherex" }, "");

    p.adoptar(el);
    expect(el.attrs["aria-label"]).toBe("Abrir la cuenta de Wherex");

    p.devolver(el);
    expect(el.attrs).toEqual({ title: "Ver detalle", "aria-label": "Abrir la cuenta de Wherex" });
  });

  it("un elemento con texto propio ya tiene nombre: no se le agrega `aria-label`", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: FECHA }, "hace 3 sem");

    p.adoptar(el);

    expect(el.attrs["aria-label"]).toBeUndefined();
  });

  it("`aria-labelledby` también cuenta como nombre", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: "Ayuda", "aria-labelledby": "rotulo-7" }, "");

    p.adoptar(el);

    expect(el.attrs["aria-label"]).toBeUndefined();
  });
});

describe("los bordes", () => {
  it("sin `title` no hay nada que prestar y el nodo queda intacto", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ class: "x" }, "texto");

    expect(p.adoptar(el)).toBeNull();
    expect(p.enPrestamo(el)).toBe(false);
    expect(el.attrs).toEqual({ class: "x" });
  });

  it("un `title` de puros espacios se trata como vacío y NO se saca", () => {
    /* Sacarlo pintaría un globo en blanco y además cambiaría el DOM sin ganar nada. */
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: "   " }, "texto");

    expect(p.adoptar(el)).toBeNull();
    expect(el.attrs.title).toBe("   ");
  });

  it("adoptar dos veces no pierde el texto — `pointerover` llega repetido al recorrer una fila", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: FECHA }, "hace 3 sem");

    expect(p.adoptar(el)).toBe(FECHA);
    expect(p.adoptar(el)).toBe(FECHA);

    p.devolver(el);
    expect(el.attrs.title).toBe(FECHA);
  });

  it("devolver algo que nunca se prestó no inventa un `title`", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ class: "x" }, "texto");

    p.devolver(el);

    expect(el.attrs).toEqual({ class: "x" });
  });

  it("devolver dos veces es idempotente", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: "Cerrar" }, "");

    p.adoptar(el);
    p.devolver(el);
    el.setAttribute("aria-label", "puesto después por el componente");
    p.devolver(el);

    expect(el.attrs["aria-label"]).toBe("puesto después por el componente");
  });

  it("devolver `null` no explota: la capa arranca sin nada prestado", () => {
    const p = crearPrestamoDeTitle();
    expect(() => p.devolver(null)).not.toThrow();
  });

  it("dos nodos a la vez no se pisan el texto", () => {
    const p = crearPrestamoDeTitle();
    const a = nodo({ title: "uno" }, "a");
    const b = nodo({ title: "dos" }, "b");

    p.adoptar(a);
    p.adoptar(b);
    p.devolver(a);
    p.devolver(b);

    expect(a.attrs.title).toBe("uno");
    expect(b.attrs.title).toBe("dos");
  });

  it("`enPrestamo` dice la verdad antes, durante y después", () => {
    const p = crearPrestamoDeTitle();
    const el = nodo({ title: FECHA }, "hace 3 sem");

    expect(p.enPrestamo(el)).toBe(false);
    p.adoptar(el);
    expect(p.enPrestamo(el)).toBe(true);
    p.devolver(el);
    expect(p.enPrestamo(el)).toBe(false);
  });
});

describe("quién dispara el tooltip cuando el `title` está prestado", () => {
  /** Un árbol de mentira: cada nodo sabe quiénes son sus descendientes. */
  function arbol() {
    const hijos = new Map<object, Set<object>>();
    const nuevo = (nombre: string) => {
      const n = {
        nombre,
        contains(otro: NodoAnidado | null): boolean {
          return otro === n || (otro !== null && (hijos.get(n)?.has(otro) ?? false));
        },
      };
      return n;
    };
    const meter = (padre: object, ...dentro: object[]) => {
      const s = hijos.get(padre) ?? new Set<object>();
      dentro.forEach((d) => s.add(d));
      hijos.set(padre, s);
    };
    return { nuevo, meter };
  }

  it("sin nada prestado manda `closest`, como siempre", () => {
    const { nuevo } = arbol();
    const celda = nuevo("celda");
    expect(disparadorEntre(null, celda, celda)).toBe(celda);
    expect(disparadorEntre(null, null, celda)).toBeNull();
  });

  it("el prestado se rescata: mover el mouse DENTRO no cierra el tooltip", () => {
    /* Es el defecto que este desempate evita. La celda tiene el `title` prestado, así que
       `closest("[title]")` no la ve y devolvería null o un ancestro: sin rescate, el tooltip
       que acaba de abrir se cerraría al mover un pixel. */
    const { nuevo, meter } = arbol();
    const celda = nuevo("celda");
    const textoAdentro = nuevo("texto");
    meter(celda, textoAdentro);

    expect(disparadorEntre(celda, null, textoAdentro)).toBe(celda);
    expect(disparadorEntre(celda, null, celda)).toBe(celda);
  });

  it("un ancestro con `title` NO le gana al prestado que está más cerca del cursor", () => {
    const { nuevo, meter } = arbol();
    const fila = nuevo("fila");
    const celda = nuevo("celda");
    meter(fila, celda);

    expect(disparadorEntre(celda, fila, celda)).toBe(celda);
  });

  it("un `title` ADENTRO del prestado sí le gana — es el orden que daba `closest`", () => {
    const { nuevo, meter } = arbol();
    const celda = nuevo("celda");
    const chip = nuevo("chip");
    meter(celda, chip);

    expect(disparadorEntre(celda, chip, chip)).toBe(chip);
  });

  it("con el cursor fuera del prestado manda `closest` — el préstamo se va a saldar", () => {
    const { nuevo } = arbol();
    const celda = nuevo("celda");
    const otra = nuevo("otra");

    expect(disparadorEntre(celda, otra, otra)).toBe(otra);
    expect(disparadorEntre(celda, null, otra)).toBeNull();
  });
});

describe("cuándo la capa se abstiene", () => {
  it("con el documento todavía llegando NO presta: ahí es donde nace el error", () => {
    /* Es la mitad que el préstamo solo no cierra. Devolver el `title` al salir achica la
       ventana a "mientras el cursor está encima" — que es justo lo que hace alguien esperando
       que cargue una tabla: deja el mouse quieto sobre una fila. */
    expect(sePuedePrestar("loading")).toBe(false);
  });

  it("una vez parseado el documento sí presta, sin esperar a las imágenes", () => {
    /* `interactive` ya alcanza: el HTML llegó entero y React hidrató. Esperar a `complete`
       dejaría la caja negra puesta mientras bajan las imágenes, que no tiene nada que ver. */
    expect(sePuedePrestar("interactive")).toBe(true);
    expect(sePuedePrestar("complete")).toBe(true);
  });
});
