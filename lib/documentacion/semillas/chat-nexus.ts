/**
 * lib/documentacion/semillas/chat-nexus.ts — la página «El chat Nexus: qué le puedes pedir» (2026-11-24).
 *
 * Vive adentro de «¿Cómo funciona Nexus?» y la abre el enlace «¿Qué puedo pedirte?» del chat vacío
 * (components/asistente/CajonDeNexus.tsx › `ChatVacio`). La crea o la actualiza sola
 * `scripts/seed-pagina-chat-nexus.ts`; la siembra entera (`scripts/seed-documentacion.ts`) también la lleva.
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * Del código del chat del 24 nov, no de la memoria: lib/chat-de-nexus (contar, preguntar y pedir en la preventa),
 * lib/nexus-chat (el chat de la cuenta: sus lecturas, sus operaciones y su alcance), lib/operaciones (lo que se puede
 * proponer), lib/asistente (documentos y cronograma), lib/tareas/chat, lib/exploraciones/escala-con-nexus-server.ts y los
 * «Mejorar con IA» de un pedido. Los topes y los largos salen de las constantes del código (abajo), así un tope cambiado
 * entra en la próxima siembra. Dos van escritos a mano porque su constante vive en un módulo del servidor: los mensajes
 * de Tareas por día y el largo de los «Mejorar con IA» de artefactos y perfiles. `paginas.test.ts` los compara con el
 * código, igual que la lista de documentos con chat (`DOCUMENTOS_CON_CHAT` contra `PIEZAS_CON_CHAT`).
 *
 * ⛔ AL CAMBIAR LO QUE EL CHAT SABE HACER (una operación nueva, un lugar nuevo, un tope), se actualiza esta página y se
 * vuelve a correr el script. Las frases de ejemplo que son pedidos de la preventa las prueba `paginas.test.ts` contra la
 * regla que los reconoce (`esPedidoDeLaCuenta`), con el chat vacío y después de una pregunta de Nexus.
 *
 * ⛔ Sin «Responder con Nexus» de La escala: lo construye otra sesión y se suma al juntarla.
 *
 * AUDIENCIA: el equipo de Smarteam (CS, Ventas). Tuteo, frases cortas, sin nombres de archivos ni de tablas. Sin «$»
 * seguido de un número: la base no lleva cifras de dinero (lo vigila `paginas.test.ts`), así que va «dólares».
 */
import { TOPES } from "@/lib/chat-de-nexus/conversacion";
import { PREGUNTAS_POR_DIA } from "@/lib/chat-de-nexus/respuesta";
import { TOPES_DEL_CHAT } from "@/lib/nexus-chat/constantes";
import { MAX_PEDIDO, PEDIDOS_POR_DIA } from "@/lib/pedirle-a-nexus/contrato";
import { MAX_LARGO_DE_LA_INSTRUCCION } from "@/lib/casos-de-uso/mejorar";
import { SLUG_DEL_CHAT_NEXUS } from "../tipos";
import {
  aviso,
  divisor,
  mencion,
  parrafo,
  parrafoRico,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "./bloques";
import type { BloqueGuardado } from "../tipos";

/** Los mensajes de Tareas por persona y por día (`MAX_TURNOS_DE_TAREAS_POR_DIA`, lib/tareas/chat/turno.ts, del servidor). */
export const MENSAJES_DE_TAREAS_POR_DIA = 30;
/** El largo de un «Mejorar con IA» de un artefacto o de un perfil de puesto (el zod de sus dos rutas, del servidor). */
export const LARGO_DE_UN_PEDIDO_DE_ARTEFACTO = 2000;

/**
 * Los documentos con chat, por su pieza y como se llaman en pantalla. `paginas.test.ts` lo compara con la lista del
 * código (`PIEZAS_CON_CHAT`, menos el cronograma, que tiene su propio lugar en la página): un documento que gana o pierde
 * su chat pone la prueba en rojo.
 */
export const DOCUMENTOS_CON_CHAT: Readonly<Record<string, string>> = {
  kickoff: "Kickoff",
  diagnosis: "Diagnóstico",
  planning: "Planificación",
  "tech-requirements": "Integraciones",
  implementation: "Ejecución",
  delivery: "Entrega",
  "business-case": "la propuesta comercial",
  role: "los documentos de Roles",
};

/**
 * Frases que el chat de la preventa toma SEGURO como un pedido de la cuenta (una tarea, el siguiente paso, la guía), con el
 * chat vacío y también cuando contestan una pregunta de Nexus. Las prueba `paginas.test.ts`: si la regla cambia y alguna
 * deja de reconocerse, la página estaría enseñando algo que no anda.
 */
export const PEDIDOS_DE_EJEMPLO_EN_LA_PREVENTA = [
  "Crea una tarea para llamar al gerente el viernes.",
  "Cambia el siguiente paso: mandar la propuesta el martes.",
  "Agrega a la guía dos preguntas sobre el presupuesto.",
  "Recuérdame llamar a Ana el jueves.",
] as const;

const conPuntos = (n: number) => n.toLocaleString("es-CR");

const enLista = (xs: readonly string[]) => `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

/** «Prueba con:» y una lista de frases entre comillas. */
function ejemplos(...frases: readonly string[]): BloqueGuardado[] {
  return [parrafoRico(["Prueba con:", { negrita: true }]), ...frases.map((f) => vinneta(`«${f}»`))];
}

function bloques(): BloqueGuardado[] {
  const documentos = Object.values(DOCUMENTOS_CON_CHAT);
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "Nexus es el chat de la app. Le cuentas, le preguntas o le pides algo sobre lo que tienes en pantalla. Él propone; tú decides. Nada cambia hasta que aprietas «Aplicar».",
    ),

    titulo(2, "Cómo se abre"),
    vinneta("Con el botón «Nexus», arriba a la derecha: en la preventa, la ficha del cliente, los documentos del proyecto, el cronograma y Tareas."),
    vinneta("Con «✨ Mejorar con IA» en una sección o una parte: abre el mismo chat con esa parte marcada sobre la caja («Sobre…»). La ✕ de esa marca la suelta y vuelves a hablar de todo."),
    vinneta("Se abre a la derecha y la página sigue a la vista. «Más ancho» lo agranda y Escape lo cierra."),
    vinneta("Escribes o dictas. Enter envía y Shift+Enter baja de renglón; en el celular se envía con el botón."),
    vinneta("En la preventa, la ficha, los documentos, el cronograma y Tareas, la conversación queda guardada: si cierras y vuelves, sigue ahí. «Nueva conversación», arriba, empieza otra y la anterior no se borra."),
    vinneta("Los «Mejorar con IA» de un solo pedido (La escala, los casos de uso, los artefactos y el perfil de un puesto) no guardan la conversación: «Nueva conversación», o irte de esa pantalla, borra lo pedido y lo que no aplicaste."),

    titulo(2, "La regla de siempre: Nexus propone, tú aplicas"),
    vinneta("Lo que te propone queda en una lista con casillas. Desmarcas lo que no quieres y aprietas «Aplicar»."),
    vinneta("Lo que propuso y no aplicaste sigue en la lista del mensaje siguiente. No hace falta pedirlo de nuevo."),
    vinneta("Antes de aplicar, Nexus revisa cada cambio contra cómo está todo hoy. Si alguno ya no se puede, no aplica nada y te dice cuál."),
    vinneta("Aplicar respeta tus permisos: lo que no puedes hacer a mano, el chat tampoco lo hace en tu nombre."),
    vinneta("Busca antes de afirmar y te dice de dónde sale cada cosa: la reunión y el día, la nota, la tarea (T-12). Si no lo encuentra, te lo dice. Igual, revisa lo importante antes de usarlo."),
    aviso(
      "advertencia",
      ["Lo que no hace nunca solo: ", { negrita: true }],
      "publicarle algo al cliente ni mandar un correo o un WhatsApp. Si te escribe un mensaje para el cliente, léelo antes de mandarlo: lo mandas tú.",
    ),

    titulo(2, "Qué le puedes pedir, lugar por lugar"),

    titulo(3, "En la preventa"),
    parrafo("Es una sola conversación: ahí cuentas, preguntas y pides."),
    titulo(4, "Contarle lo que sabes del cliente"),
    vinneta("Lo que supiste por WhatsApp, una llamada o en persona. Escrito o dictado."),
    vinneta(`Si falta algo, te hace hasta ${TOPES.rondasDePreguntas} rondas de preguntas cortas.`),
    vinneta("Te muestra «Esto cambia lo que se sabe del cliente»: la nota con tus palabras tal cual y lo que entendió. Con «Guardar» la guardas; con «No guardar» no queda nada."),
    vinneta("Te propone cambios a las tarjetas (Negocio, Embudo, objeciones…). Cada uno se aplica aparte: «Aplicar», «No» o «Aplicar todo»."),
    vinneta("Si lo que contaste cambia La escala, te avisa y la rehace con una cuenta regresiva de 10 segundos. La puedes cancelar."),
    titulo(4, "Preguntarle lo que se habló"),
    vinneta("Responde con las notas del equipo, las tarjetas, lo que aceptó el cliente y las reuniones de la empresa, y te muestra la frase de donde lo saca."),
    vinneta("Si no está en ninguna parte, te dice «No lo sé». Si no tienes acceso a la empresa, responde solo con lo de la preventa y te lo dice."),
    vinneta("Lo que preguntas no se guarda como nota."),
    titulo(4, "Pedirle algo de la cuenta"),
    vinneta("Crear una tarea, cambiarla de estado o pasarla de semana; fijar el siguiente paso de tu equipo; cambiar la guía de la próxima sesión; generar un documento de un proyecto."),
    vinneta("Te deja una lista con «Aplicar», ahí mismo en la conversación."),
    vinneta("Para que lo tome como pedido, empieza por la orden y di sobre qué: «Crea una tarea…», «Cambia el siguiente paso…», «Agrega a la guía…»."),
    vinneta(`Estos pedidos gastan del mismo tope diario por persona que el chat de la ficha (${TOPES_DEL_CHAT.usdPorDia} dólares al día).`),
    vinneta("Acá no anota notas en HubSpot: lo que cuentas va a «Lo que sabes del cliente»."),
    titulo(4, "Si te entendió al revés"),
    vinneta("Debajo de lo que iba a guardar: «¿Era una pregunta? Respóndela»."),
    vinneta("Debajo de una respuesta: «¿Era algo que querías contar? Guardarlo como nota»."),
    ...ejemplos(
      "Marco habló con el gerente por WhatsApp: pierden unos 40.000 dólares al mes en cartera vencida.",
      "¿Qué dijeron de la cobranza?",
      ...PEDIDOS_DE_EJEMPLO_EN_LA_PREVENTA,
    ),

    titulo(3, "En la guía de la próxima sesión"),
    vinneta("«✨ Mejorar con IA» de la guía abre la misma conversación con la marca «Sobre la guía de la sesión…» y pedidos listos en botones. Un clic llena la caja; lo mandas tú."),
    vinneta("Le pides más preguntas, otras repreguntas, preguntas más cortas o quitar alguna."),
    vinneta("Si no le dices cuántas, propone de dos a cuatro. No vuelve a preguntar lo que ya se sabe ni habla de licencias o precios."),
    vinneta("Con la marca puesta, todo lo que escribes es un pedido sobre la guía. Para contar o preguntar algo del cliente, quítala con su ✕."),
    ...ejemplos(
      "¿Qué otras preguntas agregarías?",
      "Mejora las repreguntas de la 2 para que bajen a números",
      "Haz más cortas las preguntas",
    ),

    titulo(3, "En La escala"),
    vinneta("«✨ Mejorar con IA» de la página o de una sección: le pides un cambio y te muestra cada parte con el antes y el después."),
    vinneta("Aplicas o descartas parte por parte, o «Aplicar todo». Lo que escribió el equipo a mano no se reemplaza sin preguntarte."),
    vinneta("Si pides algo interno de la venta (un monto, quién decide), te lo marca: «lo verá el cliente al publicar». Decides tú, parte por parte."),
    vinneta("Aplicar no publica: el cliente no ve el cambio hasta que publiques. «Deshacer» vuelve atrás lo último."),
    vinneta("Si otra persona cambió esa parte mientras tanto, no aplica nada y te muestra qué dice ahora."),
    ...ejemplos("Cambia el titular a algo sobre la cobranza", "Agrega un punto clave sobre el WhatsApp, que es crítico"),

    titulo(3, "En la ficha del cliente"),
    vinneta("Pregúntale lo que Nexus sabe de la cuenta. Lee sus proyectos, las reuniones (y busca adentro de lo que se dijo), las tareas, las notas, los siguientes pasos, los negocios abiertos de HubSpot, las personas con sus tickets, y los correos, notas y llamadas que quedaron en HubSpot."),
    vinneta("Cuéntale lo que pasó fuera de una reunión grabada: te propone la nota de la cuenta (queda también en HubSpot), las tareas que salen de ahí y el siguiente paso, todo en una lista."),
    vinneta("Te puede crear tareas, cambiarles el estado o pasarlas de semana. Una tarea para otra persona le llega como sugerencia."),
    vinneta("Fija el siguiente paso de tu equipo, o de uno que lideras, en la empresa, un negocio o un proyecto. Queda como tarea y en HubSpot."),
    vinneta("Genera, o vuelve a generar, un documento de un proyecto: Kickoff, Diagnóstico, Planificación, Integraciones o Entrega. Volver a generar reescribe lo que escribió la IA; tarda unos minutos."),
    vinneta("Te escribe un WhatsApp o un correo listo para copiar. Léelo antes de mandarlo: lo mandas tú."),
    vinneta("«Sugerencias» te muestra lo que te toca en esa cuenta, sin IA: lo que prometió el cliente y vence, tus tareas vencidas y el siguiente paso de tu equipo, con el WhatsApp listo."),
    ...ejemplos(
      "¿Qué quedó pendiente de la última reunión?",
      "Por WhatsApp hoy me dijeron que mandan la base de contactos el lunes",
      "¿Qué se dijo del pipeline de ventas?",
      "Escríbeme un WhatsApp para recordarles lo que nos deben",
    ),

    titulo(3, "En los documentos"),
    parrafo(`${enLista(documentos)}.`),
    vinneta("El chat aparece cuando el documento ya tiene contenido: la primera vez se usa «Generar»."),
    vinneta("Con «Nexus» hablas de todo el documento; con «✨ Mejorar con IA» de una sección, de esa sección."),
    vinneta("Primero conversan el cambio: te dice qué se puede y qué implica, antes de tocar nada."),
    vinneta("Te puede cambiar un texto, agregar, quitar o mover puntos, y crear, ocultar, mostrar, mover o renombrar secciones, según lo que permita cada documento."),
    vinneta("Cuando una reunión trae novedades para el documento, «✨ Mejorar con IA» desde la novedad abre el chat con esa sección y lo que dejó la reunión."),
    vinneta("«Aplicar» pasa por el editor de siempre y pide tu permiso de editar ese documento."),
    ...ejemplos("Saca la sección de riesgos", "Resume los objetivos en tres puntos", "Mueve el alcance antes del cronograma"),

    titulo(3, "En el cronograma"),
    vinneta("Le preguntas qué pasa si mueves algo: te dice qué fecha se corre antes de cambiarla."),
    vinneta("Te puede alargar o acortar una fase, renombrarla, moverla, crearla o borrarla, sumarle o quitarle una semana y ponerle una nota."),
    vinneta("Con las tareas del plan: moverlas de semana o de fase, crearlas, renombrarlas, borrarlas o cambiarles el responsable."),
    vinneta("Si elegiste reuniones o pegaste notas en «Contexto del cronograma», también las lee."),
    ...ejemplos(
      "¿Qué pasa si alargo una fase dos semanas?",
      "Hay fases duplicadas, ¿se pueden unir?",
      "Quiero mover una tarea de fase, ¿pierdo algo?",
    ),

    titulo(3, "En Tareas"),
    vinneta("La conversación es tuya, no de una cuenta: abarca las cuentas que ves."),
    vinneta("Pídele lo que harías a mano: crear tareas, cambiarles el título, la prioridad o la fecha, pasarlas de semana o decir que una va después de otra."),
    vinneta("Te puede armar un plan entero de tareas, y crear o editar un proyecto de tareas."),
    vinneta("Lo tuyo lo decides tú; lo de otra persona le llega como sugerencia, salvo que puedas asignársela."),
    ...ejemplos(
      "Anótame revisar los copies para el jueves",
      "Sugiérele a una persona del equipo que revise la landing",
      "Arma un plan de onboarding de 30 días para un cliente",
      "¿Qué tengo sin agendar esta semana?",
    ),

    titulo(3, "En los casos de uso"),
    vinneta("«Mejorar con IA» de un caso: le dices qué cambiar en sus actividades. Te propone cómo queda la lista y lo que conviene sumar aparte. Tarda unos 20 segundos."),
    ...ejemplos("Quita la capacitación y suma la integración con WhatsApp."),

    titulo(3, "En los artefactos y en el perfil de un puesto"),
    vinneta("«✨ Mejorar con IA»: describes la mejora y Nexus te propone cada sección cambiada, en el mismo chat. Puede investigar en línea si hace falta."),
    vinneta("Si cierras el chat mientras piensa, la propuesta te espera: el botón queda con un punto. Si te vas de esa pantalla, se pierde."),
    ...ejemplos("Haz las medidas más accionables", "Resume el perfil en menos líneas", "Completa las secciones vacías"),

    titulo(2, "Qué guarda y quién lo lee"),
    tarjetas(
      "2",
      tarjeta(
        "La conversación",
        "En la preventa, la ficha, los documentos, el cronograma y Tareas queda guardada: si cierras y vuelves, sigue ahí. Los «Mejorar con IA» de un solo pedido no la guardan.",
      ),
      tarjeta(
        "Lo que cuentas en la preventa",
        "Queda como nota en «Lo que sabes del cliente», con tus palabras, tu nombre y el día. Debajo, lo que Nexus entendió.",
        "La leen el Resumen de La escala, la memoria de la cuenta (la que usan el chat de la ficha y los agentes de Nexus) y los casos de uso.",
      ),
      tarjeta(
        "Lo que puede llegar al cliente",
        "El Resumen de La escala lee tus notas enteras, y lo que pides en La escala va a la página que ve el cliente: ahí puede salir una cifra o algo interno. Revisa la página antes de publicar.",
        "La memoria de la cuenta es más estricta: a los documentos del cliente pasa solo lo que no es interno (sin montos, negociación ni quién decide) y nunca el texto de tu nota.",
      ),
      tarjeta(
        "Lo que pides",
        "Queda donde vive siempre: la tarea en Tareas, el siguiente paso en Nexus y en HubSpot, la nota de la ficha en HubSpot, el documento en su proyecto.",
      ),
    ),

    titulo(2, "Sus límites"),
    vinneta("En la preventa, la ficha, los documentos y el cronograma, la conversación es sobre una sola empresa y no mezcla clientes. En Tareas, la conversación es tuya y abarca las cuentas que ves."),
    vinneta(
      `En la preventa: hasta ${TOPES.turnosPorConversacion} mensajes por conversación (después, «Nueva conversación») y ${TOPES.turnosPorDia} al día. De esos, hasta ${PREGUNTAS_POR_DIA} preguntas al día: cada una lee todo lo de la cuenta.`,
    ),
    vinneta(
      `En la ficha del cliente: ${TOPES_DEL_CHAT.mensajesPorDia} mensajes al día y ${TOPES_DEL_CHAT.usdPorDia} dólares de gasto al día por persona, sumando todas sus cuentas. Debajo del título ves cuánto lleva la conversación y cuántos mensajes te quedan. Hasta ${TOPES_DEL_CHAT.cambiosPorLista} cambios por lista.`,
    ),
    vinneta(`En Tareas: ${MENSAJES_DE_TAREAS_POR_DIA} mensajes al día. En La escala: ${PEDIDOS_POR_DIA} pedidos al día.`),
    vinneta("En la preventa y en La escala hay además un tope de gasto del mes para todo el equipo: avisa al 80 % y, si se acaba, se sigue el mes siguiente. Y si se agota el presupuesto de IA de todo Nexus, el chat te lo dice."),
    vinneta(
      `Un mensaje puede tener hasta ${conPuntos(TOPES.largoDelMensaje)} caracteres. Los «Mejorar con IA» de un solo pedido aceptan menos: ${conPuntos(LARGO_DE_UN_PEDIDO_DE_ARTEFACTO)} en los artefactos y el perfil de un puesto, ${conPuntos(MAX_PEDIDO)} en La escala y ${conPuntos(MAX_LARGO_DE_LA_INSTRUCCION)} en un caso de uso.`,
    ),
    titulo(4, "Permisos"),
    vinneta("En la preventa, La escala y los casos de uso: poder editar la preventa."),
    vinneta("En la ficha, los documentos del proyecto, la propuesta comercial, el cronograma y Tareas: el permiso «Conversar con el asistente». Lo tienen de base CS, Ventas, Desarrollo y Marketing; lo ajusta la dirección en Equipo. La propuesta comercial pide además el acceso de Ventas."),
    vinneta("Para pedirle cosas de la cuenta desde la preventa: ese mismo permiso y acceso a la empresa. Sin ellos, lo que pides se lee como algo que cuentas o preguntas."),
    vinneta("En los documentos de Roles y el perfil de un puesto: poder administrar Roles."),
    vinneta("Cada cambio pide su permiso al aplicarse. El siguiente paso, solo el de tu equipo o el de uno que lideras. Los montos de los negocios, solo con permiso de Ventas."),

    divisor(),
    parrafoRico(
      "Cómo encaja el chat con el resto de la app: ",
      mencion("como-funciona-nexus", "¿Cómo funciona Nexus?", "🧭"),
      ". Una cuenta de punta a punta: ",
      mencion("nexus-para-un-cse", "Nexus para un CSE, paso a paso", "🧑‍💻"),
      ".",
    ),
    parrafoRico([
      "Esta página es para el equipo: el chat no la lee. ¿Algo no funciona como dice acá? Marca el texto y deja un comentario.",
      { italica: true },
    ]),
  ];
}

/** La página «El chat Nexus: qué le puedes pedir», lista para sembrar. */
export function construirChatNexus(): PaginaSembrada {
  return {
    slug: SLUG_DEL_CHAT_NEXUS,
    titulo: "El chat Nexus: qué le puedes pedir",
    icono: "💬",
    bloques: bloques(),
  };
}
