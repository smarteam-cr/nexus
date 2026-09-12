/**
 * lib/documentacion/semillas/customer-success/relacion.ts — «La relación con el cliente» y sus tres
 * hijas: empatía y confianza, antes de una reunión, y descubrimiento.
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * · La ecuación de confianza es de Maister, Green y Galford («The Trusted Advisor»).
 * · La técnica de descubrimiento es SPIN (Neil Rackham), adaptada.
 * · El criterio por tamaño de cliente es el que ya usan los agentes de diagnóstico
 *   (`scripts/seed-caminos-opuestos.ts`): la página y los agentes tienen que decir lo mismo.
 * · El banco de preguntas NO se tipea: sale del reglamento de la Escala (`leerReglamentoV5`), igual
 *   que las subpáginas de área. Si la Escala cambia, esta lista cambia con ella.
 *
 * ⚠ El agente «Preparación de entrevistas» existe en la base pero nunca corrió y no tiene botón en
 * ninguna pantalla (verificado el 2026-09-12). Por eso la preparación no lo nombra: una guía que
 * manda a usar algo que no se puede usar pierde crédito en la primera lectura.
 */
import {
  aviso,
  cita,
  desplegable,
  divisor,
  enlace,
  parrafo,
  parrafoRico,
  tarea,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { leerReglamentoV5 } from "../escala-v5";
import { a, pagina } from "./enlaces";

/* ── Empatía y confianza ────────────────────────────────────────────────────── */

function construirEmpatiaYConfianza(): PaginaSembrada {
  return {
    ...pagina("confianza"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "la empatía es entender el problema del cliente como si fuera nuestro; la confianza es lo que se gana cuando, además, cumplimos lo que prometimos.",
      ),

      titulo(2, "La ecuación de la confianza"),
      parrafoRico(
        "David Maister, Charles Green y Robert Galford la resumieron en ",
        enlace("una fórmula", "https://trustedadvisor.com/build-trust/trust-equation"),
        " que sirve para diagnosticar dónde se está perdiendo:",
      ),
      cita("Confianza = (Credibilidad + Confiabilidad + Intimidad) ÷ Auto-orientación"),
      tarjetas(
        "2",
        tarjeta(
          "Credibilidad — ¿nos creen?",
          "Sale de lo que decimos. Se gana hablando con precisión, reconociendo lo que no sabemos y explicando cada recomendación con el problema que resuelve.",
          "En una implementación: «esto no lo hace tu plan actual», dicho a tiempo, vale más que diez respuestas seguras.",
        ),
        tarjeta(
          "Confiabilidad — ¿cumplimos?",
          "Sale de lo que hacemos. Se gana con compromisos chicos cumplidos, uno detrás de otro.",
          "En una implementación: la fecha pactada, la minuta que llega el mismo día, el pendiente cerrado cuando se dijo.",
        ),
        tarjeta(
          "Intimidad — ¿se sienten seguros contándonos la verdad?",
          "Es que el cliente pueda decir «esto no lo estamos usando» o «mi jefe no está convencido» sin sentirse juzgado.",
          "En una implementación: es lo que hace que el problema real aparezca en la segunda reunión y no en la de cierre.",
        ),
        tarjeta(
          "Auto-orientación — ¿de quién es la agenda?",
          "Divide todo lo anterior. Es cuánto se nota que pensamos en nosotros: cerrar el proyecto, vender la siguiente cosa, tener la razón.",
          "En una implementación: proponer una expansión antes de que el cliente adopte lo que ya compró la dispara de golpe.",
        ),
      ),
      aviso(
        "advertencia",
        "La auto-orientación divide. Un CSE muy creíble y muy cumplidor pierde la confianza igual si el cliente siente que la reunión era para nosotros.",
      ),

      titulo(2, "Prácticas que construyen confianza"),
      titulo(4, "Escuchar para entender"),
      vinneta(
        "Repetir el problema con las palabras del cliente antes de proponer nada: «entonces lo que te preocupa es que los vendedores no cargan las oportunidades».",
      ),
      vinneta("Preguntar por la consecuencia, no solo por el síntoma: qué pasa si esto sigue igual tres meses más."),
      vinneta("No completar las frases del cliente ni adelantar la solución a mitad de su explicación."),
      titulo(4, "Prometer lo que se cumple"),
      vinneta("Comprometer las fechas que dependen de nosotros; lo que depende del cliente se pide con fecha y por escrito."),
      vinneta("Si algo se va a atrasar, avisar antes de que el cliente lo note."),
      vinneta("Cerrar cada reunión con compromisos con dueño y fecha, y cumplirlos."),
      titulo(4, "Decir la verdad temprano"),
      vinneta("La conversación difícil se tiene cuando todavía cambia algo, no cuando ya es un reclamo."),
      vinneta("Reconocer lo que no sabemos: «lo verifico y te confirmo el jueves» es una respuesta que suma."),
      vinneta("Registrar por qué se movió una fecha antes de que el cliente lo pregunte."),
      titulo(4, "Estar presente"),
      vinneta("Lo importante se habla cara a cara, en Meet, no por chat."),
      vinneta("Cada cuenta tiene su próxima reunión agendada: una cuenta sin próximo paso se enfría."),
      vinneta("Con el cliente se habla de «tu equipo de Smarteam»: los nombres de los roles internos son nuestros."),

      titulo(2, "Qué NO es empatía"),
      tarjetas(
        "2",
        tarjeta(
          "Regalar alcance",
          "Aceptar cada pedido para no incomodar se siente amable y es lo contrario: el proyecto se estira, el margen se va y la próxima promesa vale menos.",
        ),
        tarjeta(
          "Darle la razón en todo",
          "Un cliente que escucha solo lo que quiere oír no recibe lo que contrató, que es criterio. La empatía entiende el problema; no se lo esconde.",
        ),
        tarjeta(
          "Hacer lo que le toca al cliente",
          "Resolver por su equipo lo que su equipo tenía que hacer deja una implementación que nadie adopta.",
        ),
        tarjeta(
          "Esconder una mala noticia",
          "Postergarla para cuidar la relación la rompe el día que el cliente la descubre.",
        ),
      ),

      titulo(2, "Señales de que la confianza se está rompiendo"),
      vinneta("El cliente deja de contestar, o manda a alguien de menor rango a las reuniones."),
      vinneta("Pide todo por escrito y con copia a su jefe."),
      vinneta("Discute cada punto del cronograma o reabre decisiones que ya estaban tomadas."),
      vinneta("Un usuario clave deja de aparecer."),
      parrafoRico(
        "Cualquiera de estas es motivo para llevar la cuenta a la revisión con el CSL esa misma semana, con una movida propuesta. La competencia detrás: ",
        a("relacional"),
        ".",
      ),

      divisor(),
      parrafoRico(
        "Para leer más: ",
        enlace("The Trust Equation — Trusted Advisor Associates", "https://trustedadvisor.com/build-trust/trust-equation"),
        ".",
      ),
    ],
  };
}

/* ── Antes de una reunión ───────────────────────────────────────────────────── */

function construirAntesDeUnaReunion(): PaginaSembrada {
  return {
    ...pagina("reunion"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "una reunión con el cliente se gana antes de entrar: se sabe qué se busca, qué pasó la última vez y qué decisión tiene que salir.",
      ),
      parrafo(
        "El protocolo es el mismo para cualquier reunión de cuenta —descubrimiento, validación, habilitación o entrega— y cambia en profundidad, no en pasos. Veinte minutos con un usuario llevan cinco de preparación; una reunión de alcance con la gerencia lleva una hora.",
      ),

      titulo(2, "El día antes"),
      titulo(4, "Leer lo que ya sabemos"),
      tarea(
        "Los resultados que el cliente necesita alcanzar, en el traspaso del proyecto: es la vara contra la que se mide todo lo demás.",
      ),
      tarea("La minuta y los compromisos de la última reunión: qué quedó pendiente de nuestro lado y del suyo."),
      tarea("El cronograma y sus particularidades: qué se movió y por qué."),
      tarea(
        "Las alertas abiertas de la cuenta y su resumen en Éxito del cliente, que cita de dónde sale cada afirmación.",
      ),
      tarea(
        "Si el cliente hizo el Diagnóstico de Rendimiento: la nota que dejó en HubSpot, con el nivel de cada dimensión y el ángulo para Ventas.",
      ),
      titulo(4, "Decidir para qué es la reunión"),
      tarea("El objetivo en una frase: «salimos con el proceso de calificación acordado», no «revisar avances»."),
      tarea("La decisión que tiene que tomar el cliente, si hay una, y quién la toma."),
      tarea("Dos o tres hipótesis a confirmar o descartar, escritas antes de entrar."),
      titulo(4, "Avisar"),
      tarea("La agenda enviada al cliente, con lo que necesitamos que traiga o decida."),
      tarea("La invitación con enlace de Meet y el nombre bien puesto: Tema | Nombre del cliente."),

      titulo(2, "Treinta minutos antes"),
      tarea("Revisar si llegó algo nuevo: un correo, un mensaje en el grupo del proyecto, una alerta."),
      tarea("Tener abierto lo que se va a mostrar, para no buscarlo en vivo."),
      tarea("Si entra el CSL: acordar quién conduce y para qué está (escuchar, destrabar o decidir)."),

      titulo(2, "Durante"),
      vinneta("Grabar desde el principio, avisando. Sin transcripción, la reunión no alimenta ningún documento."),
      vinneta("Abrir con el objetivo y cerrar con él: ¿se logró?"),
      parrafoRico("Escuchar más de lo que se habla. Las preguntas y cómo ordenarlas: ", a("descubrimiento"), "."),
      vinneta("Anotar textual cuando el cliente nombra un problema: son la mejor evidencia de un diagnóstico."),

      titulo(2, "Después"),
      tarea("Revisar la minuta que arma Nexus el mismo día. Es un borrador: se corrige lo que esté mal."),
      tarea("Compromisos con dueño y fecha, de nuestro lado y del cliente."),
      tarea("La etapa y el estado del proyecto al día en HubSpot, si la reunión los movió."),
      tarea("Si salió un dolor nuevo, escribirlo donde el resto lo pueda leer: es la medida semanal del CSE."),
      tarea("Si salió una necesidad fuera del alcance, anotarla como oportunidad, no aceptarla como trabajo extra."),
      aviso(
        "advertencia",
        "Una reunión sin objetivo escrito, sin grabación o sin compromisos no se aprovecha: se repite. Y cada repetición le cuesta al cliente la confianza de que su tiempo importa.",
      ),

      divisor(),
      parrafoRico(
        "Relacionadas: ",
        a("descubrimiento"),
        " · ",
        a("confianza"),
        " · ",
        a("trabajar"),
        ".",
      ),
    ],
  };
}

/* ── Descubrimiento ─────────────────────────────────────────────────────────── */

/** El banco de preguntas: un desplegable por área, con las preguntas de sus ocho dimensiones. */
function bancoDePreguntas(): { version: string; bloques: BloqueGuardado[] } {
  const reglamento = leerReglamentoV5();
  const bloques = reglamento.areas.map((area) => {
    const base = area.dimensiones.filter((d) => d.capa === "base");
    const produccion = area.dimensiones.filter((d) => d.capa === "produccion");
    return desplegable(area.nombre, [
      parrafoRico(["Base operativa: cómo está montado por dentro", { negrita: true }]),
      ...base.map((d) => vinneta(`${d.id} ${d.nombre} — ${d.pregunta}`)),
      parrafoRico(["Producción: qué entrega hacia afuera", { negrita: true }]),
      ...produccion.map((d) => vinneta(`${d.id} ${d.nombre} — ${d.pregunta}`)),
    ]);
  });
  return { version: reglamento.version, bloques };
}

function construirDescubrimiento(): PaginaSembrada {
  const banco = bancoDePreguntas();
  return {
    ...pagina("descubrimiento"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "descubrir es lograr que el cliente cuente cómo trabaja de verdad —y qué le cuesta— antes de proponerle nada.",
      ),

      titulo(2, "Para qué sirve"),
      parrafo(
        "El descubrimiento alimenta todo lo que sigue: la exploración, el diagnóstico y lo que finalmente se implementa. Si se descubre mal, se configura bien lo que no hacía falta. Por eso el CSE tiene una medida semanal: dos sesiones de descubrimiento con un dolor nuevo entendido y escrito.",
      ),
      parrafo(
        "En Nexus, la Exploración separa lo que el cliente ya nos dijo de lo que estamos dando por supuesto. Las preguntas de una sesión de descubrimiento salen justamente de esa segunda lista.",
      ),

      titulo(2, "La técnica: de la situación al valor"),
      parrafoRico(
        "Se usa una versión de ",
        enlace("SPIN, de Neil Rackham", "https://www.huthwaiteinternational.com/blog/spin-selling-questions"),
        ": cuatro tipos de pregunta, en este orden. La secuencia importa porque lleva al cliente a ponerle palabras —y números— al costo de no cambiar.",
      ),
      tarjetas(
        "2",
        tarjeta(
          "1 · Situación — cómo trabaja hoy",
          "Confirman lo que ya sabemos. Se usan pocas: aburren, y el cliente siente que no hicimos la tarea.",
          "«¿Quién carga las oportunidades en HubSpot hoy, y en qué momento?»",
        ),
        tarjeta(
          "2 · Problema — qué le cuesta",
          "Buscan dónde duele: lo que tarda, lo que se pierde, lo que depende de una sola persona.",
          "«¿Qué pasa con un lead que entra un viernes a la tarde?»",
        ),
        tarjeta(
          "3 · Consecuencia — qué pasa si sigue igual",
          "Son las más valiosas: hacen que el cliente dimensione el impacto con sus propios números.",
          "«Si un tercio de los leads no recibe respuesta en el día, ¿cuántas ventas estimás que se pierden por mes?»",
        ),
        tarjeta(
          "4 · Valor — qué cambiaría si se resuelve",
          "Hacen que el cliente describa el resultado que quiere. Eso se vuelve la meta del proyecto.",
          "«Si cada lead tuviera respuesta en una hora, ¿qué cambiaría para tu equipo de ventas?»",
        ),
      ),
      titulo(4, "Reglas de la sesión"),
      vinneta("El cliente habla más de la mitad del tiempo. Si hablamos más nosotros, es una presentación."),
      vinneta("Lo que ya está en el traspaso o en la Exploración no se vuelve a preguntar."),
      vinneta("Una pregunta por vez, y esperar: el silencio incómodo suele traer la respuesta verdadera."),
      vinneta("Anotar textual cuando el cliente nombra un problema."),
      vinneta("No proponer soluciones en la sesión: las ideas se anotan y se validan después."),

      titulo(2, "Conectado con el Diagnóstico de Rendimiento"),
      parrafo(
        "El descubrimiento no empieza de cero. Muchos prospectos llegan habiendo hecho el Diagnóstico de Rendimiento público: ocho preguntas, una por dimensión, con una opción por nivel. El resultado deja una nota en HubSpot con el nivel de cada dimensión y un ángulo para Ventas.",
      ),
      tarjetas(
        "3",
        tarjeta(
          "Si hizo el diagnóstico",
          "Se lleva el resultado a la reunión y se valida: «marcaste que el pipeline se revisa cuando alguien se acuerda; contame cómo fue la última vez».",
        ),
        tarjeta(
          "Si no lo hizo",
          "Las preguntas del banco cubren lo mismo: al terminar la exploración tiene que alcanzar para ubicar cada dimensión en su nivel.",
        ),
        tarjeta(
          "En los dos casos",
          "Se busca evidencia, no opiniones: ningún nivel se asigna sin un ejemplo concreto que lo sostenga.",
        ),
      ),
      parrafoRico("Cómo se convierte lo que se escuchó en un nivel: ", a("escala"), "."),

      titulo(2, "El banco de preguntas"),
      parrafo(
        `Una pregunta por dimensión, por área. Salen del reglamento de la Escala (versión ${banco.version}), así que nunca se desalinean. Son el punto de partida: las preguntas de consecuencia y de valor se arman en la sesión, con lo que el cliente va contando.`,
      ),
      ...banco.bloques,

      titulo(2, "Según el tamaño del cliente"),
      parrafo(
        "La misma conversación no sirve para todos. El criterio es el mismo que usan los agentes de diagnóstico, así lo que dice el CSE y lo que escribe la IA no se contradicen:",
      ),
      tarjetas(
        "3",
        tarjeta(
          "Grande — más de 200 personas",
          "Ya conoce sus procesos y sus métricas, y trabajó con consultores. No quiere que le describan lo obvio.",
          "Se buscan causas raíz, contradicciones entre la gerencia y la operación, y oportunidades que no ve. Tono directo y con evidencia.",
        ),
        tarjeta(
          "Mediano — de 30 a 200",
          "Tiene procesos informales y el CRM a medio adoptar. Conoce algunos problemas pero no sus causas.",
          "Mitad mapear lo que hace contra lo que cree que hace, mitad propuestas. Cinco hallazgos como máximo, por impacto. Tono de socio.",
        ),
        tarjeta(
          "Pequeño — menos de 30",
          "Nunca vio su proceso dibujado y no separa marketing de ventas.",
          "Se dibuja el proceso con su lenguaje, se prioriza lo que más impacta sus ingresos y se evita la jerga. Educativo, sin ser condescendiente.",
        ),
      ),

      titulo(2, "Qué se escribe al salir"),
      vinneta("El dolor nuevo, con las palabras del cliente y su consecuencia."),
      vinneta("Qué hipótesis se confirmaron y cuáles se descartaron."),
      vinneta("La evidencia de cada dimensión que se tocó."),
      vinneta("Lo que quedó sin explorar, y con quién hay que hablar para cerrarlo."),

      divisor(),
      parrafoRico(
        "Para leer más: ",
        enlace("SPIN Selling Questions — Huthwaite International", "https://www.huthwaiteinternational.com/blog/spin-selling-questions"),
        ". Relacionadas: ",
        a("reunion"),
        " · ",
        a("escala"),
        ".",
      ),
    ],
  };
}

/* ── La portada ─────────────────────────────────────────────────────────────── */

export function construirRelacion(): PaginaSembrada {
  return {
    ...pagina("relacion"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "la relación con el cliente no es un tono amable: es un método — entender antes de proponer, preparar antes de sentarse y cumplir lo que se dice.",
      ),
      parrafo("Tres piezas que se usan juntas en cada cuenta:"),
      tarjetas(
        "3",
        tarjeta(
          "Empatía y confianza",
          "Qué hace que un cliente nos crea y nos cuente la verdad, y qué lo aleja aunque todo se entregue a tiempo.",
          parrafoRico(a("confianza")),
        ),
        tarjeta(
          "Antes de una reunión",
          "El protocolo para llegar sabiendo qué se busca, qué pasó la última vez y qué decisión tiene que salir.",
          parrafoRico(a("reunion")),
        ),
        tarjeta(
          "Descubrimiento",
          "Cómo preguntar para que el cliente cuente cómo trabaja de verdad, conectado con el Diagnóstico de Rendimiento.",
          parrafoRico(a("descubrimiento")),
        ),
      ),
      parrafoRico(
        "Todo parte de lo que ya se dijo: si la reunión no se grabó, no hay de dónde leer. Cómo se graban y cómo se nombran: ",
        a("trabajar"),
        ".",
      ),
    ],
    hijas: [construirEmpatiaYConfianza(), construirAntesDeUnaReunion(), construirDescubrimiento()],
  };
}
