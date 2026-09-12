/**
 * lib/documentacion/semillas/como-funciona.ts — la página «¿Cómo funciona Nexus?».
 *
 * Es el manual que hasta el 2026-09-11 vivía escrito en el código y era la pantalla entera del
 * módulo. Ahora es una página de la base: el texto narrativo se puede editar desde la app, y las
 * LISTAS —el menú, las etapas, los documentos, los agentes, HubSpot y los roles— son bloques
 * vivos que se arman solos desde los registros. Esa mitad no puede envejecer.
 *
 * ── LO QUE SE CORRIGIÓ AL MUDARLO ────────────────────────────────────────────
 * El manual viejo decía dos cosas que dejaron de ser ciertas el 2026-07-30: que Nexus DEDUCE la
 * etapa del proyecto, y que nunca escribe etapas ni propiedades en HubSpot. Hoy la etapa la manda
 * HubSpot, y Nexus escribe estado y etapa cuando el CSE confirma la sugerencia (además del CSE
 * encargado y la marca de proyecto interno). Acá va la versión correcta.
 *
 * AUDIENCIA: el equipo de Smarteam (CS, Ventas, Marketing, Finanzas). Lenguaje de negocio, tuteo,
 * cero jerga técnica: nada de nombres de tabla, de archivo ni de función.
 */
import {
  aviso,
  bloqueVivo,
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

function bloques(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "Nexus es el lugar donde vive lo que sabemos de cada cliente. Escucha las reuniones, las ordena por cliente y proyecto, y arma con eso los documentos con los que trabajamos.",
    ),

    titulo(2, "Qué es Nexus"),
    parrafo(
      "Nexus escucha las reuniones que el equipo tiene con los clientes, las ordena por cliente y proyecto, y a partir de ahí arma los documentos con los que trabajamos: el traspaso de Ventas a Customer Success, el arranque, el cronograma, el diagnóstico.",
    ),
    parrafo(
      "No reemplaza a HubSpot ni compite con él. HubSpot sigue siendo donde vive el negocio —las empresas, los tratos, los proyectos y su etapa—. Nexus lee de ahí y le devuelve el trabajo hecho.",
    ),
    parrafo(
      "La idea de fondo es que nadie tenga que reconstruir el contexto de un cliente a mano. Si la información ya se dijo en una reunión, Nexus la tiene; lo que hace falta es revisarla y corregirla, no escribirla desde cero.",
    ),

    titulo(2, "Qué te ahorra"),
    parrafo("Lo que sigue no es una promesa de la herramienta: es lo que efectivamente deja de hacerse a mano."),
    tarjetas(
      "2",
      tarjeta(
        "Escuchar grabaciones para entender qué se vendió",
        "El traspaso se arma leyendo las sesiones de venta del proyecto. En vez de repasar seis reuniones, revisás un documento y corregís lo que esté mal.",
      ),
      tarjeta(
        "Rearmar el cronograma desde cero en cada proyecto",
        "El plan se propone a partir de lo que se vendió y del tipo de proyecto. Vos ajustás fechas y responsables; no partís de una hoja en blanco.",
      ),
      tarjeta(
        "Perder el contexto cuando alguien cambia de proyecto",
        "Todo lo que se habló con un cliente queda junto y atado a él. Quien entra después lee, no pregunta.",
      ),
      tarjeta(
        "Preguntar dos veces lo mismo",
        "La guía de exploración separa lo que el cliente YA nos dijo de lo que estamos dando por supuesto, y las preguntas salen de ahí.",
      ),
      tarjeta(
        "Escribirle al cliente desde una hoja en blanco",
        "Los documentos que ve el cliente —arranque, cronograma, propuesta— salen con el tono y la línea gráfica de Smarteam, listos para revisar.",
      ),
    ),

    titulo(2, "Qué NO hace Nexus"),
    parrafo("Tan importante como lo que hace es dónde termina, para no buscar acá algo que vive en otro lado."),
    tarjetas(
      "2",
      tarjeta(
        "No es el CRM",
        "Las empresas, los tratos y la etapa de cada proyecto se manejan en HubSpot. La etapa la movés allá; Nexus la refleja, y puede sugerirte un cambio que vos confirmás con un clic.",
      ),
      tarjeta(
        "No es contabilidad",
        "Cobranza controla a quién le toca cobrar y cómo va cada cobro. Las facturas y la conciliación viven en Odoo y Mercury.",
      ),
      tarjeta(
        "No decide por vos",
        "Todo lo que escribe un agente es un borrador. Nada se publica al cliente ni se da por bueno sin que una persona lo revise.",
      ),
      tarjeta(
        "No manda correos solo",
        "Cuando redacta un mensaje de cobro, lo deja listo para que vos lo edites y lo envíes.",
      ),
    ),

    titulo(2, "El menú, sección por sección"),
    parrafo("Qué hay en cada parte de la app y quién la ve. Esta lista sale del propio menú: no se escribe a mano."),
    bloqueVivo("menu"),

    titulo(2, "Cómo avanza un proyecto"),
    parrafo(
      "Un proyecto de implementación recorre estas etapas en orden. La etapa la mueve el equipo en HubSpot y Nexus la refleja; cuando Nexus nota que el proyecto ya avanzó, te sugiere el cambio y vos lo confirmás.",
    ),
    parrafo(
      "Las etapas con documento son en las que hay algo que abrir y trabajar. Las que aparecen como hito no tienen documento a propósito: se marcan cuando ocurren y ya.",
    ),
    bloqueVivo("recorrido"),

    titulo(2, "Los documentos de cada proyecto"),
    parrafo(
      "Cada proyecto tiene un menú de documentos. Algunos nacen con el proyecto y otros aparecen solo si hacen falta. Los que dicen «lo ve el cliente» se le pueden publicar con un enlace; el resto son de uso interno.",
    ),
    bloqueVivo("documentos"),

    titulo(2, "Los agentes de IA"),
    parrafo(
      "Un agente es una tarea de inteligencia artificial con un encargo concreto: leer cierto material y escribir cierto documento. No es un chat: no se conversa con él, se dispara y devuelve un borrador.",
    ),
    parrafo("Algunos los disparás vos con el botón «Generar» del documento. Otros corren solos cuando entra una reunión nueva."),
    aviso("advertencia", "Lo que escribe un agente SIEMPRE es un borrador. Se revisa antes de darlo por bueno, y con más razón antes de que lo vea el cliente."),
    bloqueVivo("agentes"),

    titulo(2, "El asistente que conversa sobre un documento"),
    parrafo(
      "Al costado de un documento hay un chat. Le pedís un cambio en palabras —«corré la fase 2 dos semanas», «sacá esta sección»— y te dice qué es posible y qué implica antes de tocar nada.",
    ),
    parrafo(
      "El asistente nunca escribe solo: cuando estás de acuerdo, «Aplicar» pasa por el editor de siempre y respeta tus permisos. Si no podés editar ese documento, tampoco puede el chat en tu nombre.",
    ),

    titulo(2, "De dónde salen las reuniones"),
    parrafo(
      "Nexus lee el calendario de Google del equipo y toma las reuniones de Meet con su transcripción (las notas de Gemini). Se sincroniza sola cada tanto mientras alguien está usando la app.",
    ),
    parrafo(
      "Si una reunión no quedó grabada, Nexus lo avisa en vez de inventar: esa reunión no va a alimentar ningún documento.",
    ),

    titulo(2, "Cómo se conecta con HubSpot"),
    parrafo(
      "HubSpot es la fuente de verdad del negocio: las empresas, los tratos y los proyectos con su etapa. Nexus se conecta a nuestro portal y trabaja sobre eso. La relación es principalmente de lectura: mira mucho y escribe poco.",
    ),
    titulo(4, "Qué escribe"),
    parrafo(
      "Crea el proyecto al dar un traspaso y lo asocia a la empresa y al trato; marca a la empresa como en onboarding; actualiza el estado y la etapa del proyecto cuando el CSE confirma la sugerencia; cambia el CSE encargado (solo liderazgo); marca un proyecto como interno; y deja borradores de publicaciones sociales.",
    ),
    titulo(4, "Qué NO toca"),
    parrafo(
      "No edita tratos, no cambia propiedades de empresas ni de contactos, y no borra nada. Publicar una publicación social la hace una persona.",
    ),
    bloqueVivo("hubspot"),

    titulo(2, "Las otras conexiones"),
    parrafoRico(["Odoo. ", { negrita: true }], "Solo lectura: Nexus copia las facturas de venta para mostrarlas al lado de cada cobro. Nunca escribe en Odoo."),
    parrafoRico(["Claude (la IA). ", { negrita: true }], "Cada llamada queda medida y tiene un tope de gasto por día. Se ve en Integraciones → Gasto en IA."),
    parrafoRico(["Google. ", { negrita: true }], "El ingreso a la app y las reuniones con su transcripción."),

    titulo(2, "Qué ve el cliente"),
    parrafo(
      "El cliente nunca entra a Nexus. Ve documentos publicados por un enlace: el arranque, el cronograma, el requerimiento técnico y la entrega se abren con una dirección del proyecto y una contraseña que le comparte el CSE.",
    ),
    parrafo(
      "La propuesta comercial se comparte con un enlace secreto, sin contraseña, y los documentos de Roles con un enlace público.",
    ),

    titulo(2, "Con qué vara medimos a un cliente"),
    parrafoRico(
      "El diagnóstico que se le entrega al cliente no puntúa a ojo: usa la Escala de Rendimiento, que define cinco niveles y ocho dimensiones por departamento. El reglamento completo está en ",
      mencion("escala-de-rendimiento", "Escala de rendimiento", "📈"),
      ".",
    ),

    titulo(2, "Los roles del equipo"),
    parrafo("Para qué está cada rol y qué secciones toca por defecto."),
    bloqueVivo("roles"),

    titulo(2, "Dónde se escribe cada cosa"),
    parrafo(
      "Hay tres lugares donde queda escrito lo que sabemos, y se confunden seguido. La diferencia no es el tema: es quién lo lee.",
    ),
    tarjetas(
      "3",
      tarjeta(
        "Documentación (esta base)",
        "Cómo trabajamos y cómo funciona lo que usamos. La leen personas del equipo.",
        "Ningún agente la lee: lo que escribas acá no cambia lo que escribe la IA.",
      ),
      tarjeta(
        "Conocimientos",
        "La biblioteca que leen los agentes cuando arman un documento: reglamentos, catálogos y material de referencia, ordenado por etiquetas.",
        "Si querés que la IA tenga en cuenta algo, va acá.",
      ),
      tarjeta(
        "HubSpot",
        "El negocio: empresas, tratos, proyectos y su etapa.",
        "Si tiene que aparecer en un reporte o moverse en un pipeline, va allá.",
      ),
    ),

    titulo(2, "Cómo se usa esta base"),
    titulo(4, "Escribir y enlazar"),
    vinneta("Una página se escribe con bloques: «/» abre el menú con títulos, listas, tablas, avisos, desplegables y tarjetas."),
    vinneta("«@» enlaza otra página. Si todavía no existe, la crea con ese nombre y la enlaza de una, sin salir de la frase."),
    vinneta("Abajo de cada página aparece «Enlazan acá»: quién la nombra. Por eso conviene enlazar en vez de repetir."),
    titulo(4, "Encontrar y volver atrás"),
    vinneta("Ctrl+K busca en el título y en el texto de todas las páginas, con tildes o sin ellas."),
    vinneta("Cada página guarda su historial: se puede ver una versión anterior y restaurarla."),
    vinneta("Archivar no borra. La papelera guarda la página con sus subpáginas y las devuelve enteras."),
    aviso(
      "info",
      ["Quién puede escribir: ", { negrita: true }],
      "por ahora, Customer Success Lead y la dirección. El resto del equipo lee. Se abre el día que haga falta.",
    ),

    titulo(2, "Seguir leyendo"),
    parrafoRico(
      "Cómo nos comunicamos puertas adentro y qué se espera de cada reunión: ",
      mencion("como-trabajar-en-smarteam", "¿Cómo trabajar en Smarteam?", "🤝"),
      ". El recorrido completo de una cuenta, etapa por etapa: ",
      mencion("guia-de-cse", "Guía de CSE", "🎯"),
      ". Todo lo del departamento que lleva las cuentas —roles, competencias y cómo se trabaja con el cliente—: ",
      mencion("customer-success", "Customer Success", "🌱"),
      ".",
    ),

    divisor(),
    parrafoRico([
      "¿Falta algo o quedó viejo? Esta página se edita como cualquier otra: pedile a un líder que la desbloquee y escribí.",
      { italica: true },
    ]),
  ];
}

/** La página «¿Cómo funciona Nexus?», lista para sembrar. */
export function construirComoFunciona(): PaginaSembrada {
  return {
    slug: "como-funciona-nexus",
    titulo: "¿Cómo funciona Nexus?",
    icono: "🧭",
    bloques: bloques(),
  };
}
