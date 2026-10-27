/**
 * lib/escala/nueve/tipos.ts — la forma del catálogo del borrador 9.0.0 de la escala. PURO.
 *
 * El borrador 9.0.0 sale de la 8.9.1 publicada aplicándole, en orden, las entradas del catálogo
 * (`catalogo.ts`). Cada entrada es UN punto de las fuentes —un punto de docs/escala/pendiente-9-0.md o
 * uno de los 16 cambios de docs/escala-engagement-avanzado-plan.md— con lo que se hizo con él:
 *   · `aplicada`: la propuesta era clara y venía redactada; entra tal cual.
 *   · `aplicada-con-redaccion`: la propuesta era clara, pero la redacción es de Claude (partir un
 *     criterio en dos cuando el documento solo dice «partir en A / B»).
 *   · `parcial`: entra lo claro, y lo demás queda como pregunta.
 *   · `pregunta`: el documento deja dos caminos o dice «decidir»: no entra nada y la pregunta queda en
 *     el borrador, en «Lo que falta decidir».
 *   · `despues-de-la-prueba`: lo que el orden acordado deja para después de probar la 8.9.1 con 5 a 8
 *     clientes (las celdas desbalanceadas y el cálculo).
 *   · `texto-pendiente`: cambia la prosa de la escala (la regla de asignación, la tabla de riesgos, «La
 *     próxima compra»…): queda escrito qué cambia, para hacerlo antes de publicar.
 *
 * Los identificadores nuevos los da el aplicador: el número que sigue en su nivel, sin reusar un
 * retirado (la regla 4 de la sección 18 del documento). Por eso un criterio nuevo se nombra con un
 * alias (`@1.1.F.cadencia`) y los demás lo requieren por ese alias.
 */
import type { Letra, MarcaDePerfil, Verificacion } from "@/lib/escala/documento/tipos";
import type { Bloque } from "@/lib/escala/datos/tipos";

/** Un identificador de criterio (`1.2.F3`) o el alias de uno que entra en este borrador (`@1.2.F.licencias`). */
export type Ref = string;

export interface Campos {
  texto: string;
  verificacion: Verificacion;
  riesgo?: boolean;
  habito?: boolean;
  perfil?: MarcaDePerfil | null;
  requiere?: Ref[];
}

export type Operacion =
  /** El criterio se acota o se precisa: conserva su identificador. */
  | { op: "editar"; id: Ref; cambios: Partial<Campos> }
  /** Un criterio nuevo en un nivel de la matriz (`1.2.F`), con el número que sigue. */
  | { op: "nuevo"; nivel: string; alias: string; campos: Campos }
  /** El criterio sale. `reemplazo`: quien lo requería pasa a requerir este (si no, el requerido se quita). */
  | { op: "retirar"; id: Ref; reemplazo?: Ref }
  /**
   * El criterio cambia de nivel, de dimensión o de lo que mide: deja su identificador y entra con otro
   * en `nivel`, con sus campos y los `cambios`. Quien lo requería pasa a requerir el nuevo. `reescritos:
   * "llevar"`: si el texto general no cambia y la dimensión es la misma, lo que cada edición decía de él
   * (reescrito, «No aplican», «Se leen igual») pasa al nuevo.
   */
  | { op: "mover"; id: Ref; nivel: string; alias: string; cambios?: Partial<Campos>; reescritos?: "llevar" | "soltar" }
  /** Una edición dice un criterio de la matriz con sus palabras. */
  | { op: "edicion-reescrito"; edicion: string; id: Ref; texto: string }
  /** Un criterio que solo existe en una edición, con el número que sigue en su bloque. */
  | { op: "edicion-propio"; edicion: string; nivel: string; alias: string; campos: Campos }
  | { op: "edicion-retirar-propio"; edicion: string; id: Ref }
  /** El propio de una edición se acota o se precisa: conserva su número (los «Ajuste» del plan de Insider). */
  | { op: "edicion-editar-propio"; edicion: string; id: Ref; cambios: Partial<Campos> }
  /** El propio de una edición cambia de lo que mide: deja su número y entra con otro en `nivel`. */
  | { op: "edicion-mover-propio"; edicion: string; id: Ref; nivel: string; alias: string; cambios?: Partial<Campos> }
  | { op: "edicion-frase"; edicion: string; nivel: string; frase: string }
  | { op: "edicion-panoramica"; edicion: string; area: string; letra: Letra; texto: string }
  /**
   * Una fila de la tabla «Riesgos» (Parte 4): el mensaje que ve el cliente cuando un criterio de riesgo no se
   * cumple. Si ya hay una fila con ese `criterio`, los identificadores se suman a ella.
   */
  | { op: "riesgo"; ids: Ref[]; criterio: string; mensaje?: string }
  /**
   * Bloques que se suman al final de una parte de prosa (la que empieza con ese título). En los textos,
   * un alias entre comillas invertidas (`` `@2.3.F.permiso` ``) se escribe con el identificador que le tocó.
   */
  | { op: "prosa-agregar"; parte: string; bloques: Bloque[] }
  /** Bloques que entran justo después del primero de esa parte cuyo texto empieza con `despuesDe`. Mismos alias. */
  | { op: "prosa-insertar"; parte: string; despuesDe: string; bloques: Bloque[] }
  /**
   * El primer bloque de esa parte cuyo texto empieza con `empieza` (en una lista, su primer punto) se
   * reemplaza por `bloques`. Mismos alias.
   */
  | { op: "prosa-cambiar"; parte: string; empieza: string; bloques: Bloque[] };

export type EstadoDeLaEntrada = "aplicada" | "aplicada-con-redaccion" | "parcial" | "pregunta" | "despues-de-la-prueba" | "texto-pendiente";

export interface Entrada {
  /** Cómo se cita en la bitácora: «§2 · 1.1.F4» o «Insider 6 · 2.8.O3». */
  punto: string;
  fuente: "pendiente-9-0" | "insider";
  /** El tema del documento: «2. Criterios compuestos que hay que partir». */
  tema: string;
  /** Qué se hizo, en una línea. */
  resumen: string;
  estado: EstadoDeLaEntrada;
  ops: Operacion[];
  /** Lo que queda para Elías (en `pregunta` y `parcial`; también en `texto-pendiente`, lo que hay que escribir). */
  pregunta?: string;
  /** Solo en los cambios de Insider: qué lo habilita, según el mapa de herramientas. */
  habilita?: string;
}
