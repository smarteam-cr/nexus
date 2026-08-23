/**
 * lib/asistente/emision-del-turno.ts — ⭐ QUE EL CHAT NO PUEDA PROMETER UN CAMBIO Y NO REGISTRARLO.
 *
 * ── EL FALLO QUE LO TRAE ─────────────────────────────────────────────────────────────────────
 * Elías, sobre «Objetivos del proyecto» de un kickoff (2026-08-23):
 *
 *   CSE:       «agrega 2 cards más»
 *   Asistente: «Para sumar las 2 tarjetas nuevas necesito saber sobre qué objetivos van…»
 *   CSE:       «invéntalas según el contexto»
 *   Asistente: «Agrego dos objetivos nuevos: la transición desde Pardot y la capacitación del
 *               equipo.»  ← y NADA MÁS: sin lista, sin casillas, sin botón, sin aviso.
 *
 * Las tarjetas nunca entraron. El diagnóstico (26 agentes, cada hallazgo pasado por un escéptico)
 * dio **dos causas encadenadas**, y ninguna era la que parecía:
 *
 * ⭐ **La sección estaba perfecta.** Corriendo las funciones reales: la firma que el modelo ve es
 * `[campos: intro · listas: items[title, detail?]]`, el renderer lee esa MISMA clave, y las dos
 * `item.agregar` naturales pasan el dry-run (2 aceptadas, 0 rechazadas). El modelo tenía todo — de
 * hecho preguntó por «título y detalle», o sea que la había leído.
 *
 * ⛔ **Y el prompt ya lo prohibía**, literal: *«"Elimino el tag X" sin llamar la herramienta no es
 * una respuesta — es una promesa que la persona tiene que volver a pedir»*. El modelo desobedeció
 * una regla que tenía delante. **Por eso la red tiene que ser de código, no de prompt.**
 *
 * ── LAS DOS CAUSAS ──────────────────────────────────────────────────────────────────────────
 * 1. **El único reintento del carril era ciego a la omisión.** Estaba cableado al error de
 *    NOMBRES —operaciones emitidas que el dry-run rechaza— y no al de no emitir nada.
 * 2. **`if (resumenDelModelo && opsDeDoc.length > 0)` no tenía `else`.** Sin acuerdo, el turno se
 *    persiste como texto pelado y la pantalla pinta una burbuja gris. Ninguna de las tres alertas
 *    que existen cubría el caso: la del ⚠ exige RECHAZOS (cero operaciones no es cero rechazos: es
 *    cero de todo) y las otras dos exigen que el texto esté VACÍO.
 *
 * La 2 vuelve invisible a la 1. Arreglar solo la 2 hace el fallo ruidoso; las tarjetas siguen sin
 * entrar. La que hace funcionar el caso es la 1.
 *
 * ── POR QUÉ ESTO VIVE ACÁ Y NO ADENTRO DE `correrTurno` ─────────────────────────────────────
 * El loop vive dentro de una función que llama a Anthropic, así que sus guardas hoy son escaneos
 * de fuente — y un escaneo de fuente envejece mal: sobrevive a cualquier reescritura que conserve
 * la cadena de texto. Estas dos decisiones son puras y se prueban de verdad.
 */

/** Qué hacer después de leer el turno del modelo. */
export type QueHacerConElTurno = "no" | "por-rechazo" | "por-omision";

export interface EstadoDelTurno {
  /** Cuántas operaciones rechazó el dry-run. */
  rechazadas: number;
  /** `true` si el modelo llamó la herramienta del acuerdo en este intento. */
  huboTool: boolean;
  /**
   * Operaciones que este turno podría llegar a ofrecer: las aceptadas de ahora MÁS lo que sigue
   * pendiente de antes.
   *
   * ⚠ Lo pendiente cuenta: si el libro trae algo, el turno YA tiene qué ofrecer y la cajita se va
   * a pintar. Reintentar ahí gastaría una llamada para agregarle un renglón a algo que no está
   * mudo — y el caso que este módulo persigue es el MUDO.
   */
  opsUtilizables: number;
  /** El modelo dejó una pregunta abierta en este turno. */
  preguntaAbierta: boolean;
}

/**
 * ⭐ EL MISMO SLOT DE REINTENTO, CON EL DISPARADOR MÁS ANCHO.
 *
 * ⛔ **Un solo reintento por turno, y eso no se negocia**: un loop sin corte no falla, encadena
 * llamadas que nadie ve hasta que aparecen en la factura. Lo que cambia es CUÁNDO se usa el slot,
 * no cuántos slots hay.
 *
 * ⛔ **Y no se reintenta cuando el modelo dejó una pregunta abierta.** Preguntar con cero
 * operaciones es legítimo —el pedido era ambiguo y el prompt le pide preguntar—, así que empujarlo
 * ahí sería empujarlo a INVENTAR justo donde tuvo razón en no hacerlo. Es el mismo criterio que
 * hace que `tool_choice` esté descartado: forzar la herramienta convierte una pregunta honesta en
 * un acuerdo que nadie pidió.
 */
export function decidirReintento(e: EstadoDelTurno): QueHacerConElTurno {
  /* El rechazo va primero: si hay operaciones rechazadas hubo herramienta, y corregir nombres es
     lo que más veces salva el turno. */
  if (e.rechazadas > 0 && e.huboTool) return "por-rechazo";
  if (e.opsUtilizables === 0 && !e.preguntaAbierta) return "por-omision";
  return "no";
}

/**
 * Lo que se le dice al modelo cuando cerró el turno sin emitir nada.
 *
 * Dos textos, porque los dos casos son distintos:
 *  · llamó la herramienta y la mandó vacía → es una contradicción con su propia llamada;
 *  · no la llamó → puede ser legítimo, así que se le recuerdan las tres excepciones y se le deja
 *    la salida de contestar en texto. Sin esa salida, el reintento es una forma de forzar la
 *    herramienta con otro nombre.
 */
export function reclamoDeOmision(huboTool: boolean): string {
  if (huboTool) {
    return (
      "Llamaste `registrar_cambio_acordado` y no emitiste ninguna operación (o la mandaste sin " +
      "`resumen`). Así no queda registrado NADA y la persona no ve ningún cambio para aplicar. " +
      "Emite ahora las operaciones concretas, con el texto ya escrito. Si de verdad no corresponde " +
      "ningún cambio, no llames la herramienta y contesta en texto por qué."
    );
  }
  return (
    "Tu mensaje anuncia un cambio y no llamaste `registrar_cambio_acordado`: no quedó registrado " +
    "nada, la persona no ve ninguna lista ni ningún botón, y va a tener que pedírtelo otra vez. " +
    "Emítela ahora con las operaciones concretas y el texto ya escrito.\n" +
    "Si de verdad NO corresponde emitirla —el pedido no entra en el vocabulario, te preguntaron " +
    "qué se puede hacer, o ibas a vaciar una sección— contesta igual en texto y no la llames."
  );
}

export interface CierreDelTurno {
  /** `true` si el turno terminó con un acuerdo que la pantalla va a pintar. */
  hayAcuerdo: boolean;
  /** `true` si el modelo llamó la herramienta en el intento vigente. */
  huboTool: boolean;
  /** `true` si ya se gastó el reintento pidiéndole que emitiera. */
  seReintentoPorOmision: boolean;
}

/**
 * ⭐ EL AVISO QUE FALTABA: un turno mudo deja de ser mudo.
 *
 * Se dice en dos casos, y los dos son mecánicos —nunca se deduce del texto del modelo, que es
 * *copy* y ya cambió dos veces en este repo—:
 *  · **llamó la herramienta y no quedó nada** → su propia llamada dice que había un acuerdo;
 *  · **se le reclamó por omisión y siguió sin emitir** → le preguntamos y no contestó con nada.
 *
 * ⛔ Y se CALLA cuando no llamó la herramienta y no hubo reclamo: ahí lo más probable es una
 * respuesta legítima («eso no se toca desde acá», «esto es lo que puedo hacer»), y meterle un ⚠ a
 * cada una enseñaría a ignorar el ⚠ — que es exactamente cómo muere una alerta.
 *
 * ⚠ En tuteo neutro: es la voz del asistente, se persiste en el hilo y el modelo la relee.
 */
export function avisoDeTurnoSinAcuerdo(c: CierreDelTurno): string | null {
  if (c.hayAcuerdo) return null;
  if (!c.huboTool && !c.seReintentoPorOmision) return null;
  return (
    "⚠ No dejé registrado ningún cambio en este turno, así que no hay nada para aplicar. " +
    "Pídemelo de nuevo diciendo qué sección y qué texto quieres, y lo dejo listo."
  );
}
