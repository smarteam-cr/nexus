/**
 * lib/clients/filtro-cartera.ts — las VISTAS del índice de clientes, y todo lo que dicen.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * El índice tenía cuatro pestañas que parecían filtros y filtraban por una sola cosa: qué ES
 * la empresa (`Client.kind`). Una de las cuatro —«Internos»— decía 0 y no había forma de
 * llegar a lo que la persona buscaba: los clientes en los que hacemos trabajo de puertas
 * adentro. Eso NO es lo mismo: `kind = INTERNO` significa "la empresa somos nosotros"; el
 * trabajo interno lo marca cada PROYECTO. Dos ejes distintos con la misma palabra.
 *
 * Este archivo agrega el segundo eje: qué TIENE la empresa. No toca el primero, que es
 * load-bearing (`CS_CLIENT_WHERE` decide cartera, cobranza, vigilancia y acceso).
 *
 * ── LAS TRES REGLAS QUE VIVEN ACÁ Y NO EN EL COMPONENTE ─────────────────────
 * 1. **`contarVistas` LLAMA a `cumple`.** Un solo camino de código: el número de la píldora y
 *    la lista que se ve no pueden divergir. Contar en una pasada "optimizada" es exactamente
 *    cómo nacen los contadores que mienten.
 * 2. **`contarVistas(...).todos === filas.length`**, que es también el "Mostrando N" de la
 *    línea de verdad. Si el componente le pasara el array equivocado, el número se
 *    contradiría a la vista con la píldora de al lado.
 * 3. **El singular y el plural salen de una función.** Es el generador clásico de mentiras
 *    silenciosas ("1 clientes").
 *
 * ⚠ Selección ÚNICA a propósito. Con multi-selección, el número de una píldora no puede
 * significar a la vez "cuántas hay así" y "cuántas filas voy a ver": o baila al clickear o no
 * predice nada. Con selección única los dos significados colapsan en uno solo.
 */
import type { ClientKind } from "@prisma/client";
import { CLIENT_KIND_META } from "./kind";
import {
  estaEnEjecucion,
  tieneTrabajoInterno,
  type ResumenDeProyectos,
} from "./resumen-proyectos";

export type VistaDeCartera = "todos" | "con-proyecto" | "sin-proyecto" | "trabajo-interno";

export const VISTA_POR_DEFECTO: VistaDeCartera = "todos";

/** Lo mínimo que una fila tiene que traer para pasar por este motor. */
export interface FilaFiltrable {
  resumen: ResumenDeProyectos;
}

/** UNA vista = UN predicado + su copy. El mismo que filtra es el que produce el número. */
export interface VistaDef {
  key: VistaDeCartera;
  label: string;
  ayuda: string;
  cumple: (r: ResumenDeProyectos) => boolean;
}

export const VISTAS_DE_CARTERA: readonly VistaDef[] = [
  {
    key: "todos",
    label: "Todos",
    ayuda: "Todas las empresas de esta pestaña.",
    cumple: () => true,
  },
  {
    key: "con-proyecto",
    label: "Con proyecto abierto",
    ayuda:
      "Tiene al menos un proyecto abierto hoy (no cuenta el contenedor «Información del " +
      "cliente»). Incluye el trabajo interno: es trabajo que estamos haciendo, aunque no se " +
      "facture. Por eso este número puede no coincidir con el de Éxito del cliente ni con el " +
      "de Cobranza, que además exigen que el proyecto sea de cartera o facturable.",
    cumple: estaEnEjecucion,
  },
  {
    key: "sin-proyecto",
    label: "Sin proyecto abierto",
    ayuda:
      "No tiene ningún proyecto abierto. Es una ficha en el CRM, no una entrega en curso.",
    // Complementario EXACTO de «Con proyecto abierto»: se niega el mismo predicado, no se
    // escribe otro. Con `abiertos + cerrados === 0` —que es lo que uno escribe sin pensar—
    // las empresas que solo tienen el contenedor sentinel se caen de las dos y la suma deja
    // de dar el total.
    cumple: (r) => !estaEnEjecucion(r),
  },
  {
    key: "trabajo-interno",
    label: "Con trabajo interno",
    ayuda:
      "Tiene al menos un proyecto abierto marcado «Proyecto interno» en HubSpot. Es trabajo " +
      "que hacemos para nosotros: no se factura ni suma a la cartera de nadie. Distinto de la " +
      "pestaña «Somos Smarteam», que son las empresas que SOMOS nosotros.",
    cumple: tieneTrabajoInterno,
  },
] as const;

export function vistaPorKey(key: VistaDeCartera): VistaDef {
  const found = VISTAS_DE_CARTERA.find((v) => v.key === key);
  if (!found) throw new Error(`Vista de cartera desconocida: ${key}`);
  return found;
}

export function aplicarVista<T extends FilaFiltrable>(
  filas: readonly T[],
  vista: VistaDeCartera,
): readonly T[] {
  if (vista === "todos") return filas;
  const def = vistaPorKey(vista);
  return filas.filter((f) => def.cumple(f.resumen));
}

/**
 * Los contadores.
 *
 * ⚠ Recibe el array YA acotado por categoría × pertenencia × BÚSQUEDA. Ése es el punto: el
 * número de cada píldora es, literalmente, la cantidad de filas que verías si la clickearas
 * —también mientras escribís—. Un contador calculado antes de la búsqueda es un número
 * correcto sobre un universo que no es el que está en pantalla.
 */
export function contarVistas(filas: readonly FilaFiltrable[]): Record<VistaDeCartera, number> {
  const acc = Object.fromEntries(VISTAS_DE_CARTERA.map((v) => [v.key, 0])) as Record<
    VistaDeCartera,
    number
  >;
  for (const f of filas) {
    for (const v of VISTAS_DE_CARTERA) {
      if (v.cumple(f.resumen)) acc[v.key]++;
    }
  }
  return acc;
}

/**
 * Qué píldoras se renderizan.
 *
 * Solo las que PARTEN el universo accesible: una que deja pasar a todos y una que no deja
 * pasar a nadie se ven idénticas a una que funciona, y las dos son un control muerto. Importa
 * de verdad para un CSE con cartera acotada, que si no abriría una barra donde la mitad de
 * los controles no hace nada. Si al final queda una sola opción, no hay nada que elegir y no
 * se renderiza el grupo.
 *
 * ⚠ Se mide contra el UNIVERSO (la categoría entera), no contra el subconjunto de la
 * búsqueda: si no, las píldoras aparecerían y desaparecerían mientras se teclea.
 */
export function vistasVisibles(universo: readonly FilaFiltrable[]): readonly VistaDef[] {
  if (universo.length === 0) return [];
  const parten = VISTAS_DE_CARTERA.filter((v) => {
    if (v.key === "todos") return true;
    const n = aplicarVista(universo, v.key).length;
    return n > 0 && n < universo.length;
  });
  return parten.length >= 2 ? parten : [];
}

/**
 * Lo que la barra pinta de verdad.
 *
 * ⚠ La vista ACTIVA se renderiza siempre, aunque no parta este universo. Si no, cambiar de
 * pestaña de categoría con un filtro puesto dejaría el filtro aplicado y **sin ningún control
 * para sacarlo**: la lista aparece recortada y el único botón que la arreglaba ya no está.
 * Es la misma puerta sin retorno que ya nos costó un demo.
 */
export function vistasARenderizar(
  universo: readonly FilaFiltrable[],
  activa: VistaDeCartera,
): readonly VistaDef[] {
  const base = vistasVisibles(universo);
  if (activa === "todos" || base.some((v) => v.key === activa)) return base;
  const act = vistaPorKey(activa);
  return base.length > 0 ? [...base, act] : [vistaPorKey("todos"), act];
}

/**
 * Cuánto trabajo interno hay en TODO el universo accesible, no en la pestaña abierta.
 *
 * Lo consume el puente del estado vacío: la persona está parada en una categoría que tiene 0
 * y hay que decirle dónde está lo que buscaba. Contarlo dentro de esa categoría daría 0
 * siempre, que es justo el mensaje inútil que este puente vino a reemplazar.
 */
export function trabajoInternoDe(
  filas: readonly FilaFiltrable[],
): { empresas: number; proyectos: number } {
  let empresas = 0;
  let proyectos = 0;
  for (const f of filas) {
    if (f.resumen.internos > 0) {
      empresas++;
      proyectos += f.resumen.internos;
    }
  }
  return { empresas, proyectos };
}

// ── La línea de verdad ────────────────────────────────────────────────────────

export type Pertenencia = "mine" | "shared" | "all";

const PERTENENCIA_LABEL: Record<Pertenencia, string | null> = {
  all: null, // "Todos" no filtra nada: nombrarlo sería ruido
  mine: "Mis clientes",
  shared: "Compartido",
};

/**
 * "1 cliente" / "2 clientes".
 *
 * ⚠ El singular NO se deriva quitándole la "s" al plural. Esa heurística funciona con tres de
 * las cuatro categorías y falla justo con la que esta tanda renombró: «Somos Smarteam» no es
 * un sustantivo contable, y la línea decía "Mostrando 0 de 0 somos smarteam". Lo destapó la
 * prueba clickeada, no un test. Por eso el par vive escrito en `CLIENT_KIND_META.contable`.
 */
export function contarConPlural(n: number, c: { uno: string; varios: string }): string {
  return `${n} ${n === 1 ? c.uno : c.varios}`;
}

/**
 * La línea de verdad: lo ÚNICO en toda la pantalla que afirma cuántas filas se están viendo.
 *
 * `null` = no hay nada filtrando, así que no se pinta nada. Los contadores de las pestañas de
 * categoría siguen contando el censo a propósito (son la única superficie del sistema desde
 * la que se caza una empresa mal clasificada); esta línea es la que reconcilia ese número con
 * lo que hay en la tabla.
 */
export function describirVista(a: {
  visibles: number;
  totalDeCategoria: number;
  contableDeCategoria: { uno: string; varios: string };
  pertenencia: Pertenencia | null;
  vista: VistaDeCartera;
  busqueda: string;
}): { texto: string; hayQueLimpiar: boolean } | null {
  // Con la categoría vacía no hay nada que reconciliar: "Mostrando 0 de 0" es ruido, y encima
  // se pinta justo arriba del estado vacío, que ya explica el porqué y ofrece la salida.
  if (a.totalDeCategoria === 0) return null;

  const q = a.busqueda.trim();
  const ejes: string[] = [];
  const etiquetaPertenencia = a.pertenencia ? PERTENENCIA_LABEL[a.pertenencia] : null;
  if (etiquetaPertenencia) ejes.push(etiquetaPertenencia);
  if (a.vista !== "todos") ejes.push(vistaPorKey(a.vista).label);
  if (q) ejes.push(`«${q}»`);

  if (ejes.length === 0) return null;

  const total = contarConPlural(a.totalDeCategoria, a.contableDeCategoria);
  return {
    texto: `Mostrando ${a.visibles} de ${total} · ${ejes.join(" · ")}`,
    // La pertenencia no se limpia desde acá: es una pestaña propia, y "Limpiar" tiene que
    // deshacer lo que se hizo en ESTA barra.
    hayQueLimpiar: a.vista !== "todos" || q.length > 0,
  };
}

// ── Los estados vacíos ────────────────────────────────────────────────────────

export type AccionDeVacio =
  | { tipo: "ver-todos"; label: string }
  | { tipo: "quitar-filtro"; label: string }
  | { tipo: "buscar-sin-filtro"; label: string }
  | { tipo: "limpiar-todo"; label: string }
  | { tipo: "ir"; label: string; kind: ClientKind; vista: VistaDeCartera };

export interface ListaVacia {
  titulo: string;
  detalle: string;
  acciones: readonly AccionDeVacio[];
}

/**
 * Por qué la lista quedó vacía, y cómo salir.
 *
 * **Gana la PRIMERA etapa de la cascada que la vació** (categoría → pertenencia → vista →
 * búsqueda). Si no, un mensaje culpa a la búsqueda cuando en realidad la categoría ya estaba
 * en cero, y la persona borra el término sin que pase nada.
 *
 * Ninguna vista se auto-apaga al quedar en cero. Un control que se enciende y se apaga solo
 * —y hace saltar la tabla de 20 filas a 2 sin que nadie lo toque— es peor que un vacío
 * explicado: enseña que los controles se mueven por su cuenta.
 */
export function explicarListaVacia(a: {
  kind: ClientKind;
  /** Cuántas hay en la categoría abierta, sin ningún otro filtro. */
  enCategoria: number;
  /** …después de la pestaña de pertenencia. */
  enPertenencia: number;
  /** …después de la vista, antes de la búsqueda. Es lo que hace honesto el detalle de E4. */
  enVista: number;
  pertenencia: Pertenencia | null;
  vista: VistaDeCartera;
  busqueda: string;
  trabajoInterno: { empresas: number; proyectos: number };
}): ListaVacia {
  const meta = CLIENT_KIND_META[a.kind];
  const q = a.busqueda.trim();

  // E1 — la categoría entera está vacía.
  if (a.enCategoria === 0) {
    // El puente que da nombre a toda esta tanda: la persona entró a «Somos Smarteam»
    // buscando el trabajo de puertas adentro, que es OTRA cosa y sí existe. Sin este
    // enlace, la pantalla la deja exactamente donde estaba: mirando un cero.
    if (a.kind === "INTERNO") {
      const { empresas, proyectos } = a.trabajoInterno;
      const hayInterno = empresas > 0;
      return {
        titulo: "Ninguna empresa está marcada como nuestra",
        detalle: hayInterno
          ? `«${meta.plural}» son las empresas que SOMOS nosotros, y se marca en la ficha de ` +
            `la empresa, en Configuración → Clasificación y potencial. El trabajo que hacemos ` +
            `para nosotros lo marca cada proyecto: ${contarConPlural(empresas, CLIENT_KIND_META.CLIENTE.contable)} ` +
            `${empresas === 1 ? "tiene" : "tienen"} ${contarConPlural(proyectos, { uno: "proyecto", varios: "proyectos" })} ` +
            `internos.`
          : `«${meta.plural}» son las empresas que SOMOS nosotros, y se marca en la ficha de ` +
            `la empresa, en Configuración → Clasificación y potencial. Hoy ningún proyecto ` +
            `está marcado como interno.`,
        // Sin trabajo interno no se ofrece el botón: prometería una lista que no existe.
        acciones: hayInterno
          ? [
              {
                tipo: "ir",
                label: `Ver ${contarConPlural(empresas, CLIENT_KIND_META.CLIENTE.contable)} con trabajo interno`,
                kind: "CLIENTE",
                vista: "trabajo-interno",
              },
            ]
          : [],
      };
    }
    return {
      titulo: `Sin ${meta.plural.toLowerCase()} aún`,
      detalle: `${meta.help} Se marca desde la ficha de la empresa, en Configuración.`,
      acciones: [],
    };
  }

  // E2 — la pertenencia vació la lista.
  if (a.enPertenencia === 0) {
    return {
      titulo:
        a.pertenencia === "mine"
          ? "No sos owner de ningún cliente"
          : "No tenés clientes compartidos",
      detalle: `Hay ${contarConPlural(a.enCategoria, meta.contable)} en esta pestaña.`,
      acciones: [{ tipo: "ver-todos", label: "Ver todos" }],
    };
  }

  // E3 — la vista vació la lista (y la búsqueda no llegó ni a correr).
  if (a.vista !== "todos" && !q) {
    const def = vistaPorKey(a.vista);
    return {
      titulo: `Ningún cliente pasa el filtro «${def.label}»`,
      detalle: `Hay ${contarConPlural(a.enPertenencia, meta.contable)} en esta vista.`,
      acciones: [{ tipo: "quitar-filtro", label: "Quitar filtro" }],
    };
  }

  // E4 — la búsqueda.
  const conFiltro = a.vista !== "todos";
  return {
    titulo: `Sin resultados para «${q}»`,
    detalle: conFiltro
      ? `Ninguno de los ${contarConPlural(a.enVista, meta.contable)} con el filtro ` +
        `«${vistaPorKey(a.vista).label}» coincide.`
      : `Ninguno de los ${contarConPlural(a.enVista, meta.contable)} de esta pestaña coincide.`,
    acciones: conFiltro
      ? [
          // La acción primaria conserva el TÉRMINO y saca el filtro: es lo que la persona
          // quiere el 90% de las veces (buscó algo que sabe que existe).
          { tipo: "buscar-sin-filtro", label: `Buscar «${q}» sin el filtro` },
          { tipo: "limpiar-todo", label: "Limpiar todo" },
        ]
      : [{ tipo: "limpiar-todo", label: "Limpiar búsqueda" }],
  };
}

// ── El potencial estimado ─────────────────────────────────────────────────────

/**
 * `formatTamUsd(0)` devuelve `"$0"`, y el propio `kind.ts` documenta que null tiene que ser
 * "—" y nunca "$0". Con 165 de 165 empresas sin TAM cargado, el agregado venía afirmando que
 * la cartera vale cero dólares cuando la verdad es "no se sabe" — y ahora, con un "Mostrando
 * 43 de 155" preciso al lado, esa afirmación gana credibilidad prestada.
 */
export function resumirPotencial(
  tams: readonly (number | null)[],
): { total: number | null; sinEstimar: number } {
  const cargados = tams.filter((t): t is number => t !== null);
  return {
    total: cargados.length === 0 ? null : cargados.reduce((a, b) => a + b, 0),
    sinEstimar: tams.length - cargados.length,
  };
}
