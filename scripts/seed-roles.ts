/**
 * scripts/seed-roles.ts — carga (idempotente) los perfiles de puesto iniciales en
 * `RoleProfile`. Dry-run por default; `--apply` para escribir. Upsert por `title`
 * (re-correr NO duplica).
 *
 * El contenido va ESTRUCTURADO por sección en `RoleProfile.content` (mapa
 * { [sectionKey]: data }), que el motor de landing renderiza como cards/KPIs/escalera/
 * prosa (ver components/landing/configs/roles.defs.ts). Reemplaza el markdown plano de
 * las columnas viejas — las secciones prose (profile/transitionPeriod) siguen en markdown
 * dentro de `{ md }`; el resto es data estructurada.
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

const KPI_INTRO = "Evaluación que arranca en la ejecución controlable (predicción) y escala al impacto comercial (arrastre).";

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

**Misión del puesto.** Liderar la producción de activos visuales de alto impacto, la edición de video multimedia y la maquetación web ágil, sirviendo tanto al marketing interno de Smarteam como a la entrega directa con clientes de sitio web. Con metodología AI-First (Figma + Claude/Gemini), asegurar que cada sitio entregado sea estéticamente impecable, funcional y validado en UX/UI, operando como un **motor de post-venta** para expandir la cuenta hacia otros servicios del catálogo (ej. implementaciones de CRM).`,
      },
      responsibilities: {
        items: [
          { title: "Desarrollo y rediseño de sitios web con IA", detail: "Atender a los clientes que adquieren proyectos web. Diseñar en Figma, estructurar y programar prototipos funcionales de forma ágil con Claude/Gemini, validando diseño, lógica de interacción y UX, y dejar el código base listo y mapeado para que Desarrollo lo monte en HubSpot o WordPress." },
          { title: "Identificación de oportunidades post-venta (expansión)", detail: "Aprovechar la relación de confianza del rediseño para detectar necesidades del negocio resolubles con otros servicios del catálogo (ej. «ya tenés el sitio, ahora un CRM para captar prospectos o automatizar la post-venta») y derivar la oportunidad a Ventas de forma orgánica." },
          { title: "Producción multimedia y edición de video", detail: "Crear y editar de forma autónoma piezas de video e insumos gráficos para redes, campañas, webinars y soporte." },
          { title: "Publicación y distribución de contenido", detail: "Publicar los insumos en las plataformas (sitio, redes, etc.) cumpliendo especificaciones y formatos, según el calendario liderado por la Marketing Lead." },
          { title: "Control de calidad UX/UI (handoff de desarrollo)", detail: "Ser el puente de calidad entre cliente, diseño y programación: validar que la implementación final coincida con el prototipo aprobado y que la UX sea impecable." },
        ],
      },
      kpis: {
        intro: KPI_INTRO,
        items: [
          { title: "Tiempo de entrega y calidad del prototipo web", kind: "prediccion", objetivo: "Reducir el ciclo de diseño y maquetación sin comprometer la UX.", medicion: "Cumplimiento de las fechas del cronograma de diseño, entregando prototipos codificados y validados con Claude a tiempo a Dev." },
          { title: "Eficiencia en producción gráfica y video", kind: "prediccion", objetivo: "Mantener alimentado el motor de contenidos.", medicion: "% de insumos y videos editados, aprobados y publicados a tiempo según el calendario mensual." },
          { title: "Tasa de aprobación UX/UI en handoff", kind: "arrastre", objetivo: "Entregas técnicas sin retrabajo.", medicion: "% de proyectos web que pasan de diseño a desarrollo sin fricciones de maquetación ni inconsistencias de marca." },
          { title: "Leads e ingresos de expansión", kind: "arrastre", objetivo: "Crecimiento orgánico de cartera vía el servicio web (core de negocio).", medicion: "Cantidad de oportunidades de CRM u otros servicios detectadas en clientes web y transferidas con éxito a Ventas." },
        ],
      },
      successPaths: {
        items: [
          { title: "Autonomía tecnológica con IA", detail: "Encarar el desarrollo con Claude de forma directa: probar código, iterar la UX en Figma y resolver ágil sin depender de Dev para estructurar la web." },
          { title: "Mentalidad consultiva de post-venta", detail: "Escuchar los dolores de los clientes web para proponer integraciones, automatizaciones y el CRM como paso lógico de crecimiento." },
          { title: "Calidad visual y estructural extrema", detail: "Que Figma + Claude generen layouts modernos, limpios y optimizados para la conversión." },
          { title: "Trabajo colaborativo en ecosistema", detail: "Trabajar hombro a hombro con la Marketing Lead para alinear las piezas al calendario de marca." },
        ],
      },
      failurePaths: {
        items: [
          { title: "Bloqueo técnico / parálisis", detail: "Frenarse ante un error de código básico o limitarse a entregar imágenes estáticas esperando que Dev resuelva todo el comportamiento web." },
          { title: "Ejecución pasiva («checklist»)", detail: "Entregar el sitio y cerrar el canal de comunicación sin explorar cómo Smarteam puede seguir aportando valor." },
          { title: "Descuido del pixel-perfect", detail: "Código desordenado o diseños que no respetan usabilidad móvil ni velocidad de carga." },
          { title: "Aislamiento creativo", detail: "Diseñar o editar sin alineación estratégica, provocando desfases de tono, estilo o fechas de lanzamiento." },
        ],
      },
      maturityPath: {
        intro: "De un perfil de ejecución de diseño a una líder de experiencias web orientada al negocio.",
        levels: [
          { level: "L1", titulo: "Diseñadora & Multimedia Junior — zona de transferencia", alcance: "Domina Figma a nivel visual. Crea imágenes estáticas y videos bajo guion detallado. Requiere asistencia técnica y supervisión para estructurar flujos web.", impacto: "Sostiene la producción de marca con agilidad y mantiene el estándar estético de Smarteam." },
          { level: "L2", titulo: "AI-Web Builder & Creator — meta actual a consolidar", alcance: "Estructura y rediseña webs completas de forma autónoma con Claude + Figma. Valida UX/UI. Entrega código listo para que Dev lo asimile.", impacto: "Reduce a la mitad el ciclo de entrega técnica en desarrollos web y garantiza videos impecables." },
          { level: "L3", titulo: "Web Experience & Post-Sales Consultant — senior", alcance: "Traduce dolores complejos en soluciones web de alta conversión. Lidera el handoff perfecto diseño–desarrollo. Mapea la cartera web para detectar oportunidades.", impacto: "Genera de forma orgánica oportunidades comerciales adicionales (upselling CRM / consultorías) desde los clientes web." },
          { level: "L4", titulo: "Conversion Optimization Specialist", alcance: "Diseña e implementa experimentos A/B, optimizaciones de velocidad y embudos de conversión (CRO) con datos reales. Integración nativa con HubSpot CMS.", impacto: "Multiplica la captación de leads en los portales de Smarteam y de sus clientes preferenciales." },
          { level: "L5", titulo: "AI-First Creative Experience Director", alcance: "Diseña la arquitectura e interconexión visual-técnica de ecosistemas digitales complejos. Crea integraciones dinámicas de contenido con IA.", impacto: "Lidera la conceptualización de las soluciones de más alto valor, como habilitador clave de ingresos y retención de grandes cuentas." },
        ],
      },
      transitionPeriod: {
        md: `Período estructurado de **3 meses** para dotar de total autonomía en el ecosistema AI-First. En las primeras semanas el anclaje está en sus fortalezas actuales (Figma a profundidad, diseño visual y producción de video básica), mientras ejecuta sus primeros proyectos web completos de forma autónoma con Claude, acompañada por Elías y Dev para limar asperezas técnicas y de código. El éxito inicial se evalúa por la fluidez de su ejecución de diseño/código e iteración web (**métricas de predicción**) antes de exigir resultados en detección y dirección de oportunidades de expansión (**métricas de arrastre**).`,
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

**Misión del puesto.** El objetivo principal y absoluto es **generar demanda para Ventas**. El Marketing Lead transforma el área en un motor predecible de prospectos calificados, evolucionando de una base de coordinación interna y tracking hacia el dominio autónomo estratégico (ICP, funnel, alianzas y campañas).`,
      },
      responsibilities: {
        items: [
          { title: "Generación de demanda (objetivo #1) y entrega a Ventas", detail: "Ser la principal fuente de leads: generar y calificar prospectos por un ciclo lógico y entregarlos listos a Ventas. Tip: definir y calibrar constantemente con Ventas qué es un «lead calificado», cómo se entrega y en qué momento del ciclo." },
          { title: "Organización de eventos (presenciales y digitales)", detail: "Planificar y ejecutar webinars, workshops online y eventos presenciales para captar demanda, educar al mercado y acelerar negocios del pipeline." },
          { title: "Gestión de partnerships y alianzas", detail: "Cultivar aliados estratégicos (ej. HubSpot y otros partners) para co-crear contenido, webinars conjuntos y audiencias cruzadas que generen leads." },
          { title: "Creación de casos de éxito", detail: "Con Customer Success, identificar clientes exitosos, liderar entrevistas y empaquetar historias de alto valor (video, PDF, blog) que Ventas use para cerrar." },
          { title: "Construcción de activos digitales potenciada por IA", detail: "Rol de «builder» ágil: diseñar y crear landing pages y páginas internas en HubSpot con IA (Claude) y pasarlas a Desarrollo para integrarlas al CMS." },
          { title: "Dirección de estrategia de contenido y funnel", detail: "Dueña de la narrativa: definir qué contenido se produce, para quién (ICP) y para qué etapa del funnel, alineando la ejecución gráfica del equipo de diseño." },
          { title: "Gobernanza del calendario y disciplina de datos", detail: "Calendario de marketing inquebrantable (campañas, eventos, alianzas) y datos vivos en HubSpot para una atribución perfecta." },
        ],
      },
      kpis: {
        intro: KPI_INTRO,
        items: [
          { title: "Tasa de generación y conversión de leads", kind: "arrastre", objetivo: "Alimentar a Ventas con demanda predecible y calificada.", medicion: "Volumen de leads y MQLs generados por mes en todos los canales (inbound, eventos, alianzas)." },
          { title: "Ritmo de ejecución del calendario", kind: "prediccion", objetivo: "Flujo constante de mercado, sin baches.", medicion: "Cumplimiento del calendario (contenido, eventos ejecutados, campañas lanzadas, casos de éxito publicados)." },
          { title: "Integridad de atribución en HubSpot", kind: "prediccion", objetivo: "Cero puntos ciegos en la inversión.", medicion: "% de leads y negocios con «origen de campaña» correctamente asignado en el CRM." },
          { title: "Deals influenciados o atribuidos", kind: "arrastre", objetivo: "Demostrar el ROI real.", medicion: "Cantidad de negocios y revenue en el pipeline originados o influenciados por campañas, eventos o casos de éxito." },
        ],
      },
      successPaths: {
        items: [
          { title: "Foco absoluto en Ventas", detail: "Cada post, evento, alianza y caso de éxito busca facilitar conversaciones comerciales y generar reuniones." },
          { title: "Proactividad con cliente y aliados", detail: "Salir a buscar historias, entrevistar clientes para casos de éxito y gestionar partners para amplificar el mensaje." },
          { title: "Crecimiento guiado y colaborativo", detail: "Apoyarse en Ventas y RevOps para validar el ICP, el mensaje y medir la calidad real de los leads." },
          { title: "Adopción de IA para escalar", detail: "Usar IA para crear landings, redactar bases de casos de éxito y campañas directo en HubSpot con autonomía." },
        ],
      },
      failurePaths: {
        items: [
          { title: "Métricas de vanidad", detail: "Conformarse con likes o asistentes sin un plan para convertir ese interés en leads calificados." },
          { title: "Quedarse detrás de la pantalla", detail: "Operar HubSpot o programar redes sin interactuar con el ecosistema (ventas, clientes, aliados)." },
          { title: "Silos departamentales", detail: "Lanzar estrategia sin acompañamiento, o pasar leads a Ventas sin feedback." },
          { title: "Bloqueo técnico / parálisis", detail: "Depender de terceros para publicar un activo, o no capacitarse en los vacíos estratégicos." },
        ],
      },
      maturityPath: {
        intro: "De la coordinación operativa (junior/mid) al liderazgo estratégico (senior).",
        levels: [
          { level: "L1", titulo: "Coordinador Operativo — zona de transferencia", alcance: "Ordena la casa: sostiene el calendario, publica a tiempo, coordina la logística básica de eventos y asegura la higiene de datos.", impacto: "Mantiene la marca viva y visible; la ejecución ocurre sin fricciones." },
          { level: "L2", titulo: "Campaigner & Builder — meta a corto plazo", alcance: "Construye landing pages con IA. Empieza a entrevistar clientes para casos de éxito y ejecuta campañas de generación de demanda atadas a un ICP.", impacto: "Convierte tráfico en leads de forma constante; inicia la entrega de demanda real a Ventas." },
          { level: "L3", titulo: "Demand Gen Lead — senior", alcance: "Crea el handoff perfecto para Ventas. Lidera alianzas de alto nivel, orquesta eventos complejos y domina la atribución.", impacto: "Inyecta MQLs y SQLs predecibles al pipeline de forma recurrente, justificando presupuestos." },
          { level: "L4", titulo: "RevOps Marketer", alcance: "Ve a Smarteam como un solo motor de revenue. Analiza por qué se ganan/pierden deals y ajusta contenidos, alianzas y eventos (ABM).", impacto: "Sube la tasa de cierre global apoyando la habilitación de ventas." },
          { level: "L5", titulo: "Growth Leader", alcance: "Orquesta modelos predictivos de adquisición. Personaliza el journey completo a gran escala interconectando todos los canales.", impacto: "Lidera el crecimiento exponencial conectando producto, marketing, ventas y alianzas." },
        ],
      },
      transitionPeriod: {
        md: `Período de **3 meses** enfocado en la evolución del talento. Las primeras semanas: disciplina de L1 (fortalezas de coordinación) mientras toma el workshop interno para saltar rápido a L2 (builder de demanda). Se evalúan primero las **métricas de predicción** (lo que controlás y ejecutás) y paulatinamente migra la responsabilidad hacia las de **arrastre** (leads y pipeline real) conforme se adquieren habilidades senior.`,
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
