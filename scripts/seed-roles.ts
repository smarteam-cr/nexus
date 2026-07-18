/**
 * scripts/seed-roles.ts — carga (idempotente) los perfiles de puesto iniciales
 * en `RoleProfile`. Dry-run por default; `--apply` para escribir. Upsert por
 * `title` (re-correr NO duplica). Contenido en markdown (lo renderiza RolePage
 * con el motor .stl).
 *
 *   npx tsx scripts/seed-roles.ts            # dry-run
 *   npx tsx scripts/seed-roles.ts --apply    # escribe a la DB
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

const APPLY = process.argv.includes("--apply");

const PREAMBULO =
  "> Smarteam está en transformación hacia una Consultoría Tecnológica Potenciada por IA " +
  "(modelo **AI-First**): el equipo humano se enfoca donde aporta más valor — pensamiento " +
  "crítico, criterio consultivo, habilidades blandas, adopción tecnológica y velocidad de respuesta.";

const ROLES = [
  {
    title: "Marketing Operator (MO)",
    area: "Marketing",
    order: 0,
    summary: "Producción visual, video y web ágil con IA — y motor de post-venta para expandir cuentas.",
    profile: `${PREAMBULO}

**Misión del puesto.** Liderar la producción de activos visuales de alto impacto, la edición de video multimedia y la maquetación web ágil, sirviendo tanto al marketing interno de Smarteam como a la entrega directa con clientes de sitio web. Con metodología AI-First (Figma + Claude/Gemini), asegurar que cada sitio entregado sea estéticamente impecable, funcional y validado en UX/UI, operando como un **motor de post-venta** para expandir la cuenta hacia otros servicios del catálogo (ej. implementaciones de CRM).`,
    responsibilities: `- **Desarrollo y rediseño de sitios web con IA.** Atender a los clientes que adquieren proyectos web. Diseñar en Figma, estructurar y programar prototipos funcionales de forma ágil con Claude/Gemini, validando diseño, lógica de interacción y UX, y dejar el código base listo y mapeado para que Desarrollo lo monte en HubSpot o WordPress.
- **Identificación de oportunidades post-venta (expansión).** Aprovechar la relación de confianza del rediseño para detectar necesidades del negocio resolubles con otros servicios del catálogo (ej. "ya tenés el sitio, ahora un CRM para captar prospectos o automatizar la post-venta") y derivar la oportunidad a Ventas de forma orgánica.
- **Producción multimedia y edición de video.** Crear y editar de forma autónoma piezas de video e insumos gráficos para redes, campañas, webinars y soporte.
- **Publicación y distribución de contenido.** Publicar los insumos en las plataformas (sitio, redes, etc.) cumpliendo especificaciones y formatos, según el calendario liderado por la Marketing Lead.
- **Control de calidad UX/UI (handoff de desarrollo).** Ser el puente de calidad entre cliente, diseño y programación: validar que la implementación final coincida con el prototipo aprobado y que la UX sea impecable.`,
    kpis: `Evaluación que arranca en la ejecución controlable (**predicción**) y escala al impacto comercial (**arrastre**).

1. **Tiempo de entrega y calidad del prototipo web** *(predicción)*. Reducir el ciclo de diseño y maquetación sin comprometer la UX. *Medición:* cumplimiento de las fechas del cronograma de diseño, entregando prototipos codificados y validados con Claude a tiempo a Dev.
2. **Eficiencia en producción gráfica y video** *(predicción)*. Mantener alimentado el motor de contenidos. *Medición:* % de insumos y videos editados, aprobados y publicados a tiempo según el calendario mensual.
3. **Tasa de aprobación UX/UI en handoff** *(arrastre)*. Entregas técnicas sin retrabajo. *Medición:* % de proyectos web que pasan de diseño a desarrollo sin fricciones de maquetación ni inconsistencias de marca.
4. **Leads e ingresos de expansión** *(arrastre — core de negocio)*. Crecimiento orgánico de cartera vía el servicio web. *Medición:* cantidad de oportunidades de CRM u otros servicios detectadas en clientes web y transferidas con éxito a Ventas.`,
    successPaths: `- **Autonomía tecnológica con IA.** Encarar el desarrollo con Claude de forma directa: probar código, iterar la UX en Figma y resolver ágil sin depender de Dev para estructurar la web.
- **Mentalidad consultiva de post-venta.** Escuchar los dolores de los clientes web para proponer integraciones, automatizaciones y el CRM como paso lógico de crecimiento.
- **Calidad visual y estructural extrema.** Que Figma + Claude generen layouts modernos, limpios y optimizados para la conversión.
- **Trabajo colaborativo en ecosistema.** Trabajar hombro a hombro con la Marketing Lead para alinear las piezas al calendario de marca.`,
    failurePaths: `- **Bloqueo técnico / parálisis.** Frenarse ante un error de código básico o limitarse a entregar imágenes estáticas esperando que Dev resuelva todo el comportamiento web.
- **Ejecución pasiva ("checklist").** Entregar el sitio y cerrar el canal de comunicación sin explorar cómo Smarteam puede seguir aportando valor.
- **Descuido del pixel-perfect.** Código desordenado o diseños que no respetan usabilidad móvil ni velocidad de carga.
- **Aislamiento creativo.** Diseñar o editar sin alineación estratégica, provocando desfases de tono, estilo o fechas de lanzamiento.`,
    maturityPath: `De un perfil de ejecución de diseño a una líder de experiencias web orientada al negocio.

### L1 — Diseñadora & Multimedia Junior *(zona de transferencia)*
Domina Figma a nivel visual. Crea imágenes estáticas y videos bajo guion detallado. Requiere asistencia técnica y supervisión para estructurar flujos web.
**Impacto:** sostiene la producción de marca con agilidad y mantiene el estándar estético de Smarteam.

### L2 — AI-Web Builder & Creator *(meta actual a consolidar)*
Estructura y rediseña webs completas de forma autónoma con Claude + Figma. Valida UX/UI. Entrega código listo para que Dev lo asimile.
**Impacto:** reduce a la mitad el ciclo de entrega técnica en desarrollos web y garantiza videos impecables.

### L3 — Web Experience & Post-Sales Consultant *(senior)*
Traduce dolores complejos en soluciones web de alta conversión. Lidera el handoff perfecto diseño–desarrollo. Mapea la cartera web para detectar oportunidades.
**Impacto:** genera de forma orgánica oportunidades comerciales adicionales (upselling CRM / consultorías) desde los clientes web.

### L4 — Conversion Optimization Specialist
Diseña e implementa experimentos A/B, optimizaciones de velocidad y embudos de conversión (CRO) con datos reales. Integración nativa con HubSpot CMS.
**Impacto:** multiplica la captación de leads en los portales de Smarteam y de sus clientes preferenciales.

### L5 — AI-First Creative Experience Director
Diseña la arquitectura e interconexión visual-técnica de ecosistemas digitales complejos. Crea integraciones dinámicas de contenido con IA.
**Impacto:** lidera la conceptualización de las soluciones de más alto valor, como habilitador clave de ingresos y retención de grandes cuentas.`,
    transitionPeriod: `Período estructurado de **3 meses** para dotar de total autonomía en el ecosistema AI-First. En las primeras semanas el anclaje está en sus fortalezas actuales (Figma a profundidad, diseño visual y producción de video básica), mientras ejecuta sus primeros proyectos web completos de forma autónoma con Claude, acompañada por Elías y Dev para limar asperezas técnicas y de código. El éxito inicial se evalúa por la fluidez de su ejecución de diseño/código e iteración web (**métricas de predicción**) antes de exigir resultados en detección y dirección de oportunidades de expansión (**métricas de arrastre**).`,
  },
  {
    title: "Marketing Lead (ML)",
    area: "Marketing",
    order: 1,
    summary: "El motor de demanda: prospectos calificados y predecibles para Ventas.",
    profile: `${PREAMBULO}

**Misión del puesto.** El objetivo principal y absoluto es **generar demanda para Ventas**. El Marketing Lead transforma el área en un motor predecible de prospectos calificados, evolucionando de una base de coordinación interna y tracking hacia el dominio autónomo estratégico (ICP, funnel, alianzas y campañas).`,
    responsibilities: `- **Generación de demanda (objetivo #1) y entrega a Ventas.** Ser la principal fuente de leads: generar y calificar prospectos por un ciclo lógico y entregarlos listos a Ventas. *Tip:* definir y calibrar constantemente con Ventas qué es un "lead calificado", cómo se entrega y en qué momento del ciclo.
- **Organización de eventos (presenciales y digitales).** Planificar y ejecutar webinars, workshops online y eventos presenciales para captar demanda, educar al mercado y acelerar negocios del pipeline.
- **Gestión de partnerships y alianzas.** Cultivar aliados estratégicos (ej. HubSpot y otros partners) para co-crear contenido, webinars conjuntos y audiencias cruzadas que generen leads.
- **Creación de casos de éxito.** Con Customer Success, identificar clientes exitosos, liderar entrevistas y empaquetar historias de alto valor (video, PDF, blog) que Ventas use para cerrar.
- **Construcción de activos digitales potenciada por IA.** Rol de "builder" ágil: diseñar y crear landing pages y páginas internas en HubSpot con IA (Claude) y pasarlas a Desarrollo para integrarlas al CMS.
- **Dirección de estrategia de contenido y funnel.** Dueña de la narrativa: definir qué contenido se produce, para quién (ICP) y para qué etapa del funnel, alineando la ejecución gráfica del equipo de diseño.
- **Gobernanza del calendario y disciplina de datos.** Calendario de marketing inquebrantable (campañas, eventos, alianzas) y datos vivos en HubSpot para una atribución perfecta.`,
    kpis: `Evaluación que arranca en la ejecución controlable (**predicción**) y escala al impacto comercial (**arrastre**).

1. **Tasa de generación y conversión de leads.** Alimentar a Ventas con demanda predecible y calificada. *Medición:* volumen de leads y MQLs generados por mes en todos los canales (inbound, eventos, alianzas).
2. **Ritmo de ejecución del calendario.** Flujo constante de mercado, sin baches. *Medición:* cumplimiento del calendario (contenido, eventos ejecutados, campañas lanzadas, casos de éxito publicados).
3. **Integridad de atribución en HubSpot.** Cero puntos ciegos en la inversión. *Medición:* % de leads y negocios con "origen de campaña" correctamente asignado en el CRM.
4. **Deals influenciados o atribuidos.** Demostrar el ROI real. *Medición:* cantidad de negocios y revenue en el pipeline originados o influenciados por campañas, eventos o casos de éxito.`,
    successPaths: `- **Foco absoluto en Ventas.** Cada post, evento, alianza y caso de éxito busca facilitar conversaciones comerciales y generar reuniones.
- **Proactividad con cliente y aliados.** Salir a buscar historias, entrevistar clientes para casos de éxito y gestionar partners para amplificar el mensaje.
- **Crecimiento guiado y colaborativo.** Apoyarse en Ventas y RevOps para validar el ICP, el mensaje y medir la calidad real de los leads.
- **Adopción de IA para escalar.** Usar IA para crear landings, redactar bases de casos de éxito y campañas directo en HubSpot con autonomía.`,
    failurePaths: `- **Métricas de vanidad.** Conformarse con likes o asistentes sin un plan para convertir ese interés en leads calificados.
- **Quedarse detrás de la pantalla.** Operar HubSpot o programar redes sin interactuar con el ecosistema (ventas, clientes, aliados).
- **Silos departamentales.** Lanzar estrategia sin acompañamiento, o pasar leads a Ventas sin feedback.
- **Bloqueo técnico / parálisis.** Depender de terceros para publicar un activo, o no capacitarse en los vacíos estratégicos.`,
    maturityPath: `De la coordinación operativa (junior/mid) al liderazgo estratégico (senior).

### L1 — Coordinador Operativo *(zona de transferencia)*
Ordena la casa: sostiene el calendario, publica a tiempo, coordina la logística básica de eventos y asegura la higiene de datos.
**Impacto:** mantiene la marca viva y visible; la ejecución ocurre sin fricciones.

### L2 — Campaigner & Builder *(meta a corto plazo)*
Construye landing pages con IA. Empieza a entrevistar clientes para casos de éxito y ejecuta campañas de generación de demanda atadas a un ICP.
**Impacto:** convierte tráfico en leads de forma constante; inicia la entrega de demanda real a Ventas.

### L3 — Demand Gen Lead *(senior)*
Crea el handoff perfecto para Ventas. Lidera alianzas de alto nivel, orquesta eventos complejos y domina la atribución.
**Impacto:** inyecta MQLs y SQLs predecibles al pipeline de forma recurrente, justificando presupuestos.

### L4 — RevOps Marketer
Ve a Smarteam como un solo motor de revenue. Analiza por qué se ganan/pierden deals y ajusta contenidos, alianzas y eventos (ABM).
**Impacto:** sube la tasa de cierre global apoyando la habilitación de ventas.

### L5 — Growth Leader
Orquesta modelos predictivos de adquisición. Personaliza el journey completo a gran escala interconectando todos los canales.
**Impacto:** lidera el crecimiento exponencial conectando producto, marketing, ventas y alianzas.`,
    transitionPeriod: `Período de **3 meses** enfocado en la evolución del talento. Las primeras semanas: disciplina de L1 (fortalezas de coordinación) mientras toma el workshop interno para saltar rápido a L2 (builder de demanda). Se evalúan primero las **métricas de predicción** (lo que controlás y ejecutás) y paulatinamente migra la responsabilidad hacia las de **arrastre** (leads y pipeline real) conforme se adquieren habilidades senior.`,
  },
];

async function main() {
  console.log(APPLY ? "APLICANDO seed de Roles…\n" : "DRY-RUN del seed de Roles (nada se escribe)…\n");
  for (const r of ROLES) {
    const existing = await prisma.roleProfile.findFirst({ where: { title: r.title }, select: { id: true } });
    if (existing) {
      console.log(`~ ${r.title} — ${APPLY ? "ACTUALIZANDO" : "existe → se actualizaría"} (${existing.id})`);
      if (APPLY) await prisma.roleProfile.update({ where: { id: existing.id }, data: r });
    } else {
      console.log(`+ ${r.title} — ${APPLY ? "CREANDO" : "nuevo → se crearía"}`);
      if (APPLY) await prisma.roleProfile.create({ data: { ...r, createdByEmail: "seed:roles" } });
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
