/**
 * lib/propuestas/csl.ts — contenido de la propuesta de contratación del
 * Customer Success Lead.
 *
 * ⚠ HARDCODEADO A PROPÓSITO (2026-07-30, pedido de Elías: "necesito verlo
 * rápido"). Es la versión 1 de un documento que todavía está tomando forma: en
 * cuanto la estructura se estabilice, esto pasa a una fila propia para editarse
 * in-situ como los perfiles de puesto, y esta constante se borra.
 *
 * Mientras tanto: la página lo renderiza en LECTURA. Cambiar un monto o un texto
 * es editar este archivo.
 *
 * Qué se comparte con el perfil de puesto (`scripts/seed-roles.ts`, rol CSL):
 * perfil, responsabilidades, meta, acciones y caminos de éxito/fracaso son copia
 * de ese contenido. NO están sincronizados — si el rol cambia, esto no se entera.
 * Es el costo aceptado de la copia rápida.
 */

export const PROPUESTA_CSL_HERO = {
  title: "Customer Success Lead",
  area: "Propuesta de contratación · Smarteam",
  summary:
    "Lleva éxito a toda la cartera: anticipa riesgos y lidera retención, salud y expansión (revenue).",
};

export const PROPUESTA_CSL_CONTENT: Record<string, unknown> = {
  smarteam: {
    proposito:
      "Creemos que las empresas merecen un aliado estratégico que realmente se involucre, entienda su realidad y las ayude a crecer con sentido.",
    estructuraTitulo: "Cómo está armado el equipo",
    // Elías fue explícito: es el esqueleto, no el organigrama de mando. Decirlo
    // evita que la lista se lea como una cadena de reportes.
    estructuraNota:
      "Este es el esqueleto del equipo, no una cadena de mando. Da una idea de las piezas que existen y con quiénes trabajarías.",
    estructura: [
      { nodo: "CEO" },
      { nodo: "CRO", equipo: "Administración" },
      { nodo: "RevOps & Operations" },
      { nodo: "Ventas" },
      { nodo: "Customer Success Lead", equipo: "con su equipo de CSEs" },
      { nodo: "Líder de desarrollo", equipo: "con su equipo de devs" },
      { nodo: "Marketing" },
    ],
  },

  profile: {
    md: `Smarteam es una consultora de HubSpot que está pasando a ser una **consultoría tecnológica potenciada por IA**. En la práctica, la IA se encarga del trabajo repetitivo y las personas hacen lo que la IA no puede: relacionarse con el cliente, ser desafiante cuando hay que serlo, decidir con criterio y sostener las conversaciones difíciles.

**Misión del puesto.** Llevar éxito a todos los clientes, anticipar y mitigar riesgos en las cuentas más complejas, y liderar la estrategia de **retención, salud y expansión** de toda la cartera.`,
  },

  // Cada `detail` ARRANCA CON VERBO EN INFINITIVO (revisar, lograr…) y cierra
  // diciendo qué NO es tuyo: sin ese límite las cards se leen como si el puesto
  // ejecutara todo. El infinitivo también mantiene el límite en el mismo tiempo
  // verbal ("…es del CSE"), que es lo que hace la card fácil de leer de un tirón.
  responsibilities: {
    items: [
      {
        title: "Monitoreo de cuentas y detección de riesgo",
        detail:
          "Revisar toda la cartera y detectar qué cuenta entró en riesgo antes de que la renovación esté en duda. Ejecutar la cuenta sigue siendo del CSE.",
      },
      {
        title: "Éxito y recomendación del cliente",
        detail:
          "Lograr que el cliente resuelva su problema y quede en condiciones de recomendarnos, no solo que el proyecto se entregue a tiempo. La relación diaria la lleva el CSE.",
      },
      {
        title: "Desarrollo del talento del equipo",
        detail:
          "Hacer crecer el criterio consultivo de cada CSE y acompañar su avance en la ruta de madurez. Las cuentas siguen siendo suyas.",
      },
      {
        title: "Adopción de IA en el equipo de CSEs",
        detail:
          "Lograr que el equipo adopte la IA en su día a día, aprovechando todas las herramientas disponibles: Nexus, los agentes y lo que ya trae HubSpot.",
      },
      {
        title: "Carga de trabajo y desbloqueo del equipo",
        detail:
          "Repartir cuántas cuentas y de qué complejidad lleva cada CSE, y destrabar lo que lo está frenando. Lo que no se resuelve dentro del área se escala, no se absorbe.",
      },
      {
        title: "Feedback a Ventas y a Desarrollo",
        detail:
          "Devolver lo que la implementación revela: dónde lo vendido y lo entregado no coinciden, y qué traba técnica se repite. Decidir el cambio es de cada área.",
      },
      {
        title: "Expansión de cuentas (cross y upselling)",
        detail:
          "Identificar qué cuentas tienen espacio para un servicio nuevo y definir su camino de crecimiento. Negociar y cerrar la venta es de Ventas.",
      },
      {
        title: "Gobernanza del pipeline de proyectos en HubSpot",
        detail:
          "Cuidar que en HubSpot el estado de cada proyecto se lea igual que en la realidad, etapa por etapa. Mantener al día el avance del suyo es del CSE.",
      },
    ],
  },

  partnerships: {
    items: [
      {
        title: "Licenciamiento correcto del cliente",
        detail:
          "Velar por que cada cliente tenga las licencias y los hubs que su implementación necesita, antes de que el proyecto choque con un límite del plan. Negociar el upgrade es de Ventas.",
      },
      {
        title: "Conciliaciones y renovaciones de licencias",
        detail:
          "Monitorear en HubSpot —principalmente— las conciliaciones y renovaciones de licencias de los clientes, para que ninguna llegue por sorpresa. Lo que no cuadra se escala a Finanzas.",
      },
      {
        title: "Relación con partners",
        detail:
          "Cultivar la relación con los Customer Success de HubSpot y con aliados como Insider: quién es la contraparte, qué se está trabajando y qué se puede aprovechar para la cartera.",
      },
      {
        title: "Certificaciones de partner",
        detail:
          "Validar que Smarteam se certifique, sobre todo en las certificaciones de partner de HubSpot —las del programa, no los cursos de la Academy— para que el estatus no se caiga por requisitos vencidos.",
      },
    ],
  },

  wig: {
    condiciones: [
      {
        texto: "El 100% de los proyectos respeta el alcance contratado",
        nota: "0 extensiones de proyectos regaladas.",
      },
      {
        texto: "El 100% de los proyectos se entrega en la fecha pactada",
        nota: "O con retrasos imputables exclusivamente al cliente.",
      },
    ],
    fecha: "15 de noviembre",
    contexto:
      "Regalar alcance y correr la fecha son la misma fuga vista de dos lados: la que se come el margen del proyecto y la credibilidad de la siguiente promesa. Cumplir las dos es lo que hace que la cartera renueve y se expanda, y es la meta de los próximos 6 meses.",
  },

  // En INFINITIVO, igual que Responsabilidades. ⚠ Diverge a propósito de los
  // perfiles de puesto (`scripts/seed-roles.ts`), donde las medidas de predicción
  // van en imperativo: ahí se le habla a quien YA tiene el puesto; acá se le
  // describe el trabajo a alguien que está decidiendo si entra.
  leadMeasures: {
    items: [
      {
        title: "Asegurar que ninguna cuenta en riesgo quede desatendida",
        detail:
          "Hacer un health-check con el CSE de cada cuenta marcada en riesgo: qué la traba, qué movida la desbloquea y quién la ejecuta.",
        meta: "3 por semana.",
      },
      {
        title: "Formar el criterio consultivo del equipo",
        detail:
          "Correr un roleplay, una simulación de reunión difícil o una revisión de diagnóstico con un CSE. Se forma criterio, no se resuelve por él.",
        meta: "2 por semana.",
      },
      {
        title: "Asegurar que el cliente use lo que implementamos",
        detail:
          "Revisar la adopción real de la cuenta (score de uso, asientos, add-ons) y definir con el CSE cuál es la próxima habilitación.",
        meta: "2 cuentas por semana.",
      },
      {
        title: "Analizar qué otros servicios puede aprovechar cada cuenta",
        detail:
          "Detectar con el CSE una necesidad nueva del negocio y llevarla a la mesa con Ventas.",
        meta: "2 por semana.",
      },
      {
        title: "Escuchar al cliente de primera mano",
        detail:
          "Entrar a una sesión de cuenta junto al CSE sin conducirla: se va a escuchar el estado real del negocio, no el avance técnico.",
        meta: "1 por semana.",
      },
    ],
  },

  // Sesiones de seguimiento: FRECUENCIA, no horario. El formato es descriptivo
  // (antes era una lista numerada con los 3 pasos de la WIG Session).
  cadencia: {
    items: [
      {
        evento: "Sesión de seguimiento general con CSE",
        quienes: "El CSL con todo el equipo de CSEs.",
        cuando: "Semanal, al arrancar la semana.",
        formato:
          "Una puesta en común corta: cada quien rinde cuentas de lo que se comprometió, se mira cómo va la meta y se sale con una o dos movidas concretas para la semana. La operación del día a día no entra acá.",
      },
      {
        evento: "Revisión de cuenta con el CSE",
        quienes: "El CSL con el CSE dueño de la cuenta.",
        cuando: "Semanal si la cuenta está en riesgo; quincenal para el resto de la cartera prioritaria.",
        formato:
          "Se abre el cronograma y el estado real del negocio del cliente: qué lo frena, quién decide y qué hay que escalar. Se cierra con acciones y responsable.",
      },
      {
        evento: "Oportunidades de expansión",
        quienes: "El CSL con Ventas, y con Marketing cuando la oportunidad lo amerita.",
        cuando: "Quincenal.",
        formato:
          "Se revisan las cuentas con espacio para un servicio nuevo y las desalineaciones entre lo que se vendió y lo que se implementó. De acá salen las conversaciones que Ventas toma.",
      },
      {
        evento: "Desarrollo de criterio 1:1",
        quienes: "El CSL con cada CSE, por separado.",
        cuando: "Mensual.",
        formato:
          "Conversación de desarrollo: cómo va su criterio consultivo, su carga de trabajo y su crecimiento. Es formación, no revisión de tareas.",
      },
    ],
  },

  // Los caminos se explican, no se enuncian: una etiqueta suelta ("Expansión")
  // no le dice nada a quien todavía no conoce el puesto. Cada uno describe cómo
  // se ve en la práctica. Los de fracaso son el reverso EXACTO de los de éxito,
  // en el mismo orden, para que se lean en pares.
  successPaths: {
    items: [
      {
        title: "Éxito del cliente",
        detail:
          "Entender a los clientes por sus problemas y por cómo se resuelven y se destraban. Que el foco sea llevar éxito a las cuentas, no solo cumplir el proyecto.",
      },
      {
        title: "Expansión",
        detail:
          "Desarrollar un growth path (camino de crecimiento) por cuenta, junto al CSE y, si amerita, con Ventas.",
      },
      {
        title: "Sincronización cara a cara",
        detail:
          "Te alineas con tu equipo y con los clientes por medio de sesiones, y entiendes los problemas de tu equipo. No solo por escrito: los acompañas y los guías. No quedan temas importantes sin tratar ni resueltos únicamente con seguimiento escrito.",
      },
      {
        title: "Mapeo total en HubSpot",
        detail:
          "El estatus de cada proyecto siempre reflejado en el pipeline de proyectos, en la etapa que describe su situación real.",
      },
      {
        title: "Categorización estratégica",
        detail:
          "Entiendes la cartera de clientes por complejidad, revenue, importancia e integraciones. Sabes cuáles cuentas requieren mayor atención o seguimiento.",
      },
      {
        title: "Bucle de feedback",
        detail:
          "Das feedback a Ventas, a Desarrollo y a RevOps: lo que la implementación revela vuelve al área que puede corregirlo.",
      },
      {
        title: "Acceso a involucrados",
        detail:
          "En las cuentas más importantes los interesados te conocen. Conoces a los Customer Success de HubSpot de esas cuentas y te reúnes con ellos cuando es necesario.",
      },
      {
        title: "Extensión de cuentas",
        detail:
          "Generas oportunidades de expansión en las cuentas con mayor potencial de crecimiento. Ganas comisiones por esto todos los meses.",
      },
    ],
  },

  failurePaths: {
    items: [
      {
        title: "Enfoque único en la implementación",
        detail:
          "Cumplir tareas y cerrar el proyecto sin mirar el problema del cliente. Todo se entrega a tiempo, pero la cuenta no queda mejor de lo que estaba y a la renovación llega sin argumentos.",
      },
      {
        title: "Cartera sin camino de crecimiento",
        detail:
          "Ninguna cuenta tiene claro cuál es su siguiente paso. La expansión aparece solo cuando el cliente la pide, nunca porque la vimos venir.",
      },
      {
        title: "Liderazgo solo por escrito",
        detail:
          "Chats, tickets y reportes reemplazan a la conversación. Los problemas del equipo y de los clientes se enteran tarde, cuando ya escalaron.",
      },
      {
        title: "HubSpot desactualizado",
        detail:
          "El pipeline dice una cosa y la realidad otra. Nadie puede confiar en el tablero para decidir, así que cada estado hay que preguntarlo cuenta por cuenta.",
      },
      {
        title: "Todas las cuentas tratadas igual",
        detail:
          "Sin criterio de complejidad, revenue o integraciones, la atención se reparte pareja y las cuentas críticas reciben lo mismo que las simples — hasta que una se cae.",
      },
      {
        title: "Feedback que muere en CS",
        detail:
          "Lo que la implementación revela no vuelve a Ventas ni a Desarrollo. El mismo desajuste entre lo vendido y lo entregado se repite proyecto tras proyecto.",
      },
      {
        title: "Desconexión de las cuentas clave",
        detail:
          "Los interesados de los clientes de alto valor no te conocen y no hay relación con sus Customer Success de HubSpot. Cuando hay una fricción, nos enteramos por el reclamo.",
      },
      {
        title: "Equipo ahogado en trabajo interno",
        detail:
          "Reportes manuales y burocracia se comen las horas que deberían ir a las cuentas. El torbellino gana y la meta del semestre no se mueve.",
      },
    ],
  },

  oferta: {
    tituloTabla: "Propuesta de pago · 3 meses iniciales",
    encabezados: { concepto: "Colaborador", quincenal: "Salario quincenal", mensual: "Total mensual" },
    filas: [{ concepto: "Customer Success Lead", quincenal: "$1,250.00", mensual: "$2,500.00" }],
    destacados: [
      {
        titulo: "Plan de crecimiento (al finalizar el mes 3)",
        texto:
          "Al cerrar el período inicial de evaluación y consolidación se hace una revisión formal del desempeño, el impacto y la evolución del rol. Si las metas se cumplen, el salario pasa a $3,000.00 mensuales.",
      },
      {
        titulo: "Comisión por expansión",
        texto:
          "5% de comisión, compartida con el CSE de la cuenta, sobre cada expansión, cross-selling o up-selling que se logre. Hacer crecer la cartera se paga aparte del salario.",
        enfasis: true,
      },
    ],
    bloques: [
      {
        titulo: "Otros detalles",
        items: [
          "Jornada diurna continua acumulada.",
          "De 8:00 a.m. a 5:00 p.m. (Costa Rica), de lunes a viernes.",
          "Agencia de pago: Ontop.",
          "Disponibilidad para sesiones estratégicas, reuniones interáreas y acompañamiento de iniciativas prioritarias de la dirección.",
          "Participación activa en espacios de medición, seguimiento, planificación y mejora continua.",
        ],
      },
      {
        titulo: "Beneficios de la contratación",
        items: [
          "Bonificación anual sujeta a desempeño y resultados de la organización.",
          "12 días de vacaciones.",
          "11 días feriados.",
          "Acceso a capacitación constante.",
          "Participación en procesos de crecimiento y evolución estratégica de la empresa.",
          "Exposición directa a decisiones estratégicas del negocio.",
        ],
      },
    ],
  },
};
