/**
 * lib/sessions/etiqueta-de-sala.ts — ¿ESTO SE HABLÓ CON EL CLIENTE O PUERTAS ADENTRO?
 *
 * ── EL DATO QUE LLEGABA Y SE TIRABA ──────────────────────────────────────────
 * Cuando un agente lee las reuniones de un proyecto, recibe `[fecha] contenido` y nada más. Los
 * participantes viajan hasta el último paso —están en el DTO, a una línea de distancia— y se
 * descartan justo al serializar. Resultado: para el modelo, «lo que le prometimos al cliente en
 * su cara» y «lo que dijimos entre nosotros» son el mismo tipo de frase.
 *
 * No es un matiz. Una reunión interna es donde se dice «esto va a llegar tarde» o «esto lo
 * dimensionamos mal»; una con el cliente es donde se acuerda una fecha. Sin la etiqueta, el agente
 * puede escribir en un documento como compromiso algo que solo fue una conversación de pasillo.
 *
 * ── POR QUÉ `null` Y NO UN DEFAULT ───────────────────────────────────────────
 * Una sesión sin participantes registrados no es interna ni con el cliente: es un dato incompleto.
 * Adivinar cualquiera de las dos etiquetas le daría al modelo una certeza que nadie tiene, y el
 * error se propaga al documento. Cuando no se sabe, no se rotula.
 */
import { esReunionDePuertasAdentro, type SesionParaOfrecer } from "./candidatas-internas";

/** Lo que se le antepone a cada reunión en el prompt. `null` = no se puede saber, no se rotula. */
export type EtiquetaDeSala = "PUERTAS ADENTRO" | "CON EL CLIENTE" | null;

/**
 * ¿Con quién fue esta reunión?
 *
 * Reusa el MISMO criterio que decide qué se le ofrece a un proyecto interno
 * (`esReunionDePuertasAdentro`): pliega al organizador —que en muchas reuniones no figura entre
 * los participantes— y descarta los calendarios de Google, que no son personas. Dos definiciones
 * de «puertas adentro» que se pueden separar es exactamente lo que no se quiere.
 */
export function etiquetaDeSala(
  s: SesionParaOfrecer,
  dominiosPropios: ReadonlySet<string>,
): EtiquetaDeSala {
  const gente = s.organizerEmail ? [...s.participants, s.organizerEmail] : s.participants;
  if (gente.filter((e) => e && e.includes("@")).length === 0) return null;
  return esReunionDePuertasAdentro(s, dominiosPropios) ? "PUERTAS ADENTRO" : "CON EL CLIENTE";
}

/**
 * El prefijo listo para pegarle a una reunión en el prompt. `""` cuando no se sabe.
 *
 * Vive acá y no en cada call site para que los dos redactores que lo usan —el handoff y el agente
 * de avance— escriban EXACTAMENTE el mismo rótulo. Si divergen, el modelo aprende dos vocabularios
 * para la misma distinción y deja de confiar en los dos.
 */
export function prefijoDeSala(etiqueta: EtiquetaDeSala): string {
  return etiqueta ? `[${etiqueta}] ` : "";
}
