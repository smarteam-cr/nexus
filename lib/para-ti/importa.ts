/**
 * lib/para-ti/importa.ts — «Lo que importa hoy» (2026-10-16, fase 1.1 de docs/nexus-sistema-de-trabajo-plan.md). PURO.
 *
 * De todo lo que es para hoy (y lo que dejó un agente), como mucho CINCO cosas, UNA POR CUENTA: la de más peso. Lo demás
 * de esa cuenta va adentro («+N en esta cuenta») y lo que no entra en las cinco queda en «También para hoy». El número del
 * menú cuenta esas cinco y el correo de la mañana usa las mismas. *Por qué:* «Para ti» tenía 26 fuentes sin orden de
 * importancia ni tope, y un hecho salía en hasta seis lugares; una lista que nunca baja se deja de mirar.
 *
 * El orden (Elías, 2026-10-16): cliente en riesgo o queja verificada > cuenta sin acción o sin reunión > decisión que
 * frena (cronograma, etapa) > revisar una reunión > lo interno > encuestas y limpieza. El peso sale de la FUENTE
 * (`PESO_DE_LA_FUENTE`); un pendiente puede traer el suyo. Lo que falló (rojo) sube.
 *
 * ── NADA QUEDA FUERA SIN DECIRLO (2026-10-17) ───────────────────────────────────────────────────────────────────────
 * Elías, validando «Para ti»: si a un CSE le piden atención más cuentas de las que entran en sus cinco, lo que sobra
 * no puede quedar abajo, en «También para hoy», como si fuera lo de menos. Cuando las cuentas SUYAS que quedan fuera
 * llegan a `UMBRAL_PARA_ESTABILIZAR`, la quinta cosa pasa a ser «Estabilizar N cuentas», con el enlace a cada una. Y a
 * quien lidera Customer Success le llega «<CSE> tiene N cuentas que piden atención» (lib/para-ti/fuentes/cs.ts), para
 * repartir o acompañar. Se calcula al leer; no se guarda nada.
 */
import type { Pendiente } from "./tipos";

/** Cuántas cosas, como mucho, en «Lo que importa hoy». */
export const MAX_LO_QUE_IMPORTA = 5;

/**
 * Desde cuántas cuentas tuyas fuera de las cinco se junta todo en «Estabilizar N cuentas». *Por qué 3:* una o dos que no
 * entran se leen justo debajo, en «También para hoy», y es cuestión de orden; con tres o más ya no es orden sino carga
 * (más cuentas que días de la semana para atenderlas), y eso lo tiene que ver también quien lidera Customer Success.
 */
export const UMBRAL_PARA_ESTABILIZAR = 3;

/**
 * Cuántas cuentas que piden atención hacen falta para eso: las cuatro que quedan en sus cinco (la quinta es
 * «Estabilizar») más el umbral. Lo usa también el aviso a quien lidera Customer Success, para que los dos digan lo mismo.
 */
export const MIN_CUENTAS_PARA_ESTABILIZAR = MAX_LO_QUE_IMPORTA - 1 + UMBRAL_PARA_ESTABILIZAR;

/** ¿Con tantas cuentas pidiendo atención, la persona ya no puede con todas en sus cinco? */
export function necesitaEstabilizar(cuentasQuePidenAtencion: number): boolean {
  return cuentasQuePidenAtencion >= MIN_CUENTAS_PARA_ESTABILIZAR;
}

/** Los escalones del orden. Una fuente nueva sin peso cae en «lo interno». */
export const PESOS = {
  riesgo: 90,
  servicio: 80,
  decision: 70,
  reunion: 60,
  interno: 40,
  limpieza: 20,
} as const;

/** El peso de cada fuente (por su clave, o por el principio de su clave). */
export const PESO_DE_LA_FUENTE: Record<string, number> = {
  // Cliente en riesgo o queja verificada.
  "cs-vigia": PESOS.riesgo,
  "cs-tus-cuentas": PESOS.riesgo,
  "cs-relaciones-cartera": PESOS.riesgo,
  "cs-relacion-hubspot": PESOS.riesgo - 5,
  // Cuenta sin siguiente paso (ni tarea con fecha esta semana ni reunión en 8 días; desde el 2026-10-19 una reunión
  // agendada ya es el siguiente paso). Las reuniones con la cuenta y las tareas vencidas salen de la misma medición: en
  // el inicio de Customer Success van en sus bloques (lib/para-ti/foco.ts) y estos pesos casi no se usan.
  "cuenta-sin-accion": PESOS.servicio,
  "tareas-vencidas-de-la-cuenta": PESOS.servicio - 10,
  "reunion-con-la-cuenta": PESOS.reunion - 10,
  // Lo prometido al cliente (una reunión, una entrega) que a las 48 horas nadie agendó ni tomó (iniciativa B): entre el
  // riesgo y la cuenta sin acción, porque es justo lo que hace que el cliente le escriba a dirección.
  "compromisos-sin-agendar": PESOS.servicio + 5,
  "compromisos-sin-agendar-cs": PESOS.servicio + 5,
  // Un CSE con más cuentas que piden atención de las que entran en sus cinco (a quien lidera, 2026-10-17).
  "cs-estabilizar": PESOS.servicio + 5,
  "cs-sin-encargado": PESOS.servicio - 5,
  // Lo de la limpieza de HubSpot que deja una cuenta sin dueño (sin encargado, encargado que se fue, servicio sin
  // proyecto, excliente con algo abierto; lib/limpieza/para-ti.ts). Lo demás de la limpieza es orden y pesa poco.
  "hubspot-limpieza-dueno": PESOS.servicio - 5,
  // Una decisión que frena.
  "cronograma-propuesta": PESOS.decision,
  "cs-cronogramas-trabados": PESOS.decision,
  "etapa-sugerida": PESOS.decision - 5,
  alta: PESOS.decision,
  presentaciones: PESOS.decision - 10,
  // Revisar una reunión.
  "reuniones-por-revisar-lo-que-dejaron": PESOS.reunion,
  "reuniones-sin-revisar": PESOS.reunion,
  "pedidos-fuera-de-alcance": PESOS.reunion,
  // Land and Expand: después de una entrega, seguir con un servicio recurrente (SmartLoop, etapa 6).
  "recurrencia-sugerida": PESOS.reunion - 5,
  // Lo interno.
  tareas: PESOS.interno + 5,
  preventa: PESOS.interno + 5,
  negocios: PESOS.interno + 5,
  "ventas-pedidos": PESOS.interno,
  finanzas: PESOS.interno,
  "marketing-revisar": PESOS.interno,
  "sistema-jobs": PESOS.interno,
  // Encuestas y limpieza.
  tiempos: PESOS.limpieza,
  "hubspot-limpieza": PESOS.limpieza,
  "cs-correccion-caduco": PESOS.limpieza + 5,
  "escala-comentarios": PESOS.limpieza + 5,
  "documentacion-comentarios": PESOS.limpieza + 5,
};

/** El peso de un pendiente: el suyo, el de su fuente, o el de «lo interno». Lo que falló sube un escalón. */
export function pesoDe(p: Pendiente): number {
  const base =
    p.peso ??
    PESO_DE_LA_FUENTE[p.fuente] ??
    Object.entries(PESO_DE_LA_FUENTE).find(([k]) => p.fuente.startsWith(`${k}-`) || p.fuente.startsWith(k))?.[1] ??
    PESOS.interno;
  return base + (p.error ? 15 : 0) + (p.delAgente ? 2 : 0);
}

const CUENTA_EN_EL_ENLACE = /^\/(?:clients|customer-success)\/([a-z0-9]{20,40})(?:[/?#]|$)/i;

/** La cuenta de un pendiente: la suya, o la del enlace (`/clients/<id>…`). null = no es de una cuenta. */
export function cuentaDe(p: Pendiente): string | null {
  if (p.clientId !== undefined) return p.clientId;
  return CUENTA_EN_EL_ENLACE.exec(p.href)?.[1] ?? null;
}

function antes(a: Pendiente, b: Pendiente): number {
  const peso = pesoDe(b) - pesoDe(a);
  if (peso !== 0) return peso;
  const da = a.desde ? Date.parse(a.desde) : Number.POSITIVE_INFINITY;
  const db = b.desde ? Date.parse(b.desde) : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.titulo.localeCompare(b.titulo, "es");
}

export interface LoQueImporta {
  /** Como mucho cinco, una por cuenta, con lo demás de su cuenta en `otrosEnLaCuenta`. */
  importa: Pendiente[];
  /** Lo que no entró en las cinco (de otras cuentas o sin cuenta). */
  tambien: Pendiente[];
}

/** La fuente y la clave de «Estabilizar N cuentas». */
export const FUENTE_ESTABILIZAR = "estabilizar";

export interface OpcionesDeLoQueImporta {
  /**
   * Las cuentas que lleva la persona (el encargado en HubSpot). Si las suyas que no entran llegan al umbral, la quinta
   * cosa es «Estabilizar N cuentas». Solo cuentan las suyas: a quien lidera le llegan alertas de cuentas que no lleva, y
   * esas no son carga suya. Sin esto (el correo de la mañana, quien no lleva cuentas), nada cambia.
   */
  cuentasQueLleva?: ReadonlySet<string> | null;
  /**
   * El nombre de cada cuenta (por su id): cada enlace de «Estabilizar» dice la empresa primero. Sin esto, la lista de
   * Juan Carlos Armijos decía 11 veces «Nada agendado en los próximos 8 días…» sin decir de qué cuenta (2026-10-19).
   */
  nombresDeLasCuentas?: ReadonlyMap<string, string> | null;
}

/** Elige lo que importa entre los candidatos (lo de hoy y lo que dejó un agente). */
export function elegirLoQueImporta(
  candidatos: readonly Pendiente[],
  max = MAX_LO_QUE_IMPORTA,
  opciones: OpcionesDeLoQueImporta = {},
): LoQueImporta {
  const normal = elegir(candidatos, max);
  const lleva = opciones.cuentasQueLleva;
  if (!lleva || lleva.size === 0 || max < 2) return normal;
  // Con una menos, ¿cuántas cuentas suyas quedan fuera? Si llegan al umbral, la quinta es «Estabilizar».
  const reducida = elegir(candidatos, max - 1);
  const fuera = cuentasFuera(reducida.tambien, lleva);
  if (fuera.length < UMBRAL_PARA_ESTABILIZAR) return normal;
  return { importa: [...reducida.importa, pendienteDeEstabilizar(fuera, opciones.nombresDeLasCuentas)], tambien: reducida.tambien };
}

/** Las cuentas (que lleva la persona) de lo que no entró, en orden de peso, con lo más pesado de cada una. */
function cuentasFuera(tambien: readonly Pendiente[], lleva: ReadonlySet<string>): Array<{ clientId: string; p: Pendiente }> {
  const vistas = new Map<string, Pendiente>();
  for (const p of tambien) {
    const c = cuentaDe(p);
    if (c && lleva.has(c) && !vistas.has(c)) vistas.set(c, p);
  }
  return [...vistas].map(([clientId, p]) => ({ clientId, p }));
}

/**
 * El texto del enlace a una cuenta: lo más pesado que pide, con la empresa adelante si el título no la nombra ya
 * («Librería Internacional está en riesgo» queda igual; «Revisa lo que dejó «X»» pasa a «Honda: Revisa lo que dejó «X»»).
 */
export function textoDelEnlaceALaCuenta(titulo: string, empresa: string | null | undefined): string {
  const e = empresa?.trim();
  if (!e || titulo.toLocaleLowerCase("es").includes(e.toLocaleLowerCase("es"))) return titulo;
  return `${e}: ${titulo}`;
}

/** «Estabilizar N cuentas», con el enlace a cada una (el texto es lo más pesado que pide esa cuenta, con la empresa). */
export function pendienteDeEstabilizar(
  fuera: ReadonlyArray<{ clientId: string; p: Pendiente }>,
  nombres?: ReadonlyMap<string, string> | null,
): Pendiente {
  const ficha = (id: string) => `/clients/${encodeURIComponent(id)}`;
  return {
    clave: `${FUENTE_ESTABILIZAR}:cuentas`,
    fuente: FUENTE_ESTABILIZAR,
    cuando: "hoy",
    delAgente: false,
    clientId: null,
    titulo: `Estabilizar ${fuera.length} cuentas`,
    detalle:
      "Te piden atención más cuentas de las que entran hoy. Empieza por la primera y, si no alcanzas, habla con quien lidera Customer Success para repartirlas.",
    meta: "Tus cuentas",
    accion: "Abrir la primera",
    href: ficha(fuera[0].clientId),
    enlaces: fuera.map((x) => ({ texto: textoDelEnlaceALaCuenta(x.p.titulo, nombres?.get(x.clientId)), href: ficha(x.clientId) })),
    desde: null,
  };
}

/** La elección de siempre: por peso, una por cuenta, como mucho `max`. */
function elegir(candidatos: readonly Pendiente[], max: number): LoQueImporta {

  const orden = [...candidatos].sort(antes);
  const porCuenta = new Map<string, Pendiente>();
  const importa: Pendiente[] = [];
  const tambien: Pendiente[] = [];
  for (const p of orden) {
    const cuenta = cuentaDe(p);
    const yaEsta = cuenta ? porCuenta.get(cuenta) : undefined;
    if (yaEsta) {
      yaEsta.otrosEnLaCuenta = [...(yaEsta.otrosEnLaCuenta ?? []), p];
      continue;
    }
    if (importa.length < max) {
      const elegido = { ...p, otrosEnLaCuenta: [] as Pendiente[] };
      importa.push(elegido);
      if (cuenta) porCuenta.set(cuenta, elegido);
    } else {
      tambien.push(p);
    }
  }
  return { importa: importa.map((p) => (p.otrosEnLaCuenta?.length ? p : { ...p, otrosEnLaCuenta: undefined })), tambien };
}
