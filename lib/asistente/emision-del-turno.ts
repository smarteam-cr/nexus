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
export type QueHacerConElTurno = "no" | "por-rechazo" | "por-omision" | "por-imitacion";

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
  /**
   * El modelo dejó una pregunta abierta en este turno, DECLARADA en su herramienta.
   *
   * ⛔ Solo existe si llamó la herramienta: es un campo de su input. Ver `preguntaEnElTexto`, que
   * es la mitad que faltaba.
   */
  preguntaAbierta: boolean;
  /**
   * ⭐ EL MODELO PREGUNTÓ SIN LLAMAR LA HERRAMIENTA, y sin esto ese turno se castigaba.
   *
   * El prompt le pide explícitamente NO llamarla en tres casos, y uno es preguntar. Pero
   * `preguntaAbierta` viaja DENTRO de la herramienta, así que en ese caso llega siempre en
   * `false`: un turno que pregunta con razón caía en `por-omision`, gastaba el único reintento —
   * empujándolo a inventar justo donde tuvo razón en no hacerlo— y se llevaba encima un
   * «⚠ no registré nada» que era falso. El docblock de abajo decía que no se reintentaba ahí; el
   * estado era inalcanzable.
   *
   * La señal es mecánica y barata: el texto TERMINA en una pregunta. No se lee la prosa ni se
   * interpreta la intención — se mira el último carácter.
   */
  preguntaEnElTexto?: boolean;
  /**
   * ⭐ El modelo escribió `<<<ACUERDO>>>` DENTRO de su propio texto en vez de llamar la herramienta.
   *
   * Es una señal DURA, no una lectura de la prosa: ese marcador lo pone la app y el modelo no
   * tiene ningún motivo legítimo para escribirlo. Si aparece, quiso dejar un cambio registrado y
   * usó el camino que no registra nada.
   */
  imitoElMarcador: boolean;
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
  /**
   * ⭐ LA IMITACIÓN VA ANTES DEL CHEQUEO DE `opsUtilizables`, Y ESO ES EL ARREGLO.
   *
   * En el caso que Elías vio, el libro de pendientes tenía 2 operaciones, así que `opsUtilizables`
   * era 2 y el reintento por omisión NO disparaba. La premisa —«si hay pendientes el turno no está
   * mudo»— es cierta y era irrelevante: **el turno no estaba mudo, estaba diciendo otra cosa.** La
   * persona leyó «sumo dos objetivos» y la cajita le ofreció aplicar dos borrados que no pidió.
   *
   * El libro ENMASCARABA la omisión. La imitación no depende del libro, así que se pregunta antes.
   */
  if (e.imitoElMarcador && !e.preguntaAbierta) return "por-imitacion";
  if (e.opsUtilizables === 0 && !e.preguntaAbierta && !e.preguntaEnElTexto) return "por-omision";
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
/**
 * ¿El turno termina en una pregunta? Mecánico: el último carácter con contenido es `?`.
 *
 * ⚠ Se mira el FINAL y no «hay un ? en el texto»: el modelo cita preguntas del CSE a mitad de una
 * respuesta que sí cierra con un cambio, y esas no son preguntas suyas. Lo que define un turno de
 * desambiguación es que TERMINA preguntando.
 */
export function terminaEnPregunta(texto: string): boolean {
  const limpio = texto.replace(/[\s"'“”»)\]*_`]+$/u, "");
  return limpio.endsWith("?");
}

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

/**
 * Lo que se le dice al modelo cuando escribió el marcador dentro de su propio texto.
 *
 * ⚠ Nombra el marcador a propósito: el modelo lo VE en su historial —hasta el 2026-08-23 se le
 * mandaba crudo— y sin decirle qué es no tiene forma de saber por qué está mal escribirlo.
 */
export function reclamoDeImitacion(): string {
  return (
    "Escribiste `<<<ACUERDO>>>` dentro de tu mensaje. Ese marcador lo pone la app, no tú: escrito " +
    "en el texto no registra ningún cambio, y la persona lo lee como un bloque de JSON crudo en " +
    "medio de tu respuesta.\n" +
    "Si querías dejar cambios, llama `registrar_cambio_acordado` AHORA con las operaciones. Si no " +
    "corresponde ninguno, contesta en texto SIN el marcador."
  );
}

export interface CierreDelTurno {
  /** `true` si el turno terminó con un acuerdo que la pantalla va a pintar. */
  hayAcuerdo: boolean;
  /** `true` si el modelo llamó la herramienta en el intento vigente. */
  huboTool: boolean;
  /**
   * `true` si ya se gastó el reintento pidiéndole que emitiera —por omisión O por imitación—.
   *
   * ⚠ UNA sola bandera y no una por motivo: dos banderas para el mismo concepto se desincronizan,
   * y lo que decide el aviso no es POR QUÉ se reclamó sino que se reclamó y siguió sin emitir.
   */
  seLeReclamo: boolean;
  /**
   * ⛔ El modelo dejó una pregunta abierta.
   *
   * Sin esto el ⚠ sonaba encima de una pregunta legítima: el chat preguntaba «¿a cuál de los tres
   * te referís?» y abajo aparecía «no dejé registrado ningún cambio», que es obvio y suena a
   * error. Visto en pantalla el 2026-08-23, en el diagnóstico. Un aviso que sobra enseña a
   * ignorar los avisos.
   */
  preguntaAbierta: boolean;
}

/**
 * ⭐ EL AVISO QUE FALTABA: un turno mudo deja de ser mudo.
 *
 * Se dice en dos casos, y los dos son mecánicos —nunca se deduce del texto del modelo, que es
 * *copy* y ya cambió dos veces en este repo—:
 *  · **llamó la herramienta y no quedó nada** → su propia llamada dice que había un acuerdo;
 *  · **se le reclamó y siguió sin emitir** → le preguntamos y no contestó con nada.
 *
 * ⛔ Y se calla también cuando el modelo dejó una PREGUNTA abierta: ahí la pregunta ya explica que
 * no se registró nada, y el ⚠ encima se lee como un error.
 *
 * ⛔ Y se CALLA cuando no llamó la herramienta y no hubo reclamo: ahí lo más probable es una
 * respuesta legítima («eso no se toca desde acá», «esto es lo que puedo hacer»), y meterle un ⚠ a
 * cada una enseñaría a ignorar el ⚠ — que es exactamente cómo muere una alerta.
 *
 * ⚠ En tuteo neutro: es la voz del asistente, se persiste en el hilo y el modelo la relee.
 */
export function avisoDeTurnoSinAcuerdo(c: CierreDelTurno): string | null {
  if (c.hayAcuerdo) return null;
  /* Una pregunta abierta ya explica por sí sola que no se registró nada. */
  if (c.preguntaAbierta) return null;
  if (!c.huboTool && !c.seLeReclamo) return null;
  return (
    "⚠ No dejé registrado ningún cambio en este turno, así que no hay nada para aplicar. " +
    "Pídemelo de nuevo diciendo qué sección y qué texto quieres, y lo dejo listo."
  );
}
