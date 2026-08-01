/**
 * lib/projects/alta.ts  (Tanda C — el alta única)
 *
 * EN QUÉ PUNTO QUEDÓ UN ALTA DE PROYECTO. Puro, sin base de datos, sin async: una tabla de
 * verdad que se puede escribir entera en un test (y está escrita entera, en `alta.test.ts`).
 * CLIENT-SAFE — no importa Prisma, así que el chip de la ficha y la franja del widget pueden
 * consumirlo directo.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Dar de alta un proyecto son DOS escrituras en dos sistemas distintos: la fila en Nexus y el
 * record en HubSpot. Entre una y otra hay red. Hasta ahora, si algo fallaba en el medio,
 * quedaba una fila en Nexus sin id de HubSpot — y como Nexus solo muestra proyectos CON id
 * (`lib/projects/scope.ts`), ese proyecto se volvía invisible: no estaba en la ficha, ni en la
 * cartera, ni en cobranza, y nadie se enteraba nunca.
 *
 * La respuesta no es "que no falle" —siempre va a fallar alguna vez—, es que "quedó a medias"
 * sea un ESTADO DEL NEGOCIO: se ve, se puede retomar, y mientras tanto no cobra.
 *
 * ── LOS TRES ESTADOS, Y POR QUÉ SON TRES ─────────────────────────────────────
 *   pendiente_crm    → la fila existe en Nexus; falta el record en HubSpot.
 *   pendiente_espejo → el record existe; falta traerlo (tipo, etapa, hermandad).
 *   listo            → terminado. Se comporta como cualquier proyecto de siempre.
 *
 * Son tres y no dos porque los dos pasos fallan por motivos distintos y se reintentan
 * distinto: el primero CREA (y por lo tanto puede duplicar si se reintenta mal), el segundo
 * solo LEE. Fundirlos obligaría a que el reintento adivine cuál de los dos hacer, que es
 * exactamente el bug que produce records duplicados en el CRM.
 *
 * ── NULL ES 'listo', Y ESO HACE INVISIBLE EL DEPLOY ──────────────────────────
 * Los ~100 proyectos que ya existen —y los que siguen entrando por el espejo, que son 99 de
 * cada 100— tienen `altaEstado = null`. NULL responde IGUAL que 'listo' en las seis preguntas.
 * Un test lo exige de forma explícita: sin esa equivalencia, aplicar la migración sacaría a
 * todos los proyectos de cobranza y de la cartera al mismo tiempo.
 */

export const ESTADOS_DE_ALTA = ["pendiente_crm", "pendiente_espejo", "listo"] as const;

export type EstadoDeAlta = (typeof ESTADOS_DE_ALTA)[number];

/**
 * Lo que devuelve la base. `null` = el proyecto no nació por el alta única: o es anterior a
 * la Tanda C, o lo trajo el espejo desde HubSpot (el camino normal).
 */
export type EstadoDeAltaEnBase = EstadoDeAlta | null;

/** Lo que falta hacer. `null` = nada: el alta terminó (o nunca hubo una). */
export type PasoDelAlta = "crear-en-hubspot" | "traer-de-hubspot";

/**
 * ¿El alta todavía no terminó?
 *
 * Es LA pregunta del módulo: quien responde `true` acá queda en cuarentena —no cobra, no suma
 * a la cartera de nadie, no se le publica nada al cliente y el vigilante no lo mira— pero SÍ
 * se ve y SÍ se puede abrir. Ver `OVERLAY_ALTA_EN_CURSO` en `lib/projects/kind.ts`.
 */
export function altaEnCurso(estado: EstadoDeAltaEnBase): boolean {
  return estado === "pendiente_crm" || estado === "pendiente_espejo";
}

/**
 * El complemento exacto de `altaEnCurso`. Existe como función propia —en vez de un `!` en cada
 * llamador— porque se escribe en positivo en los filtros de Prisma (`altaEstado IN (NULL,
 * 'listo')`) y ahí un `!` no se puede expresar: en SQL, `altaEstado != 'pendiente_crm'` es
 * FALSO para las filas en NULL, que es justo al revés de lo que hace falta.
 */
export function altaTerminada(estado: EstadoDeAltaEnBase): boolean {
  return !altaEnCurso(estado);
}

/** Qué falta hacer para terminar. `null` cuando no falta nada. */
export function siguientePaso(estado: EstadoDeAltaEnBase): PasoDelAlta | null {
  if (estado === "pendiente_crm") return "crear-en-hubspot";
  if (estado === "pendiente_espejo") return "traer-de-hubspot";
  return null;
}

/**
 * ¿Se puede apretar "Reintentar"? Coincide con `altaEnCurso` por construcción, pero se declara
 * aparte porque son dos preguntas distintas —"¿está en cuarentena?" y "¿hay un botón?"— y el
 * día que dejen de coincidir (por ejemplo, un estado terminal de error) el test lo va a decir
 * en vez de que una de las dos se arrastre por accidente.
 */
export function altaEsRetomable(estado: EstadoDeAltaEnBase): boolean {
  return siguientePaso(estado) !== null;
}

/** Valida un estado que llega de la frontera HTTP o de un JSON. `null` si no es válido. */
export function parseEstadoDeAlta(v: unknown): EstadoDeAlta | null {
  return typeof v === "string" && (ESTADOS_DE_ALTA as readonly string[]).includes(v)
    ? (v as EstadoDeAlta)
    : null;
}

/**
 * CÓMO SE LE CUENTA A UNA PERSONA. Vive acá y no en el componente porque el cartel aparece en
 * dos lugares (el rail de la ficha del cliente y el widget del proyecto) y dos textos que
 * dicen casi lo mismo se desincronizan: uno se corrige y el otro queda contando la versión
 * vieja del problema.
 *
 * El texto no dice "error" ni "falló": dice QUÉ FALTA y QUÉ PASA MIENTRAS TANTO. Quien lo lee
 * necesita decidir si esperar o avisar, y para eso el dato útil es que el proyecto no está
 * perdido y no está cobrando — no cuál de las dos llamadas HTTP no volvió.
 */
export const EXPLICACION_DEL_PASO: Record<
  PasoDelAlta,
  { titulo: string; detalle: string }
> = {
  "crear-en-hubspot": {
    titulo: "Falta crearlo en HubSpot",
    detalle:
      "El proyecto ya existe en Nexus pero todavía no en el CRM. Reintentar no lo duplica: " +
      "si el intento anterior alcanzó a crearlo, lo adopta en vez de crear otro.",
  },
  "traer-de-hubspot": {
    titulo: "Falta traerlo de HubSpot",
    detalle:
      "El proyecto ya existe en el CRM. Falta que Nexus lo lea para saber de qué tipo es y " +
      "de qué proyecto cuelga. Este paso solo lee: reintentarlo no cambia nada allá.",
  },
};

/**
 * La consecuencia, escrita una sola vez. Es lo que evita la llamada de "¿lo perdimos?": el
 * proyecto se ve y se abre, pero está en cuarentena hasta que el alta termine.
 */
export const MIENTRAS_TANTO =
  "Mientras tanto se puede abrir, pero no se factura, no entra en la cartera de nadie y no se " +
  "le publica nada al cliente.";
