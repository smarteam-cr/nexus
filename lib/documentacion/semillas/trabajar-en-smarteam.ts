/**
 * lib/documentacion/semillas/trabajar-en-smarteam.ts — la página «¿Cómo trabajar en Smarteam?».
 *
 * Es el acuerdo de convivencia de un equipo que trabaja a distancia: por dónde se habla cada cosa,
 * en cuánto se contesta, cómo se nombra y se graba una reunión, y qué queda escrito.
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * Los canales y el tiempo de respuesta los fijó Elías (2026-09-11). El horario y los canales con
 * el cliente son los que ya vienen por defecto en la sección «Canales de atención» del documento
 * de arranque. Los números de grabación son los que mide Nexus en `/sessions` (cobertura de los
 * últimos tres meses). Lo demás —cómo se escribe cuando no estamos juntos— es práctica conocida de
 * equipos remotos, con sus fuentes enlazadas al final.
 *
 * ⚠ Los números están escritos como orden de magnitud («más de la mitad»), no como cifra exacta:
 * la cifra exacta se mueve sola todos los días y la pantalla de Reuniones la muestra al día.
 *
 * AUDIENCIA: todo el equipo. Lenguaje de negocio, tuteo, cero jerga técnica.
 */
import {
  aviso,
  divisor,
  mencion,
  enlace,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "./bloques";
import type { BloqueGuardado } from "../tipos";

function bloques(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "trabajamos a distancia, así que lo que no queda grabado o escrito en su lugar, para el resto del equipo no pasó.",
    ),

    titulo(2, "Los canales, y para qué sirve cada uno"),
    parrafo(
      "Tener cuatro canales no es el problema; el problema es no saber cuál usar. La regla corta: lo interno del día a día va por Slack, lo que hay que conversar va a una reunión, lo que compromete algo con el cliente va por correo, y lo urgente del proyecto va al grupo de WhatsApp.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "Slack — el día a día interno",
        "Preguntas, avances, coordinación. Se responde en menos de 3 horas dentro del horario de trabajo, aunque la respuesta sea «lo miro a la tarde».",
        "Si algo no puede esperar tres horas, no es un mensaje: es una llamada.",
      ),
      tarjeta(
        "Google Meet — todo lo que hay que conversar",
        "Reuniones internas y con el cliente. Siempre con transcripción, y con el nombre bien puesto.",
        "Media hora de reunión que podía ser un mensaje cuesta media hora por cada persona sentada.",
      ),
      tarjeta(
        "Correo — lo formal con el cliente",
        "Lo que compromete algo —una propuesta, un acuerdo, una fecha, un enlace a un documento— sale por correo, aunque ya se haya hablado por chat.",
        "Es lo único que después se puede citar sin discusión.",
      ),
      tarjeta(
        "WhatsApp — el grupo del proyecto",
        "El canal del día a día con el cliente, con los grupos que se acuerdan en el arranque.",
        "Sirve para destrabar, no para decidir: lo que se decide ahí se pasa al correo o al documento.",
      ),
      tarjeta(
        "Nexus y HubSpot — no son canales",
        "Son donde queda el registro: el cliente, el proyecto, la etapa, los documentos y los compromisos.",
        "Una decisión que solo vive en un chat no existe para quien entre después.",
      ),
    ),
    parrafo("El horario de referencia es de 8:00 a 17:00 en Costa Rica, de lunes a viernes."),

    titulo(2, "Grabar la reunión no es opcional"),
    aviso(
      "peligro",
      "Una reunión sin transcripción no alimenta ningún documento. El traspaso, el arranque, el diagnóstico y la entrega se arman leyendo lo que se dijo: si no quedó grabado, esa conversación no existe para Nexus — y pedirla después de la reunión ya no sirve.",
    ),
    parrafo(
      "No es una preferencia de la herramienta: es la diferencia entre revisar un borrador y escribirlo desde cero. Cada reunión que se graba le ahorra media hora de reconstrucción a quien siga la cuenta, incluido vos dentro de tres meses.",
    ),
    titulo(4, "Dónde estamos hoy"),
    parrafo(
      "Medido sobre las reuniones de los últimos tres meses, más de la mitad no dejó transcripción. Y el dato incómodo: puertas adentro se graba peor que de cara al cliente, que es lo contrario de lo que uno supondría.",
    ),
    parrafo(
      "Nexus lo muestra en la pantalla de Reuniones, con el desglose por persona. No está para señalar a nadie: está porque un número global no dice a quién pedirle que grabe.",
    ),
    titulo(4, "Qué hacés vos"),
    vinneta("Activá las notas de la reunión antes de empezar, no a los diez minutos."),
    vinneta("Avisá que se está grabando. Con el cliente, la primera vez se pide y se deja dicho por qué: para no hacerle repetir lo que ya contó."),
    vinneta("Si la reunión se armó sobre la marcha, igual va con su enlace de Meet: una llamada suelta no deja rastro."),
    vinneta("Si no se pudo grabar, escribí las tres líneas de lo que se acordó en el documento del proyecto, el mismo día."),

    titulo(2, "Cómo se nombra una reunión"),
    parrafoRico(
      "El título de la reunión es lo que permite ordenarla por cliente y proyecto. El formato es ",
      ["Tema | Nombre del cliente", { codigo: true }],
      ", con el nombre del cliente tal como está en HubSpot.",
    ),
    tabla([
      ["Así sí", "Así no", "Por qué"],
      ["Kick Off | Multiquímica", "Reunión", "«Reunión» no dice de quién es ni de qué se trata."],
      ["Avance semanal | SmartAgro", "Meet de Juan", "El nombre de quien la agenda no ubica a nadie."],
      ["Diagnóstico de Ventas | Wherex", "Seguimiento cliente nuevo", "Sin el nombre del cliente hay que abrir la reunión para saber de quién es."],
      ["Interna · Revisión de cartera", "Call", "Las internas también se nombran: se buscan igual."],
    ]),
    parrafo(
      "Cuando el título está bien puesto, la reunión cae sola en su cliente y en su proyecto, y el equipo la encuentra buscando por el tema. Cuando no, alguien tiene que acomodarla a mano.",
    ),

    titulo(2, "Cómo escribimos cuando no estamos juntos"),
    titulo(4, "Primero por escrito; la reunión es para decidir"),
    parrafo(
      "Informar, avisar y compartir un avance se hace por escrito: cada quien lo lee cuando puede y nadie pierde el bloque de trabajo. La reunión se reserva para lo que de verdad la necesita: decidir entre opciones, destrabar algo que se está discutiendo en círculos, o una conversación delicada.",
    ),
    titulo(4, "Un mensaje que se entienda en la primera lectura"),
    parrafo(
      "El modo más caro de escribir a distancia es el mensaje incompleto: obliga a tres idas y vueltas que se estiran todo el día. Tres líneas alcanzan: el contexto, qué necesitás, y qué proponés vos.",
    ),
    aviso(
      "exito",
      ["Ejemplo: ", { negrita: true }],
      "«Multiquímica pidió mover el arranque de la fase 2 al 20. Eso corre la entrega una semana. Yo lo aceptaría y lo dejo anotado como particularidad, salvo que veas un problema. ¿Lo confirmo?»",
    ),
    titulo(4, "La decisión se escribe donde vive el trabajo"),
    parrafo(
      "Lo que se decidió en un chat o en una llamada se anota en el documento del proyecto, en la particularidad o en la tarea. El chat es para llegar al acuerdo; el registro es para que el acuerdo siga existiendo la semana que viene.",
    ),
    titulo(4, "Responder también es trabajo"),
    parrafo(
      "Dentro del horario, tres horas es el techo para contestar en Slack. Una respuesta corta que diga cuándo vas a poder mirarlo vale tanto como la respuesta completa: lo que traba al otro es el silencio, no la espera.",
    ),

    titulo(2, "Qué se espera de una reunión"),
    vinneta("Tiene un tema y alguien que la lleva. Si no hay ninguna de las dos cosas, no hay reunión."),
    vinneta("Se graba, y el título está bien puesto."),
    vinneta("Termina con acuerdos: qué se hace, quién lo hace y para cuándo."),
    vinneta("Los acuerdos quedan en el proyecto, no solo en la cabeza de quien estuvo."),
    parrafo(
      "Nexus arma la minuta y los compromisos a partir de la transcripción, y quedan como borrador para revisar. Es rápido revisar una minuta; es lento reconstruir una reunión.",
    ),

    titulo(2, "Con el cliente"),
    vinneta("Los canales y el horario de atención se acuerdan en el arranque y quedan escritos en ese documento."),
    vinneta("Los documentos se comparten por su enlace, no por captura ni por archivo suelto: el enlace siempre muestra la última versión."),
    vinneta("Lo que compromete alcance, plata o fechas va por correo, aunque se haya hablado por WhatsApp."),
    vinneta("Hablamos de «tu equipo de Smarteam»: los roles internos —CSE, CSL— son nuestros, no del cliente."),

    titulo(2, "Para leer más"),
    parrafoRico(
      "Sobre trabajar de forma asincrónica: ",
      enlace("la guía de comunicación remota de Twist", "https://twist.com/remote-work-guides/remote-team-communication"),
      ".",
    ),
    parrafoRico(
      "Sobre grabar y transcribir como práctica de equipo: ",
      enlace("por qué grabar las reuniones", "https://ticnote.com/en/blog/benefits-of-meeting-transcription"),
      ".",
    ),

    divisor(),
    parrafoRico(
      "Qué hace Nexus con todo esto: ",
      mencion("como-funciona-nexus", "¿Cómo funciona Nexus?", "🧭"),
      ". El recorrido de una cuenta, etapa por etapa: ",
      mencion("guia-de-cse", "Guía de CSE", "🎯"),
      ".",
    ),
  ];
}

/** La página «¿Cómo trabajar en Smarteam?», lista para sembrar. */
export function construirTrabajarEnSmarteam(): PaginaSembrada {
  return {
    slug: "como-trabajar-en-smarteam",
    titulo: "¿Cómo trabajar en Smarteam?",
    icono: "🤝",
    bloques: bloques(),
  };
}
