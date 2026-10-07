/**
 * lib/documentacion/semillas/customer-success/nexus-para-cse.ts — «Nexus para un CSE, paso a paso».
 *
 * La práctica: qué abrir, qué genera la IA, qué escribe el CSE y qué llega al cliente, de que le
 * asignan una cuenta a que entrega el proyecto. «¿Cómo funciona Nexus?» explica QUÉ es Nexus y con
 * qué se conecta; esta página dice CÓMO se usa en el día a día de una cuenta.
 *
 * Relevada contra el código en producción el 2026-09-30 (origin/main). Describe solo lo que ya está
 * en producción: lo que todavía vive en local (por ejemplo, las exploraciones de venta) no entra
 * hasta que se publique.
 */
import {
  aviso,
  numerado,
  parrafo,
  parrafoRico,
  tabla,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "../bloques";
import { a, pagina } from "./enlaces";

export function construirNexusParaCse(): PaginaSembrada {
  return {
    ...pagina("nexusCse"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "cómo se lleva una cuenta en Nexus, de que te la asignan a que entregas el proyecto: qué abrir, qué genera la IA, qué escribes tú y qué llega al cliente.",
      ),
      parrafoRico("Qué es Nexus y con qué se conecta está en ", a("nexus"), ". Acá va la práctica."),

      titulo(2, "Lo que ves al entrar"),
      parrafo("Entras con tu cuenta de Google de Smarteam. En el menú, como CSE, tienes:"),
      tabla([
        ["Sección", "Para qué la usas"],
        ["Clientes", "Tus cuentas y sus proyectos. Es donde pasas la mayor parte del día."],
        ["Éxito del cliente", "Las alertas de tus cuentas: atrasos, clientes que se enfrían, etapas quietas, poca adopción."],
        ["Sesiones", "Las reuniones grabadas, ordenadas por cliente y proyecto."],
        ["Escala", "La Escala de rendimiento vigente, área por área, con sus criterios."],
        ["Documentación", "Esta base de conocimiento."],
        ["Conocimientos", "La biblioteca que leen los agentes de IA cuando escriben un documento."],
        ["Marketing", "Lo que publica Marketing. Lo ves, no lo editas."],
      ]),
      aviso(
        "advertencia",
        ["Si no ves un cliente, ", { negrita: true }],
        "es porque no eres su encargado. En HubSpot, el proyecto tiene que tenerte en «CSL Encargado», y esa asignación la hace el liderazgo.",
      ),

      titulo(2, "Una cuenta, paso a paso"),
      numerado(
        "Te asignan la cuenta. El liderazgo te pone como encargado en HubSpot y la cuenta aparece en Clientes. Si un proyecto nuevo de esa empresa no aparece, en la cuenta usa «Traer de HubSpot».",
      ),
      numerado(
        "Lees lo que se vendió. El proyecto abre en su Resumen: la última y la próxima sesión, la etapa, los pendientes y el «Resumen del proyecto». Debajo está «Información de la venta», el traspaso que escribió Ventas: léelo entero antes de hablar con el cliente.",
      ),
      numerado(
        "Preparas el arranque. Abre el Kickoff, genéralo con IA y completa lo que es tuyo: el equipo, los canales y horarios de atención, y el cierre. Después lo subes al cliente.",
      ),
      numerado(
        "Haces la reunión de arranque, grabada y con el título «Kick Off | Nombre del cliente», y mueves la etapa del proyecto en HubSpot.",
      ),
      numerado(
        "Exploras. En Exploración, el «Cuestionario previo» arma una pestaña por hub: prellénalo con lo que ya sabemos, asigna cada pestaña a la persona del cliente que la contesta y publícalo; cada una recibe su propio enlace. Con las respuestas y las sesiones, la IA arma el informe de exploración.",
      ),
      numerado(
        "Diagnosticas. Activa el Diagnóstico cuando termines de explorar: la IA lo arma con lo que se habló y tú lo revisas. Los niveles se ubican con la Escala de rendimiento. Se presenta en una sesión o en PDF.",
      ),
      numerado(
        "Planificas. Activa la Planificación para acordarla con el cliente. Después genera el Cronograma: la IA te deja una propuesta, la comparas con «Ver como estaba antes» y decides qué aplicas. Para cambiarlo, pídeselo al chat del Asistente. Cuando esté acordado, súbelo al cliente.",
      ),
      numerado(
        "Configuras y acompañas la adopción. En Ejecución están las acciones de configuración. Cada semana marca el avance en el cronograma y atiende las alertas de Éxito del cliente.",
      ),
      numerado(
        "Si hay desarrollo a medida o integraciones, el documento de Integraciones es el requerimiento técnico que lee Desarrollo.",
      ),
      numerado(
        "Entregas. Activa la Entrega: la IA la redacta, y lo cumplido y lo que queda abierto salen solos del cronograma. Súbela al cliente y lleva la etapa a Entrega en HubSpot. Entre 60 y 90 días después, se vuelve a medir con la Escala.",
      ),

      titulo(2, "Los documentos del proyecto"),
      parrafo(
        "Un proyecto nace con la Información de la venta, el Kickoff, la Exploración y el Cronograma. El resto lo activas tú con «+» cuando llega su momento.",
      ),
      tabla([
        ["Documento", "Cuándo", "La IA escribe", "Tú escribes o decides", "¿Lo ve el cliente?"],
        ["Información de la venta", "Al recibir la cuenta", "— (lo escribe Ventas)", "Lo lees y completas su contexto", "No"],
        ["Kickoff", "Arranque", "El texto", "Equipo, canales, horarios y cierre", "Sí, al subirlo"],
        ["Exploración", "Después del arranque", "El informe de exploración", "El cuestionario y a quién se lo mandas", "Solo el cuestionario"],
        ["Diagnóstico", "Al terminar de explorar", "El borrador", "La revisión y los niveles", "En sesión o PDF"],
        ["Planificación", "Antes de configurar", "El plan", "Los ajustes con el cliente", "Lo aprueba el cliente"],
        ["Cronograma", "Siempre", "La propuesta de fases y tareas", "Qué se aplica, fechas y responsables", "Sí, al subirlo"],
        ["Ejecución", "Configuración", "Las acciones", "El avance", "No"],
        ["Integraciones", "Si hay desarrollo a medida", "El requerimiento técnico", "La revisión", "Sí, al subirlo"],
        ["Entrega", "Al cierre", "El texto", "La revisión", "Sí, al subirlo"],
      ]),
      aviso(
        "advertencia",
        ["Lo que escribe la IA es un borrador. ", { negrita: true }],
        "Lo revisas siempre antes de darlo por bueno, y con más razón antes de que lo vea el cliente. Regenerar no destruye nada: cada documento guarda sus versiones anteriores y se pueden restaurar.",
      ),

      titulo(2, "Qué ve el cliente"),
      parrafo(
        "El cliente nunca entra a Nexus. En la barra del proyecto, «Acceso del cliente» te da un enlace y una contraseña que sirven para todos sus documentos publicados; se los mandas por correo.",
      ),
      vinneta("Cada documento se publica aparte, con «Subir al cliente». Hasta entonces no ve nada, ni los borradores."),
      vinneta("Del cronograma ve la foto que subiste, no lo que estás cambiando."),
      vinneta("«Revocar acceso» corta el enlace; «Regenerar» crea uno nuevo con otra contraseña."),
      vinneta("El cuestionario de la exploración es la excepción: cada persona tiene su enlace, sin contraseña."),

      titulo(2, "Las reuniones"),
      vinneta(
        "Nexus lee las reuniones de Google Meet del equipo con su transcripción (las notas de Gemini), y las ubica en su cliente y proyecto por el título.",
      ),
      vinneta("El título va como «Tema | Nombre del cliente», con el nombre del cliente tal como está en HubSpot."),
      vinneta("Después de cada reunión, la IA arma la minuta y los compromisos como borrador: quedan en los Pendientes del proyecto."),
      vinneta(
        "Una reunión sin transcripción no alimenta ningún documento. Si no se pudo grabar, escribe ese mismo día las tres líneas de lo que se acordó.",
      ),
      vinneta("Una reunión que no encontró su cliente queda en Sesiones, sin dueño, y se ubica a mano."),

      titulo(2, "Lo que haces en HubSpot"),
      parrafo(
        "HubSpot es el tablero del negocio, y mantenerlo al día es parte de tu trabajo: la etapa del proyecto, el motivo si está bloqueado y el estado de adopción. Nexus lo lee de ahí.",
      ),
      parrafo(
        "Las etapas de un proyecto de implementación: Handoff → Exploración → Diagnóstico → Planificación → Configuración técnica → Adopción → Validación de uso → Entrega.",
      ),

      titulo(2, "La IA, a tu lado"),
      vinneta("«Generar» en cada documento dispara al agente que lo escribe. Mientras trabaja, lo ves en «Corridas», al pie del menú."),
      vinneta(
        "Al costado de cada documento hay un chat: le pides un cambio en palabras y te dice qué implica antes de tocar nada. Lo aplicas tú.",
      ),
      vinneta(
        "Algunas partes la IA no las escribe a propósito, porque son tu criterio: el equipo del cliente, los canales y horarios, los indicadores que se le comprometen.",
      ),

      titulo(2, "Lo que no te toca"),
      vinneta("Borrar tareas o fases del cronograma: tú suspendes lo que no va; borrar es del líder."),
      vinneta("Reasignar una cuenta o marcar un proyecto como interno: lo hace el liderazgo."),
      vinneta("Escribir el traspaso: es de Ventas."),
      vinneta("Cobrar y facturar: es de Administración. Si el cliente menciona un tema de pago, avisas y sigues con lo tuyo."),

      titulo(2, "Seguir leyendo"),
      parrafoRico("El recorrido de una cuenta y qué cierra cada etapa: ", a("guiaCse"), "."),
      parrafoRico("Con qué vara medimos a un cliente: ", a("escala"), "."),
      parrafoRico("Cómo se graba y se nombra una reunión, y por dónde se habla cada cosa: ", a("trabajar"), "."),
    ],
  };
}
