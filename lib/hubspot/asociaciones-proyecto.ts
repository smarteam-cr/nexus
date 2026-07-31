/**
 * lib/hubspot/asociaciones-proyecto.ts  (Tanda C, paso C0)
 *
 * Con qué etiqueta se une un proyecto de HubSpot (objeto 0-970) a su EMPRESA, a su TRATO y a
 * su HERMANO. Tabla CONGELADA: se transcribe del portal, no se deriva ni se consulta en
 * caliente.
 *
 * ── POR QUÉ EXISTE, SI EL SYNC YA LEE HERMANOS SIN ESTOS NÚMEROS ─────────────
 * Leer y crear son operaciones distintas. LEER no necesita el typeId: `leerProyectosAsociados`
 * (sync-projects.ts) hace un `batch/read` y mapea `to[].toObjectId` sin mirar la etiqueta.
 * CREAR sí lo necesita: el bloque `associations` del POST lo exige.
 *
 * Y ahí está el riesgo que justifica congelarlo. Un typeId equivocado no revienta de forma
 * visible: HubSpot crea la asociación bajo OTRA etiqueta. Un desarrollo que debía colgar de su
 * implementación queda suelto —y ese vínculo es literalmente lo que dice "no me factures
 * aparte: cobra el hermano"—, así que entra a Cobranza por su cuenta. Sin error y sin que
 * nadie lo note.
 *
 * ── LA POR DEFECTO ES LA QUE NO TIENE ETIQUETA ───────────────────────────────
 * ⚠ No alcanza con `category === "HUBSPOT_DEFINED"`, y esto casi se cuela al transcribir.
 * Hacia `deals` el portal devuelve DOS definidas por HubSpot: 1383 "Deal Plan" y 1238 sin
 * etiqueta. "Deal Plan" es una relación con nombre propio, no la de por defecto. Peor: el
 * ORDEN en que el portal las devuelve CAMBIÓ entre dos corridas del mismo script con 40
 * segundos de diferencia (hacia `companies`, 1236 vino primero y después segundo), así que
 * "tomar la primera definida" no era solo incorrecto — era no determinista.
 *
 * La de por defecto es la que viene SIN etiqueta, y es la misma que resuelve el endpoint
 * `/crm/v4/objects/…/associations/default/…` que ya usa `handoff-sync.ts` para asociar
 * después de crear. Este módulo la mete DENTRO del POST de creación, que es lo que evita el
 * record huérfano.
 *
 * PROCEDENCIA: `scripts/inspect-project-associations.ts` contra el portal de Smarteam,
 * 2026-07-31. Ese script vuelve a correr cuando haga falta re-confirmar; imprime exactamente
 * estas tres filas.
 */

/** El objeto "projects" de HubSpot. El mismo que gestiona `Project.hubspotServiceId`. */
export const OBJETO_PROYECTOS = "0-970";

export type DestinoDeAsociacion = "empresa" | "trato" | "hermano";

export interface AsociacionDeProyecto {
  /** A qué objectType de HubSpot apunta. */
  readonly hacia: string;
  readonly typeId: number;
  readonly category: "HUBSPOT_DEFINED";
  /** Qué se rompe si esta asociación no queda. Escrito, porque es el motivo de la guarda. */
  readonly paraQue: string;
}

export const ASOCIACIONES_DE_PROYECTO: Readonly<Record<DestinoDeAsociacion, AsociacionDeProyecto>> = {
  empresa: {
    hacia: "companies",
    typeId: 1236,
    category: "HUBSPOT_DEFINED",
    paraQue:
      "sin empresa el record es HUÉRFANO: el espejo descubre proyectos por las asociaciones de la company, así que un proyecto sin ella no vuelve nunca a Nexus y no hay forma de recuperarlo desde la app",
  },
  trato: {
    hacia: "deals",
    typeId: 1238,
    category: "HUBSPOT_DEFINED",
    paraQue:
      "el trato ganado es el alcance vendido; de ahí sale el handoff. NO es 1383 ('Deal Plan'), que es otra relación con nombre propio",
  },
  hermano: {
    hacia: OBJETO_PROYECTOS,
    typeId: 1254,
    category: "HUBSPOT_DEFINED",
    paraQue:
      "un desarrollo o un sitio colgado de una implementación NO se factura aparte: cobra el hermano. Sin esta asociación el proyecto entra a Cobranza por su cuenta",
  },
};

/** Una entrada del bloque `associations` del POST de creación de HubSpot. */
export interface AsociacionParaCrear {
  to: { id: string };
  types: Array<{ associationCategory: "HUBSPOT_DEFINED"; associationTypeId: number }>;
}

/**
 * El bloque `associations` para el POST que crea el record, a partir de los ids que se tengan.
 *
 * Los destinos sin id se OMITEN, no se mandan vacíos: un proyecto puede no tener trato (los
 * internos) y puede no tener hermano (los que van solos). Lo que no es opcional es la empresa,
 * pero eso lo exige el llamador — acá omitir es lo correcto para los tres, porque este módulo
 * arma el cuerpo y no decide reglas de negocio.
 *
 * ── LA DIRECCIÓN DEL HERMANO ────────────────────────────────────────────────
 * La asociación se crea desde el proyecto NUEVO hacia su hermano. No hace falta confiar en que
 * HubSpot la deje visible en los dos lados: el motor del alta (C5) solo da el alta por
 * terminada cuando el espejo YA materializó la hermandad leyéndola de vuelta. Si la dirección
 * fuera la equivocada, el alta se queda trabada y visible — que es exactamente el
 * comportamiento que se quiere, en vez de un proyecto "listo" que se factura de más.
 */
export function bloqueDeAsociaciones(
  ids: Partial<Record<DestinoDeAsociacion, string | null | undefined>>,
): AsociacionParaCrear[] {
  const out: AsociacionParaCrear[] = [];
  for (const destino of Object.keys(ASOCIACIONES_DE_PROYECTO) as DestinoDeAsociacion[]) {
    const id = ids[destino]?.trim();
    if (!id) continue;
    const def = ASOCIACIONES_DE_PROYECTO[destino];
    out.push({
      to: { id },
      types: [{ associationCategory: def.category, associationTypeId: def.typeId }],
    });
  }
  return out;
}
