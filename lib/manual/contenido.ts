/**
 * lib/manual/contenido.ts — LO ÚNICO que se escribe a mano de la Documentación.
 *
 * ── LA REGLA DE ESTE MÓDULO ──────────────────────────────────────────────────
 * Acá va SOLO lo que ninguna estructura del código sabe: para qué sirve un documento, cuándo
 * lo abrís, qué te ahorra. Todo lo demás —qué documentos existen, sus secciones, qué agente
 * los genera, en qué etapa se trabajan, los pipelines de HubSpot— se DERIVA de los registros
 * que ya son fuente de verdad (ver `lib/manual/armar.ts`).
 *
 * El motivo es simple: una documentación escrita 100% a mano miente a los tres meses. Ésta se
 * actualiza sola cuando alguien agrega un canvas, y `lib/manual/manual.test.ts` falla si ese
 * canvas nuevo se quedó sin su párrafo — la omisión no puede pasar en silencio.
 *
 * ── AUDIENCIA ────────────────────────────────────────────────────────────────
 * El EQUIPO de Smarteam (CS, Ventas, Marketing, Finanzas). Lenguaje de negocio, tuteo, cero
 * jerga técnica: nada de nombres de tabla, de archivo ni de función. La documentación técnica
 * ya existe y vive en ARCHITECTURE.md / docs/DECISIONS.md — no se duplica acá.
 */

export interface BloqueNarrativo {
  titulo: string;
  parrafos: string[];
  bullets?: { titulo: string; detalle: string }[];
}

export interface DocDePieza {
  /** Qué problema resuelve, en una o dos frases. */
  paraQue: string;
  /** En qué momento del trabajo lo abrís. */
  cuando: string;
}

// ── Pestaña "Cómo funciona" ────────────────────────────────────────────────────

export const QUE_ES: BloqueNarrativo = {
  titulo: "Qué es Nexus",
  parrafos: [
    "Nexus es el lugar donde vive lo que sabemos de cada cliente. Escucha las reuniones que el equipo tiene con ellos, las ordena por cliente y proyecto, y a partir de ahí arma los documentos con los que trabajamos: el traspaso de Ventas a Customer Success, el arranque, el cronograma, el diagnóstico.",
    "No reemplaza a HubSpot ni compite con él. HubSpot sigue siendo donde vive el negocio —las empresas, los tratos, los proyectos y su etapa—. Nexus lee de ahí y le devuelve el trabajo hecho.",
    "La idea de fondo es que nadie tenga que reconstruir el contexto de un cliente a mano. Si la información ya se dijo en una reunión, Nexus la tiene; lo que hace falta es revisarla y corregirla, no escribirla desde cero.",
  ],
};

export const QUE_TE_AHORRA: BloqueNarrativo = {
  titulo: "Qué te ahorra",
  parrafos: [
    "Lo que sigue no es una promesa de la herramienta: es lo que efectivamente deja de hacerse a mano.",
  ],
  bullets: [
    {
      titulo: "Escuchar grabaciones para entender qué se vendió",
      detalle:
        "El traspaso se arma leyendo las sesiones de venta del proyecto. En vez de repasar seis reuniones, revisás un documento y corregís lo que esté mal.",
    },
    {
      titulo: "Rearmar el cronograma desde cero en cada proyecto",
      detalle:
        "El plan se propone a partir de lo que se vendió y del tipo de proyecto. Vos ajustás fechas y responsables; no partís de una hoja en blanco.",
    },
    {
      titulo: "Perder el contexto cuando alguien cambia de proyecto",
      detalle:
        "Todo lo que se habló con un cliente queda junto y atado a él. Quien entra después lee, no pregunta.",
    },
    {
      titulo: "Preguntar dos veces lo mismo",
      detalle:
        "La guía de exploración separa lo que el cliente YA nos dijo de lo que estamos dando por supuesto, y las preguntas salen de ahí.",
    },
    {
      titulo: "Escribirle al cliente desde una hoja en blanco",
      detalle:
        "Los documentos que ve el cliente —arranque, cronograma, propuesta— salen con el tono y la línea gráfica de Smarteam, listos para revisar.",
    },
  ],
};

export const QUE_NO_HACE: BloqueNarrativo = {
  titulo: "Qué NO hace Nexus",
  parrafos: [
    "Tan importante como lo que hace es dónde termina, para no buscar acá algo que vive en otro lado.",
  ],
  bullets: [
    {
      titulo: "No es el CRM",
      detalle:
        "Las empresas, los tratos y la etapa de cada proyecto se manejan en HubSpot. Si movés la tarjeta allá, Nexus lo refleja; al revés no.",
    },
    {
      titulo: "No es contabilidad",
      detalle:
        "Cobranza controla a quién le toca cobrar y cómo va cada cobro. Las facturas, la conciliación bancaria y la contabilidad viven en Odoo y Mercury.",
    },
    {
      titulo: "No decide por vos",
      detalle:
        "Todo lo que escribe un agente es un borrador. Nada se publica al cliente ni se da por bueno sin que una persona lo revise.",
    },
    {
      titulo: "No manda correos solo",
      detalle:
        "Cuando redacta un mensaje de cobro, lo deja listo para que vos lo edites y lo envíes. No sale nada automáticamente.",
    },
  ],
};

export const EL_RECORRIDO: BloqueNarrativo = {
  titulo: "El recorrido de un cliente",
  parrafos: [
    "Un proyecto de implementación pasa por estas etapas. Cada una tiene un documento que la cierra, y ese documento es el que aparece en el menú del proyecto.",
    "No todos los proyectos las recorren todas: un desarrollo o un sitio web tienen su propio camino, más corto.",
  ],
  bullets: [
    {
      titulo: "1 · Traspaso y arranque",
      detalle:
        "Ventas cierra y le pasa el cliente a Customer Success. Se arma el traspaso con lo que se vendió, y con eso el documento de arranque que se le presenta al cliente.",
    },
    {
      titulo: "2 · Exploración",
      detalle:
        "Entender el negocio del cliente de verdad: qué hace, cómo trabaja hoy, qué dimos por supuesto y todavía nadie confirmó.",
    },
    {
      titulo: "3 · Diagnóstico",
      detalle: "Qué encontramos y qué le está costando plata o tiempo al cliente.",
    },
    {
      titulo: "4 · Planificación",
      detalle: "Qué vamos a hacer, en qué orden y para cuándo. Acá nace el cronograma que el cliente aprueba.",
    },
    {
      titulo: "5 · Configuración técnica",
      detalle:
        "Se construye: lo que se configura en HubSpot y, si el proyecto lo incluye, lo que hay que desarrollar a la medida.",
    },
    {
      titulo: "6 · Adopción y validación",
      detalle:
        "El cliente empieza a usarlo y se confirma que efectivamente lo usa. Acá ya no hay un documento que generar: hay acompañamiento.",
    },
    {
      titulo: "7 · Entrega",
      detalle: "Se cierra el proyecto y, si corresponde, arranca la continuidad.",
    },
  ],
};

// ── Pestaña "Documentos" ───────────────────────────────────────────────────────

export const INTRO_DOCUMENTOS: BloqueNarrativo = {
  titulo: "Los documentos de un proyecto",
  parrafos: [
    "Cada proyecto tiene un menú de documentos. Algunos nacen con el proyecto y otros aparecen solo si hacen falta.",
    "Los que dicen «lo ve el cliente» se le pueden publicar con un enlace; el resto son de uso interno y el cliente nunca los ve.",
  ],
};

/**
 * Un párrafo por documento. La CLAVE es el identificador estable de la pieza
 * (`lib/pieces/registry.ts`), no su nombre visible: renombrar el canvas no rompe la doc.
 *
 * ⚠ Agregar una pieza al registro SIN agregarla acá hace fallar `manual.test.ts`. Es a
 * propósito: un documento nuevo sin explicación aparecería como una tarjeta muda.
 */
export const DOC_PIEZAS: Record<string, DocDePieza> = {
  handoff: {
    paraQue:
      "El traspaso de Ventas a Customer Success. Reúne qué se vendió, qué se le prometió al cliente y quién es quién de su lado, sacado de las reuniones de venta.",
    cuando:
      "Al arrancar el proyecto, antes de la primera reunión con el cliente. Es la base de todo lo demás: si el traspaso está flojo, el resto sale flojo.",
  },
  kickoff: {
    paraQue:
      "El documento de arranque que se le presenta al cliente: qué compró, cómo vamos a trabajar, qué necesitamos de su equipo y cuáles son los próximos pasos.",
    cuando:
      "Para preparar y sostener la reunión de arranque. Se le publica al cliente cuando está revisado.",
  },
  timeline: {
    paraQue:
      "El plan del proyecto por semanas: fases, tareas, quién hace cada cosa y para cuándo. También es donde se registra el avance real y por qué se movió una fecha.",
    cuando:
      "Se arma en la planificación y se mantiene vivo durante todo el proyecto. Es el documento que más veces vas a abrir.",
  },
  exploration: {
    paraQue:
      "La guía para descubrir el negocio del cliente. Separa lo que ya nos dijo —y por lo tanto no hay que repreguntar— de lo que estamos dando por supuesto sin haberlo confirmado. De ahí salen las preguntas de las próximas reuniones.",
    cuando:
      "Después del arranque, antes de sentarte a diagnosticar. Es interna: el cliente no la ve nunca.",
  },
  diagnosis: {
    paraQue:
      "Qué encontramos al mirar cómo trabaja el cliente hoy: dónde pierde tiempo, dónde se le caen los datos, qué le está costando.",
    cuando: "Cuando ya entendiste el negocio y podés nombrar los problemas con evidencia.",
  },
  planning: {
    paraQue:
      "Qué vamos a hacer con lo que encontramos en el diagnóstico, y en qué orden. Es el puente entre «esto es lo que duele» y el cronograma.",
    cuando: "Después del diagnóstico y antes de comprometer fechas.",
  },
  "tech-requirements": {
    paraQue:
      "Qué hay que construir a la medida: integraciones, automatizaciones y objetos que no salen de configurar HubSpot. Incluye la arquitectura y la estimación.",
    cuando:
      "Solo en proyectos con alcance técnico. Si el proyecto no lo tiene, este documento no aparece.",
  },
  implementation: {
    paraQue:
      "La guía de trabajo semanal: qué hay que dejar configurado en HubSpot según el cronograma, paso a paso.",
    cuando: "Durante la configuración técnica, semana a semana. Es tuya, no del cliente.",
  },
  "client-info": {
    paraQue:
      "El contexto del cliente que se va acumulando reunión tras reunión, más los procesos que le mapeamos. No pertenece a un proyecto: es del cliente entero y sobrevive a los proyectos.",
    cuando:
      "Cuando necesitás entender al cliente por encima de un proyecto puntual, o cuando entra alguien nuevo a la cuenta.",
  },
  "business-case": {
    paraQue:
      "La propuesta que Ventas le arma a un prospecto: qué le duele, qué le proponemos, qué gana y cuánto cuesta.",
    cuando:
      "Antes de que el cliente compre. Es de Ventas y vive fuera del proyecto, porque todavía no hay proyecto.",
  },
};

// ── Pestaña "Agentes" ──────────────────────────────────────────────────────────

export const INTRO_AGENTES: BloqueNarrativo = {
  titulo: "Qué es un agente",
  parrafos: [
    "Un agente es una tarea de inteligencia artificial con un encargo concreto: leer cierto material y escribir cierto documento. No es un chat: no se conversa con él, se lo dispara y devuelve un borrador.",
    "Algunos los disparás vos con el botón «Generar» del documento. Otros corren solos cuando entra una reunión nueva.",
    "Lo que escriben SIEMPRE es un borrador. La regla del equipo es revisarlo antes de darlo por bueno, y con más razón antes de que lo vea el cliente.",
  ],
};

// ── Pestaña "HubSpot" ──────────────────────────────────────────────────────────

export const INTRO_HUBSPOT: BloqueNarrativo = {
  titulo: "Cómo se conecta con HubSpot",
  parrafos: [
    "HubSpot es la fuente de verdad del negocio: las empresas, los tratos y los proyectos con su etapa. Nexus se conecta a nuestro portal y trabaja sobre eso.",
    "La relación es principalmente de lectura. Nexus mira mucho y escribe poco, y lo poco que escribe está acotado a propósito.",
  ],
};

export const HUBSPOT_ESCRIBE: BloqueNarrativo = {
  titulo: "Qué escribe Nexus en HubSpot",
  parrafos: ["Es una lista corta, y ésa es la idea:"],
  bullets: [
    {
      titulo: "Crea el proyecto al dar un traspaso",
      detalle:
        "Cuando se genera el traspaso, Nexus crea el proyecto en el pipeline de Customer Success, lo asocia a la empresa y al trato, y lo deja en la etapa inicial.",
    },
    {
      titulo: "Marca a la empresa como en onboarding",
      detalle: "Para que se vea desde HubSpot que ese cliente arrancó.",
    },
    {
      titulo: "Deja borradores sociales",
      detalle:
        "Desde Marketing se puede mandar una idea aprobada al compositor social de HubSpot. Queda como BORRADOR: publicar lo hace una persona.",
    },
  ],
};

export const HUBSPOT_NO_ESCRIBE: BloqueNarrativo = {
  titulo: "Qué NO toca",
  parrafos: [
    "Nexus no mueve la etapa de un proyecto, no edita tratos, no cambia propiedades de empresas ni de contactos, y no borra nada. Si un proyecto tiene que avanzar de etapa, alguien lo mueve en HubSpot y Nexus lo refleja.",
  ],
};
