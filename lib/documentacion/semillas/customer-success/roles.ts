/**
 * lib/documentacion/semillas/customer-success/roles.ts — las páginas de los dos roles.
 *
 * Copia CURADA de los perfiles de puesto de Roles, no una lectura en vivo: un bloque vivo mostraría
 * lo que se escriba mañana en el perfil —incluido lo sensible— en una base que lee todo el equipo.
 * Por eso cada página dice arriba de qué perfil sale y de qué fecha.
 *
 * Los caminos de éxito y de fracaso NO están acá: viven en «Competencias core», ordenados por
 * competencia. Y el día a día del CSE vive en la «Guía de CSE», que no se repite.
 *
 * ⛔ Afuera: la oferta económica, las comisiones y la revisión atada al aumento del período de
 * transición (la versión del PERFIL, que es la que se copia, ya viene neutra).
 */
import {
  aviso,
  desplegable,
  divisor,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  type PaginaSembrada,
} from "../bloques";
import { a, pagina } from "./enlaces";

const RUTA_DE_MADUREZ = [
  ["Nivel", "Alcance", "Impacto"],
  [
    "L1 · Implementador HubSpot inicial",
    "Uno o dos Hubs básicos, conexiones nativas e integraciones estándar.",
    "Asimila el método Smarteam e implementa rápido con Breeze.",
  ],
  [
    "L2 · Consultor Multi-Hub y WhatsApp básico",
    "El ecosistema HubSpot completo; WhatsApp con conectores del marketplace.",
    "Asegura la adopción técnica integral del cliente.",
  ],
  [
    "L3 · WhatsApp Empresarial avanzado + inglés",
    "HubSpot full stack y soluciones avanzadas de WhatsApp Empresarial.",
    "Maximiza los canales directos y la conversión en portales maduros.",
  ],
  [
    "L4 · Consultor de negocio",
    "HubSpot orientado a RevOps; propone integraciones con APIs y webhooks.",
    "Entiende a cada cliente como un negocio con un camino de crecimiento.",
  ],
  [
    "L5 · Consultor AI-First",
    "Ecosistemas integrados con múltiples sistemas y soluciones a medida con IA.",
    "Genera cualquier solución desde las necesidades del cliente y se enfoca en su revenue.",
  ],
];

/* ── CSE ────────────────────────────────────────────────────────────────────── */

export function construirRolCse(): PaginaSembrada {
  return {
    ...pagina("rolCse"),
    bloques: [
      parrafoRico(["Extraído del perfil de puesto en Roles, actualizado el 2 de septiembre de 2026.", { italica: true }]),
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "es el dueño de un grupo de cuentas. Implementa HubSpot de punta a punta, lleva la relación con el cliente y logra que lo implementado resuelva el problema del negocio, no solo que el proyecto se entregue.",
      ),

      titulo(2, "La misión"),
      parrafo(
        "Cada proyecto recorre el mismo ciclo —Hand Off, Exploración, Diagnóstico, Planificación, Configuración técnica, Adopción, Validación de uso y Entrega— y el CSE lo conduce. El CSL acompaña, forma su criterio y responde por la cartera completa; no ejecuta por él.",
      ),
      parrafoRico("Cómo se ve eso semana a semana y etapa por etapa: ", a("guiaCse"), "."),

      titulo(2, "De qué responde"),
      tarjetas(
        "2",
        tarjeta(
          "Implementación de punta a punta",
          "Conducir el proyecto por todo su ciclo, de Hand Off a Entrega, y dejar la configuración funcionando en HubSpot. La estrategia de la cartera completa es del CSL.",
        ),
        tarjeta(
          "Relación con el cliente",
          "Es la cara diaria de Smarteam en la cuenta: las sesiones, las expectativas y la conversación difícil cuando hay que tenerla. El CSL entra cuando la cuenta se escala.",
        ),
        tarjeta(
          "Diagnóstico del negocio, no de la herramienta",
          "Que lo que se configura resuelva un problema que se pueda nombrar. Entender el negocio antes de tocar el portal es suyo: el cliente no tiene por qué traerlo resuelto.",
        ),
        tarjeta(
          "Cronograma y compromisos de fecha",
          "Fases, fechas reales, avances y las particularidades que movieron el plan, con su porqué. Regalar alcance o correr la fecha sin registrarlo no es una opción.",
        ),
        tarjeta(
          "Adopción de sus cuentas",
          "Que el cliente use lo implementado: habilitar usuarios, acompañar los primeros ciclos reales y confirmar el uso antes de dar por entregado.",
        ),
        tarjeta(
          "Estado de sus proyectos en HubSpot",
          "Que la etapa y el estado de cada proyecto se lean igual que en la realidad. La gobernanza del pipeline es del CSL; mantener el suyo al día es del CSE.",
        ),
        tarjeta(
          "Licenciamiento y renovaciones",
          "Que cada cliente tenga las licencias y los hubs que su implementación necesita, y que ninguna renovación llegue sobre la fecha. Negociar el upgrade es de Ventas; lo que no cuadra se escala a Finanzas.",
        ),
        tarjeta(
          "Detección de oportunidades",
          "Qué necesita el negocio del cliente más allá del alcance actual. Llevarlo a la mesa con el CSL y Ventas es suyo; negociar y cerrar es de Ventas.",
        ),
        tarjeta(
          "Feedback a Ventas y a Desarrollo",
          "Devolver lo que la implementación revela: dónde lo vendido y lo entregado no coinciden, y qué traba técnica se repite. Decidir el cambio es de cada área.",
        ),
        tarjeta(
          "Trabajo con IA en el día a día",
          "Usar Nexus, sus agentes y lo que ya trae HubSpot para sacarse el trabajo repetitivo. Usarla con criterio es suyo; construir la herramienta es de Desarrollo.",
        ),
      ),

      titulo(2, "La meta"),
      parrafoRico(
        "Es la del departamento, aplicada a sus proyectos: 100% en el alcance contratado y 100% en la fecha pactada al 15 de noviembre. Por qué esas dos: ",
        a("customerSuccess"),
        ".",
      ),

      titulo(2, "Qué hace cada semana"),
      tabla([
        ["Medida", "Qué es", "Ritmo"],
        [
          "Entiende el negocio, no solo el pedido",
          "Conduce una sesión de descubrimiento y sale con un dolor nuevo entendido y escrito, no con una lista de tareas.",
          "2 por semana",
        ],
        [
          "Mueve cada proyecto a su siguiente etapa",
          "Revisa el cronograma de cada cuenta activa y ejecuta lo que la desbloquea; lo que depende del cliente, lo pide con fecha.",
          "Todas las cuentas activas, cada semana",
        ],
        [
          "Asegura que el cliente use lo implementado",
          "Acompaña a un usuario real usando lo configurado y corrige lo que le traba el uso. Configurado no es adoptado.",
          "1 cuenta por semana",
        ],
        [
          "Anticipa el riesgo antes de que sea reclamo",
          "Marca qué cuenta se está enfriando —silencio, fechas que se corren, usuario clave que no aparece— y la lleva al CSL con una movida propuesta.",
          "1 repaso de la cartera por semana",
        ],
        [
          "Detecta la próxima necesidad de la cuenta",
          "Identifica algo que el negocio necesita y todavía no compró, y lo lleva a la mesa con el CSL y Ventas.",
          "1 por semana",
        ],
      ]),

      titulo(2, "Qué confirma el semestre"),
      tabla([
        ["Resultado", "Meta", "Qué mide"],
        ["Proyectos en alcance y en fecha", "100%", "El resultado directo de la meta; se lee al cerrar cada proyecto."],
        ["Uso real de sus cuentas", "70 o más de promedio, ninguna bajo 40", "Si el cliente usa de verdad lo implementado."],
        ["Cuentas en riesgo", "Ninguna al cierre del semestre", "Las que se enfrían y ponen la renovación en duda."],
        ["Expansión en sus cuentas", "2 en el semestre", "Servicios o licencias nuevas que salieron de una necesidad que detectó."],
      ]),

      titulo(2, "El marcador en HubSpot"),
      tabla([
        ["Qué se ve", "Gráfico", "Se gana cuando", "De dónde sale"],
        ["Proyectos entregados en fecha", "Medidor", "La aguja se queda en 100%", "Pipeline de proyectos, cerrados del período"],
        ["Uso por cuenta", "Barras", "Ninguna barra bajo 40", "Objeto de Partner Clients"],
        ["Expansión cerrada", "Línea", "La línea va sobre el ritmo del semestre", "Reporte de negocios de tipo expansión"],
        ["Etapa real de sus proyectos", "Barras", "Ninguno lleva dos semanas quieto en la misma etapa", "Pipeline de proyectos, por etapa"],
        ["Sesiones de descubrimiento", "Barras", "2 o más por semana", "Reporte de actividades"],
      ]),

      titulo(2, "Los primeros tres meses"),
      desplegable("Mes 1 · Acompañado", [
        parrafo(
          "Entra a las cuentas de otro CSE como segunda persona: escucha sesiones, lee handoffs y cronogramas, y arma los documentos en Nexus con revisión del CSL antes de que salgan. Todavía no es dueño de una cuenta.",
        ),
      ]),
      desplegable("Mes 2 · Cuentas propias con red", [
        parrafo(
          "Toma una o dos cuentas simples de punta a punta. Conduce las sesiones; el CSL entra a las que definen alcance o fecha y revisa cada compromiso antes de que llegue al cliente.",
        ),
      ]),
      desplegable("Mes 3 · Autonomía", [
        parrafo(
          "Lleva su cartera y el CSL pasa de revisar a acompañar: entra cuando se lo piden o cuando la cuenta se escala. Al cierre del mes se revisan el desempeño, el impacto y la evolución del rol.",
        ),
      ]),

      titulo(2, "La ruta de madurez"),
      parrafo(
        "Cada nivel suma complejidad, stack e impacto. No la mide la antigüedad: la mide qué cuenta se puede sostener solo. Es la misma ruta del CSL.",
      ),
      tabla(RUTA_DE_MADUREZ),

      divisor(),
      parrafoRico("Cómo se reconoce que el trabajo sale bien —y cuándo no—: ", a("competencias"), "."),
    ],
  };
}

/* ── CSL ────────────────────────────────────────────────────────────────────── */

export function construirRolCsl(): PaginaSembrada {
  return {
    ...pagina("rolCsl"),
    bloques: [
      parrafoRico([
        "Extraído del perfil de puesto en Roles, actualizado el 30 de julio de 2026, y de la sección de alianzas de su propuesta.",
        { italica: true },
      ]),
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "lleva el éxito a toda la cartera. Anticipa los riesgos en las cuentas de alta complejidad y lidera la estrategia de retención, salud y expansión.",
      ),

      titulo(2, "La misión"),
      parrafo(
        "Llevar éxito a todos los clientes, anticipar y mitigar riesgos en cuentas de alta complejidad, y liderar la estrategia de retención, salud y expansión (revenue) de toda la cartera.",
      ),
      aviso(
        "advertencia",
        ["Lo que no hace: ", { negrita: true }],
        "ejecutar las cuentas. La cuenta es del CSE; el CSL mira la cartera entera, forma criterio y entra cuando algo se escala. Si absorbe el trabajo del equipo, el departamento avanza a la velocidad de una sola agenda.",
      ),

      titulo(2, "De qué responde"),
      tarjetas(
        "2",
        tarjeta(
          "Monitoreo de cuentas y detección de riesgo",
          "Toda la cartera pasa por su mirada: cuál está sana y cuál entró en riesgo antes de que la renovación esté en duda. Ejecutar la cuenta sigue siendo del CSE.",
        ),
        tarjeta(
          "Éxito y recomendación del cliente",
          "Que el cliente resuelva su problema y quede en condiciones de recomendarnos, no solo que el proyecto se entregue a tiempo. La relación diaria la lleva el CSE.",
        ),
        tarjeta(
          "Desarrollo del talento del equipo",
          "Cómo crece el criterio consultivo de cada CSE y su avance en la ruta de madurez. Las cuentas siguen siendo del CSE, no pasan al CSL.",
        ),
        tarjeta(
          "Adopción de IA en el equipo",
          "Que el equipo trabaje con IA de verdad en su día a día. Usarla con criterio es del CSL; construir la herramienta es de Desarrollo.",
        ),
        tarjeta(
          "Carga de trabajo y desbloqueo",
          "Cuántas cuentas y de qué complejidad lleva cada CSE, y qué lo está frenando. Lo que no se resuelve dentro del área se escala, no se absorbe.",
        ),
        tarjeta(
          "Feedback a Ventas y a Desarrollo",
          "Devolver lo que la implementación revela: dónde lo vendido y lo entregado no coinciden, y qué traba técnica se repite. Decidir el cambio es de cada área.",
        ),
        tarjeta(
          "Expansión de cuentas",
          "Qué cuentas de la cartera tienen espacio para un servicio nuevo y cuál es su camino de crecimiento. Negociar y cerrar la venta es de Ventas.",
        ),
        tarjeta(
          "Gobernanza del pipeline de proyectos",
          "Que en HubSpot el estado de cada proyecto se lea igual que en la realidad, etapa por etapa. Mantener al día el avance de cada proyecto es del CSE.",
        ),
      ),

      titulo(2, "Alianzas y licenciamiento"),
      tarjetas(
        "2",
        tarjeta(
          "Licenciamiento correcto del cliente",
          "Que cada cliente tenga las licencias y los hubs que su implementación necesita, antes de que el proyecto choque con un límite del plan. Negociar el upgrade es de Ventas.",
        ),
        tarjeta(
          "Conciliaciones y renovaciones de licencias",
          "Monitorear en HubSpot las conciliaciones y renovaciones de licencias de los clientes, para que ninguna llegue por sorpresa. Lo que no cuadra se escala a Finanzas.",
        ),
        tarjeta(
          "Relación con partners",
          "Cultivar la relación con el Customer Success de HubSpot y con aliados como Insider: quién es la contraparte, qué se está trabajando y qué se puede aprovechar para la cartera.",
        ),
        tarjeta(
          "Certificaciones de partner",
          "Que Smarteam mantenga las certificaciones del programa de partners de HubSpot —no los cursos de la Academy—, para que el estatus no se caiga por requisitos vencidos.",
        ),
      ),

      titulo(2, "Qué hace cada semana"),
      tabla([
        ["Medida", "Qué es", "Ritmo"],
        [
          "Que ninguna cuenta en riesgo quede desatendida",
          "Health-check con el CSE de cada cuenta marcada en riesgo: qué la traba, qué movida la desbloquea y quién la ejecuta.",
          "3 por semana",
        ],
        [
          "Forma el criterio consultivo del equipo",
          "Roleplay, simulación de una reunión difícil o revisión de un diagnóstico con un CSE. Forma criterio; no resuelve por él.",
          "2 por semana",
        ],
        [
          "Que el cliente use lo implementado",
          "Revisa la adopción real de la cuenta —uso, asientos, add-ons— y define con el CSE cuál es la próxima habilitación.",
          "2 cuentas por semana",
        ],
        [
          "Qué otros servicios puede aprovechar cada cuenta",
          "Con el CSE, detecta una necesidad nueva del negocio y la lleva a la mesa con Ventas.",
          "2 por semana",
        ],
        [
          "Escucha al cliente de primera mano",
          "Entra a una sesión de cuenta junto al CSE sin conducirla, para escuchar el estado real del negocio y no el avance técnico.",
          "1 por semana",
        ],
      ]),

      titulo(2, "Qué confirma el año"),
      tabla([
        ["Resultado", "Meta", "Qué mide"],
        ["Uso real de la cartera", "De 55 a 75 de promedio", "Si el cliente usa de verdad lo que implementamos."],
        ["Cuentas en rojo", "De 4 a ninguna", "Las que caen bajo 40 y ponen la renovación en duda."],
        ["Consumo de suscripciones", "80% o más; bajo 60% se activa un rescate", "Asientos y add-ons realmente usados."],
        ["Expansión de la cartera", "6 en el año", "Servicios nuevos vendidos en cuentas prioritarias."],
      ]),

      titulo(2, "El marcador en HubSpot"),
      tabla([
        ["Qué se ve", "Gráfico", "Se gana cuando", "De dónde sale"],
        ["Uso promedio de la cartera", "Medidor", "La aguja sube semana a semana", "Objeto de Partner Clients, dashboard de Cartera"],
        ["Cuentas bajo 40 de uso", "Barras", "Ninguna barra por debajo de 40", "Objeto de Partner Clients, por cuenta"],
        ["Expansión cerrada", "Línea", "La línea va sobre el ritmo del año", "Reporte de negocios de tipo expansión"],
        ["Health-checks a cuentas en riesgo", "Barras", "3 o más por semana", "Reporte de actividades"],
        ["Conversaciones de expansión abiertas", "Barras", "2 o más por semana", "Reporte de actividades"],
      ]),

      titulo(2, "Las reuniones que lleva"),
      parrafoRico(
        "Además de las del departamento (",
        a("customerSuccess"),
        "), el CSL sostiene el bucle con Ventas: quincenal, 30 minutos, con Marketing cuando toca expansión. Ahí se discute dónde lo vendido y lo implementado no coinciden, y qué cuentas tienen potencial de crecer.",
      ),

      titulo(2, "La ruta de madurez"),
      parrafoRico(
        "Es la misma del CSE, de L1 a L5 (",
        a("rolCse"),
        "). La diferencia es para qué la usa: en el 1:1 mensual se mira en qué nivel está cada CSE y qué complejidad de cuenta ya puede sostener solo.",
      ),

      divisor(),
      parrafoRico("Cómo se reconoce que el trabajo sale bien —y cuándo no—: ", a("competencias"), "."),
    ],
  };
}
