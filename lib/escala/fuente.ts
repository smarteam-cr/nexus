/**
 * lib/escala/fuente.ts — de dónde sacan los agentes la Escala de Rendimiento, y cómo se reconoce
 * que es la vigente. PURO: sin base y sin `fs`.
 *
 * Existe porque «la escala» fueron tres cosas a la vez: la 0-4 del canvas de empresa, la v4 que
 * tenía Conocimientos (Capacidad/Output y el marco Loop) y la 5.2, que solo leía el equipo en
 * Documentación. Un agente que recibe dos no elige la buena: las mezcla. Acá viven las etiquetas
 * con que se carga la vigente y las marcas con que se reconoce una vieja — las mismas para la
 * siembra, las pruebas y `scripts/verificar-escala-agentes.ts`.
 */

/** El reglamento completo: la vara con que el Diagnóstico ubica al cliente dimensión por dimensión. */
export const ETIQUETA_ESCALA_COMPLETA = "escala_rendimiento";

/** El resumen para posicionar: lo leen la Propuesta, el Kickoff y la Entrega. */
export const ETIQUETA_ESCALA_RESUMEN = "escala_resumen";

/**
 * Los topes de caracteres con que se cargan.
 *
 * ⚠ El documento tiene que entrar ENTERO: `loadKnowledgeByTags` omite completo el que no entra, y
 * un Diagnóstico sin reglamento puntúa al cliente con los nombres de los niveles y nada más — pasó
 * con la v4 y un tope de 20.000, y se descubrió en una auditoría. Si el reglamento crece, se sube
 * el número; la prueba de `lib/knowledge/escala-v5-documentos.test.ts` avisa antes.
 */
export const TOPE_ESCALA_COMPLETA = 160_000;
export const TOPE_ESCALA_RESUMEN = 24_000;

/** La versión que tiene que declarar un texto para ser la vigente. */
export const VERSION_VIGENTE = "5.2.0";

/**
 * Rastros de una escala vieja. Cualquiera en el bloque de escala de un agente es una mezcla.
 *
 * ⚠ Se buscan en el BLOQUE DE ESCALA, no en el contexto entero: un cliente puede llamarse
 * «Express» o una reunión caer a las 10-45, y eso no es una escala vieja.
 */
export const MARCAS_DE_ESCALA_VIEJA: readonly { nombre: string; patron: RegExp }[] = [
  { nombre: "Capacidad/Output (v4)", patron: /Capacidad\s*\/\s*Output/i },
  { nombre: "fases del marco Loop (v4)", patron: /\b(Express|Tailor|Amplify|Evolve)\b/ },
  { nombre: "marco Loop (v4)", patron: /\bLoop\b/ },
  { nombre: "escala 0-4", patron: /\b0\s*-\s*4\b/ },
  { nombre: "Ordenamiento/Velocidad/Efectividad (0-4)", patron: /\bOrdenamiento\b/i },
  { nombre: "niveles Básico/Estructurado (0-4)", patron: /Básico\s*\/\s*Estructurado/i },
];

export interface LecturaDeFuente {
  /** Declara la versión vigente y habla por capas. */
  vigente: boolean;
  /** Los nombres de las marcas de escala vieja que aparecieron. */
  viejas: string[];
}

/** Qué escala trae un texto. */
export function leerFuente(texto: string): LecturaDeFuente {
  const vigente =
    texto.includes(VERSION_VIGENTE) && /base operativa/i.test(texto) && /producción/i.test(texto);
  const viejas = MARCAS_DE_ESCALA_VIEJA.filter((m) => m.patron.test(texto)).map((m) => m.nombre);
  return { vigente, viejas };
}
