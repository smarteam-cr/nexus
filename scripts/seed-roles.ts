/**
 * scripts/seed-roles.ts — carga (idempotente) los perfiles de puesto en `RoleProfile`.
 * Dry-run por default; `--apply` para escribir. Upsert por `title` (re-correr NO duplica).
 *
 * El contenido va ESTRUCTURADO por sección en `RoleProfile.content` (mapa
 * { [sectionKey]: data }); el motor de landing lo renderiza (ver configs/roles.defs.ts).
 *
 * REGLAS DE ESCRITURA (la página es una GUÍA DE TRABAJO, no un curso):
 *  1. Si una card no dice QUÉ HACER o CÓMO MIRARLO, sobra.
 *  2. Medidas de predicción: el TÍTULO dice de qué te haces cargo, la DESCRIPCIÓN es la
 *     acción concreta y `meta` el número semanal. En imperativo ("Asegura…", "Analiza…").
 *  3. Una medida de predicción es un acto HUMANO: si un agente de Nexus lo puede hacer
 *     (correr un checklist, publicar, limpiar datos), no va acá.
 *  4. `responsibilities` es solo el ALCANCE del puesto: UNA línea por ítem, sin descripción
 *     (el detalle de qué hacer vive en las medidas semanales; si no, se lee dos veces).
 *  5. TUTEO siempre (CLAUDE.md §6): "controlas", "haces", "de ti" — nunca voseo.
 *  6. La teoría de 4DX no va en el contenido: vive en los tooltips ⓘ de `roles.defs.ts`.
 *
 * OJO: los números de la meta y de las metas semanales son EJEMPLOS — el liderazgo fija los
 * reales por período y se editan in-situ en /roles/[id].
 *
 *   npx tsx scripts/seed-roles.ts            # dry-run
 *   npx tsx scripts/seed-roles.ts --apply    # escribe a la DB
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const APPLY = process.argv.includes("--apply");

const PREAMBULO =
  "> Smarteam está en transformación hacia una Consultoría Tecnológica Potenciada por IA " +
  "(modelo **AI-First**): el equipo humano se enfoca donde aporta más valor — pensamiento " +
  "crítico, criterio consultivo, habilidades blandas, adopción tecnológica y velocidad de respuesta.";

/** Los 3 pasos de la WIG Session, iguales en todos los puestos. */
const WIG_SESSION =
  "1) Cada quien rinde cuentas de su compromiso. 2) Se mira el marcador. 3) Cada quien se compromete a 1-2 movidas para la semana. El torbellino no entra acá.";

/** El alcance del puesto va en una línea: sin `detail` (regla 4). */
const scope = (...titles: string[]) => ({ items: titles.map((title) => ({ title, detail: "" })) });

interface RoleSeed {
  title: string;
  area: string;
  order: number;
  summary: string;
  content: Prisma.InputJsonObject;
}

const ROLES: RoleSeed[] = [
  {
    title: "Marketing Operator (MO)",
    area: "Marketing",
    order: 0,
    summary: "Producción visual, video y web ágil con IA — y motor de post-venta para expandir cuentas.",
    content: {
      profile: {
        md: `${PREAMBULO}

**Misión.** Producir los activos visuales, de video y de web de Smarteam con metodología AI-First (Figma + Claude), y usar cada entrega web como puerta de entrada para **expandir la cuenta** hacia otros servicios del catálogo.`,
      },
      responsibilities: scope(
        "Diseño y desarrollo de sitios web con IA",
        "Detección de expansión en cuentas web",
        "Producción de video y piezas gráficas",
        "Publicación de contenido en las plataformas",
        "Control de calidad UX/UI antes del handoff",
      ),
      wig: {
        desde: "3 oportunidades de expansión aceptadas por Ventas en el trimestre",
        hasta: "9 en el trimestre",
        fecha: "cierre del Q4 2026",
        contexto:
          "Cada sitio entregado abre una puerta. Si el sitio sale impecable pero la cuenta no crece, el trabajo quedó a mitad de camino.",
      },
      leadMeasures: {
        items: [
          { title: "Asegura que Smarteam tenga las redes orgánicas activas", detail: "Diseña las imágenes y los videos de la página de empresa y de los reps de ventas, para que Smarteam tenga presencia y relevancia.", meta: "3 piezas por semana." },
          { title: "Lleva el éxito del cliente a los proyectos de sitio web", detail: "Trata cada cuenta web como una cuenta a la que hay que hacer exitosa: revisa que el sitio esté resolviendo lo que el cliente compró, no solo que esté entregado.", meta: "1 seguimiento por cuenta web activa." },
          { title: "Analiza cada esfuerzo desde el dolor del cliente", detail: "Cierra cada entrega o revisión escuchando qué le duele ahora al negocio, y déjalo como nota en HubSpot para que Nexus se nutra.", meta: "2 por semana." },
          { title: "Analiza qué otros servicios puede aprovechar el cliente", detail: "Con lo que escuchaste, identifica qué servicio del catálogo resuelve ese dolor y llévalo a Ventas con contexto: qué necesita y por qué ahora.", meta: "1 por semana." },
          { title: "Prueba cada insumo como usuario, no como autor", detail: "Recorre el sitio, el video o la pieza como lo haría el cliente —en móvil— y anota lo que fricciona antes de mostrarlo.", meta: "1 por insumo." },
        ],
      },
      lagMeasures: {
        items: [
          { title: "Oportunidades de expansión aceptadas por Ventas", detail: "Cuentas web que terminan en una oportunidad real.", meta: "De 3 a 9 por trimestre." },
          { title: "Ciclo de entrega del prototipo", detail: "Días del arranque de diseño a la entrega a Desarrollo.", meta: "De 15 a 9 días." },
          { title: "Aprobación UX/UI en el handoff", detail: "Proyectos que pasan a Desarrollo sin retrabajo.", meta: "≥ 90%." },
        ],
      },
      scoreboard: {
        items: [
          { measure: "Oportunidades de expansión", kind: "arrastre", chart: "line", fuente: "Reporte de Negocios, en el dashboard de Marketing.", ganar: "La línea acumulada va sobre el ritmo del trimestre." },
          { measure: "Ciclo de entrega del prototipo", kind: "arrastre", chart: "line", fuente: "Reporte del objeto Projects.", ganar: "La línea baja y se mantiene bajo 9 días." },
          { measure: "Piezas publicadas en redes", kind: "prediccion", chart: "bar", fuente: "Reporte de Social.", ganar: "3 o más por semana, sin semanas en blanco." },
          { measure: "Conversaciones de descubrimiento", kind: "prediccion", chart: "bar", fuente: "Reporte de Actividades.", ganar: "2 o más por semana." },
          { measure: "Oportunidades llevadas a Ventas", kind: "prediccion", chart: "bar", fuente: "Reporte de Actividades.", ganar: "1 o más por semana." },
        ],
      },
      cadencia: {
        items: [
          { evento: "WIG Session de Marketing", quienes: "Marketing Lead + Marketing Operator.", cuando: "Lunes 9:00, 20 min. Sagrada: no se mueve.", formato: WIG_SESSION },
          { evento: "Handoff a Desarrollo", quienes: "Marketing Operator + Desarrollo.", cuando: "Al cerrar cada prototipo.", formato: "Recorrido del prototipo con el checklist ya corrido y entrega del código base mapeado." },
          { evento: "1:1 con la Marketing Lead", quienes: "Marketing Operator + Marketing Lead.", cuando: "Quincenal, 30 min.", formato: "Crecimiento y obstáculos. No es revisión de tareas." },
        ],
      },
      successPaths: {
        items: [
          { title: "Autonomía técnica con IA", detail: "Probar código e iterar la UX sin depender de Desarrollo." },
          { title: "Mentalidad consultiva", detail: "Escuchar el dolor y proponer el siguiente servicio como paso lógico." },
          { title: "Calidad visual extrema", detail: "Layouts limpios, modernos y pensados para convertir." },
          { title: "Trabajo en ecosistema", detail: "Alinear cada pieza con la Marketing Lead." },
        ],
      },
      failurePaths: {
        items: [
          { title: "Bloqueo técnico", detail: "Frenarse ante un error básico y esperar que Desarrollo resuelva." },
          { title: "Ejecución pasiva", detail: "Entregar el sitio y cerrar el canal sin buscar el siguiente valor." },
          { title: "Descuido del detalle", detail: "Diseños que ignoran el móvil y la velocidad de carga." },
          { title: "Aislamiento creativo", detail: "Diseñar sin alineación de tono ni de fechas." },
        ],
      },
      maturityPath: {
        intro: "De ejecutar diseño a liderar experiencias web orientadas al negocio.",
        levels: [
          { level: "L1", titulo: "Diseño & Multimedia Junior", alcance: "Domina Figma y produce piezas y video bajo guion.", impacto: "Sostiene el estándar estético de la marca." },
          { level: "L2", titulo: "AI-Web Builder & Creator", alcance: "Rediseña webs completas con Claude + Figma y entrega código listo para Desarrollo.", impacto: "Reduce a la mitad el ciclo de entrega técnica." },
          { level: "L3", titulo: "Web Experience & Post-Sales Consultant", alcance: "Traduce dolores complejos en soluciones web de alta conversión y mapea la cartera.", impacto: "Genera oportunidades comerciales desde los clientes web." },
          { level: "L4", titulo: "Conversion Optimization Specialist", alcance: "Experimentos A/B, velocidad y embudos de conversión con datos reales.", impacto: "Multiplica la captación de leads en los portales." },
          { level: "L5", titulo: "AI-First Creative Experience Director", alcance: "Diseña ecosistemas digitales complejos e integraciones de contenido con IA.", impacto: "Habilita las soluciones de más alto valor y la retención de grandes cuentas." },
        ],
      },
      transitionPeriod: {
        md: `Período de **3 meses** hasta la autonomía en el ecosistema AI-First. Las primeras semanas se apoya en sus fortalezas actuales (Figma, video) mientras ejecuta sus primeros proyectos web completos con Claude, con acompañamiento del liderazgo y de Desarrollo. Primero se evalúan las **medidas de predicción**; recién después, los resultados de expansión.`,
      },
    },
  },
  {
    title: "Marketing Lead (ML)",
    area: "Marketing",
    order: 1,
    summary: "El motor de demanda: prospectos calificados y predecibles para Ventas.",
    content: {
      profile: {
        md: `${PREAMBULO}

**Misión.** **Generar demanda para Ventas.** Convertir el área en un motor predecible de prospectos calificados, evolucionando de la coordinación operativa al dominio estratégico (ICP, funnel, alianzas y campañas).`,
      },
      responsibilities: scope(
        "Generación de demanda y entrega a Ventas",
        "Eventos, webinars y workshops",
        "Alianzas y partnerships",
        "Casos de éxito con Customer Success",
        "Construcción de activos digitales con IA",
        "Estrategia de contenido y funnel (ICP)",
        "Calendario de marketing y disciplina de datos",
      ),
      wig: {
        desde: "12 leads calificados por mes",
        hasta: "40 leads calificados (MQL) por mes",
        fecha: "31 de diciembre de 2026",
        contexto:
          "Todo lo demás —contenido, eventos, alianzas, casos de éxito— existe para mover este número. Si el mercado nos conoce pero Ventas no tiene con quién hablar, no ganamos.",
      },
      leadMeasures: {
        items: [
          { title: "Asegura que Ventas nunca se quede sin con quién hablar", detail: "Califica los leads de la semana con el criterio acordado y pásalos con contexto: de dónde salió, qué le interesa y cuál es el siguiente paso.", meta: "Todos los de la semana." },
          { title: "Convierte la historia de un cliente en material de venta", detail: "Agenda la entrevista con Customer Success, sácale qué cambió de verdad en su negocio y déjala documentada para que Ventas la use.", meta: "1 por semana." },
          { title: "Mueve una alianza que traiga demanda", detail: "Habla con un partner (HubSpot u otro) y aterriza una acción conjunta: webinar, contenido o audiencia cruzada.", meta: "1 por semana." },
          { title: "Mantén viva la maquinaria que capta", detail: "Diseña y publica en HubSpot los activos que capturan demanda: landing pages, secuencias y piezas de campaña.", meta: "2 por semana." },
          { title: "Aprende de los leads que Ventas rechazó", detail: "Revísalos uno por uno con Ventas y entiende por qué no calificaban. De ahí sale el ajuste del mensaje y del ICP.", meta: "1 revisión por semana." },
        ],
      },
      lagMeasures: {
        items: [
          { title: "Leads calificados entregados a Ventas", detail: "Prospectos que Ventas acepta, de todos los canales.", meta: "De 12 a 40 por mes." },
          { title: "Aceptación de MQL a SQL", detail: "Los que se vuelven oportunidad real: mide calidad, no volumen.", meta: "≥ 35%." },
          { title: "Pipeline con origen marketing", detail: "Monto del pipeline nuevo que originó marketing.", meta: "≥ 30% del pipeline nuevo." },
        ],
      },
      scoreboard: {
        items: [
          { measure: "Leads calificados (MQL) por mes", kind: "arrastre", chart: "line", fuente: "Reporte de Contactos por etapa del ciclo de vida.", ganar: "La línea del mes va sobre la meta." },
          { measure: "Pipeline con origen marketing", kind: "arrastre", chart: "bar", fuente: "Reporte de Negocios por origen de campaña.", ganar: "La porción con origen marketing crece mes a mes." },
          { measure: "Activos de captación publicados", kind: "prediccion", chart: "bar", fuente: "Reporte de Landing pages (CMS).", ganar: "2 o más por semana." },
          { measure: "Entrevistas a clientes", kind: "prediccion", chart: "number", fuente: "Reporte de Actividades.", ganar: "El número de la semana nunca es 0." },
          { measure: "Conversaciones con aliados", kind: "prediccion", chart: "bar", fuente: "Reporte de Actividades.", ganar: "1 o más por semana." },
        ],
      },
      cadencia: {
        items: [
          { evento: "WIG Session de Marketing", quienes: "Marketing Lead + Marketing Operator.", cuando: "Lunes 9:00, 20 min. Sagrada: no se mueve.", formato: WIG_SESSION },
          { evento: "Calibración de leads con Ventas", quienes: "Marketing Lead + Ventas.", cuando: "Semanal, 20 min.", formato: "Qué leads aceptó Ventas y cuáles no, y por qué. Sale con la definición de «lead calificado» ajustada." },
          { evento: "Revisión de alianzas y eventos", quienes: "Marketing Lead + aliados (HubSpot u otros).", cuando: "Mensual, 45 min.", formato: "Estado de las acciones conjuntas y próximos eventos comprometidos." },
          { evento: "1:1 de desarrollo", quienes: "Marketing Lead + dirección.", cuando: "Mensual, 45 min.", formato: "Ruta de madurez y criterio estratégico. No es revisión de tareas." },
        ],
      },
      successPaths: {
        items: [
          { title: "Foco absoluto en Ventas", detail: "Cada acción busca generar conversaciones comerciales." },
          { title: "Proactividad con clientes y aliados", detail: "Salir a buscar historias y mover partners." },
          { title: "Crecimiento colaborativo", detail: "Validar ICP y mensaje con Ventas y RevOps." },
          { title: "IA para escalar", detail: "Crear landings y campañas en HubSpot con autonomía." },
        ],
      },
      failurePaths: {
        items: [
          { title: "Métricas de vanidad", detail: "Celebrar likes o asistentes que no se vuelven leads." },
          { title: "Quedarse detrás de la pantalla", detail: "Operar HubSpot sin hablar con ventas, clientes ni aliados." },
          { title: "Silos", detail: "Pasar leads a Ventas sin pedir feedback." },
          { title: "Bloqueo técnico", detail: "Depender de terceros para publicar un activo." },
        ],
      },
      maturityPath: {
        intro: "De la coordinación operativa al liderazgo estratégico.",
        levels: [
          { level: "L1", titulo: "Coordinador Operativo", alcance: "Sostiene el calendario, publica a tiempo y cuida la higiene de datos.", impacto: "La marca está viva y la ejecución no fricciona." },
          { level: "L2", titulo: "Campaigner & Builder", alcance: "Construye landings con IA y ejecuta campañas atadas a un ICP.", impacto: "Convierte tráfico en leads de forma constante." },
          { level: "L3", titulo: "Demand Gen Lead", alcance: "Crea el handoff perfecto para Ventas, lidera alianzas y domina la atribución.", impacto: "Inyecta MQLs y SQLs predecibles al pipeline." },
          { level: "L4", titulo: "RevOps Marketer", alcance: "Analiza por qué se ganan y pierden deals, y ajusta contenido y eventos (ABM).", impacto: "Sube la tasa de cierre global." },
          { level: "L5", titulo: "Growth Leader", alcance: "Orquesta modelos predictivos de adquisición y personaliza el journey a escala.", impacto: "Conecta producto, marketing, ventas y alianzas para crecer." },
        ],
      },
      transitionPeriod: {
        md: `Período de **3 meses**. Las primeras semanas: disciplina de L1 (coordinación) mientras toma el workshop interno para saltar a L2 (builder de demanda). Se evalúan primero las **medidas de predicción** y paulatinamente migra la responsabilidad hacia las de **arrastre** (leads y pipeline real).`,
      },
    },
  },
  {
    title: "Customer Success Lead (CSL)",
    area: "Customer Success",
    order: 2,
    summary: "Lleva éxito a toda la cartera: anticipa riesgos y lidera retención, salud y expansión (revenue).",
    content: {
      profile: {
        md: `${PREAMBULO}

**Misión.** Llevar éxito a todos los clientes, anticipar y mitigar riesgos en cuentas de alta complejidad, y liderar la estrategia de **retención, salud y expansión (revenue)** de toda la cartera.`,
      },
      responsibilities: scope(
        "Monitoreo de cuentas y detección de riesgo",
        "Éxito y recomendación del cliente",
        "Desarrollo del talento del equipo",
        "Adopción de IA en el equipo de CSEs",
        "Carga de trabajo y desbloqueo del equipo",
        "Feedback a Ventas y a Desarrollo",
        "Expansión de cuentas (cross y upselling)",
        "Gobernanza del pipeline de proyectos en HubSpot",
      ),
      wig: {
        desde: "un UUS promedio de cartera de 55",
        hasta: "un UUS promedio de 75",
        fecha: "31 de diciembre de 2026",
        contexto:
          "El Unified Usage Score dice si el cliente realmente usa lo que implementamos. Una cartera que no usa la herramienta no renueva y no se expande, por impecable que haya sido la implementación.",
      },
      leadMeasures: {
        items: [
          { title: "Asegura que ninguna cuenta en riesgo quede desatendida", detail: "Health-check con el CSE de cada cuenta marcada en riesgo: qué la traba, qué movida la desbloquea y quién la ejecuta.", meta: "3 por semana." },
          { title: "Forma el criterio consultivo de tu equipo", detail: "Roleplay, simulación de reunión difícil o revisión de diagnóstico con un CSE. Formas criterio, no resuelves por él.", meta: "2 por semana." },
          { title: "Asegura que el cliente use lo que implementamos", detail: "Revisa la adopción real de la cuenta (score de uso, asientos, add-ons) y define con el CSE cuál es la próxima habilitación.", meta: "2 cuentas por semana." },
          { title: "Analiza qué otros servicios puede aprovechar cada cuenta", detail: "Con el CSE, detecta una necesidad nueva del negocio y llévala a la mesa con Ventas.", meta: "2 por semana." },
          { title: "Escucha al cliente de primera mano", detail: "Entra a una sesión de cuenta junto al CSE sin conducirla: vas a escuchar el estado real del negocio, no el avance técnico.", meta: "1 por semana." },
        ],
      },
      lagMeasures: {
        items: [
          { title: "Uso real de la cartera (UUS)", detail: "Si el cliente usa de verdad lo que implementamos.", meta: "De 55 a 75 promedio." },
          { title: "Cuentas en rojo", detail: "Las que caen bajo 40 y ponen la renovación en duda.", meta: "De 4 a 0 cuentas." },
          { title: "Consumo de suscripciones", detail: "Asientos y add-ons realmente usados.", meta: "≥ 80%. Bajo 60% se activa rescate." },
          { title: "Expansión de cartera", detail: "Servicios nuevos vendidos en cuentas prioritarias.", meta: "6 en el año." },
        ],
      },
      scoreboard: {
        items: [
          { measure: "UUS promedio de la cartera", kind: "arrastre", chart: "gauge", fuente: "Partner Clients Object, en el dashboard de Cartera.", ganar: "La aguja sube semana a semana." },
          { measure: "Cuentas bajo 40 de UUS", kind: "arrastre", chart: "bar", fuente: "Partner Clients Object, UUS por cuenta.", ganar: "Ninguna barra por debajo de 40." },
          { measure: "Expansión cerrada", kind: "arrastre", chart: "line", fuente: "Reporte de Negocios de tipo expansión.", ganar: "La línea acumulada va sobre el ritmo del año." },
          { measure: "Health-checks a cuentas en riesgo", kind: "prediccion", chart: "bar", fuente: "Reporte de Actividades.", ganar: "3 o más por semana." },
          { measure: "Conversaciones de expansión abiertas", kind: "prediccion", chart: "bar", fuente: "Reporte de Actividades.", ganar: "2 o más por semana." },
        ],
      },
      cadencia: {
        items: [
          { evento: "WIG Session de Customer Success", quienes: "CSL + todo el equipo de CSEs. Asistencia obligatoria.", cuando: "Lunes 8:30, 20 min. Sagrada: no se mueve.", formato: `${WIG_SESSION} Con equipos grandes, ronda relámpago de 90 segundos por persona.` },
          { evento: "Revisión de cuenta con el CSE", quienes: "CSL + el CSE dueño de la cuenta.", cuando: "Semanal si está en riesgo; quincenal el resto de la cartera prioritaria.", formato: "Se abre el cronograma y el estado real del negocio: qué lo frena, quién decide, qué se escala. Sale con acciones y responsable." },
          { evento: "Bucle con Ventas", quienes: "CSL + Ventas (y Marketing cuando toca expansión).", cuando: "Quincenal, 30 min.", formato: "Desalineaciones entre lo vendido y lo implementado, y cuentas con potencial de expansión." },
          { evento: "1:1 con cada CSE", quienes: "CSL + cada CSE, uno a uno.", cuando: "Mensual, 45 min.", formato: "Ruta de madurez, criterio consultivo y carga de trabajo. Es formación, no revisión de tareas." },
        ],
      },
      successPaths: {
        items: [
          { title: "Éxito del cliente", detail: "Que el foco sea su problema, no solo cumplir el proyecto." },
          { title: "Expansión", detail: "Un camino de crecimiento por cuenta, junto a CSE y Ventas." },
          { title: "Sincronización cara a cara", detail: "Entender el estado de negocio real, no solo el avance técnico." },
          { title: "Mapeo total en HubSpot", detail: "El estatus de cada proyecto siempre reflejado en el pipeline." },
          { title: "Categorización estratégica", detail: "Clasificar la cartera por complejidad, revenue e importancia." },
          { title: "Bucle con Ventas", detail: "Feedback continuo y remoción proactiva de obstáculos." },
        ],
      },
      failurePaths: {
        items: [
          { title: "Enfoque único en implementación", detail: "Cumplir tareas sin mirar el problema del cliente." },
          { title: "Desorientación estratégica", detail: "Que nada se atrase pero el cliente no tenga éxito." },
          { title: "Tratar al CSE como operario", detail: "Revisar checklists en vez de formar criterio." },
          { title: "Feedback solo por escrito", detail: "Chats y reportes sin debate consultivo." },
          { title: "Desconexión de cuentas clave", detail: "No saber las fricciones de los clientes de alto valor." },
          { title: "Burocracia interna", detail: "Ahogar al equipo en reportes manuales." },
        ],
      },
      maturityPath: {
        intro: "Escala provisional del consultor en Smarteam: cada nivel suma complejidad, stack e impacto.",
        levels: [
          { level: "L1", titulo: "Implementador HubSpot inicial", alcance: "1-2 Hubs básicos, conexiones nativas e integraciones estándar.", impacto: "Asimila el método Smarteam e implementa rápido con Breeze." },
          { level: "L2", titulo: "Consultor Multi-Hub y WhatsApp básico", alcance: "Ecosistema HubSpot completo; WhatsApp con conectores del marketplace.", impacto: "Asegura la adopción técnica integral del cliente." },
          { level: "L3", titulo: "WhatsApp Empresarial avanzado + inglés", alcance: "HubSpot full stack y soluciones avanzadas de WhatsApp Empresarial.", impacto: "Maximiza los canales directos y la conversión en portales maduros." },
          { level: "L4", titulo: "Consultor de negocio", alcance: "HubSpot orientado a RevOps; propone integraciones con APIs y Webhooks.", impacto: "Entiende a cada cliente como un negocio con un path de crecimiento." },
          { level: "L5", titulo: "Consultor AI-First", alcance: "Ecosistemas integrados con múltiples sistemas y soluciones a medida con IA.", impacto: "Genera cualquier solución desde las necesidades del cliente y se enfoca en su revenue." },
        ],
      },
    },
  },
];

async function main() {
  console.log(APPLY ? "APLICANDO seed de Roles…\n" : "DRY-RUN del seed de Roles (nada se escribe)…\n");
  for (const r of ROLES) {
    const existing = await prisma.roleProfile.findFirst({ where: { title: r.title }, select: { id: true } });
    const data = { title: r.title, area: r.area, order: r.order, summary: r.summary, content: r.content };
    if (existing) {
      console.log(`~ ${r.title} — ${APPLY ? "ACTUALIZANDO" : "existe → se actualizaría"} (${existing.id})`);
      if (APPLY) await prisma.roleProfile.update({ where: { id: existing.id }, data });
    } else {
      console.log(`+ ${r.title} — ${APPLY ? "CREANDO" : "nuevo → se crearía"}`);
      if (APPLY) await prisma.roleProfile.create({ data: { ...data, createdByEmail: "seed:roles" } });
    }
  }
  console.log(APPLY ? "\n✅ Aplicado." : "\n(DRY-RUN — corré con --apply para escribir)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
