/**
 * lib/documentacion/semillas/base/servicios.ts — la sección «Servicios».
 *
 *   🧩 Servicios          el catálogo, las plataformas y a quién le hablamos
 *   └── 🏆 Casos de éxito
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * El catálogo sale de la página «Servicios» del sitio web, reescrito para el equipo y no para el
 * prospecto. SmartLoop NO se repite: enlaza a su página, que vive en Customer Success. La regla para
 * elegir plataforma es la del sitio (quién cierra la venta, una persona o el sitio).
 * Los casos salen de los dos casos publicados. ⛔ Lo que no se publicó ahí —precios, plazos internos,
 * citas sin validar— tampoco entra acá.
 */
import {
  aviso,
  cita,
  divisor,
  enlace,
  numerado,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";

const nota = (texto: string) => parrafoRico([texto, { italica: true }]);

export const CATALOGO: [servicio: string, queEs: string, paraQuien: string][] = [
  ["Implementación de CRM", "HubSpot configurado sobre el proceso real del cliente: pipelines, automatización, reportes y adopción.", "B2B y B2C"],
  ["Rescate de CRM", "Para quien ya tiene HubSpot y nadie lo usa: lo reordenamos, lo limpiamos y lo volvemos a poner a producir.", "empresas que ya tienen HubSpot"],
  ["CDP y activación", "Los datos de cliente unificados con Insider y activados en la web, el correo, las notificaciones push y WhatsApp.", "B2C"],
  ["Integraciones y automatización", "APIs, webhooks y sincronizaciones entre CRM, ERP, e-commerce y soporte, funcionando en producción.", "B2B y B2C"],
  ["RevOps y alineación", "Marketing, ventas y servicio operando con las mismas métricas, los mismos datos y traspasos claros.", "B2B"],
  ["Migraciones de datos", "La información migrada y limpia entre plataformas, sin perder historial ni trazabilidad.", "B2B y B2C"],
  ["Desarrollo de sitio web", "Sitios rápidos y orientados a conversión, integrados al CRM: cada visita se vuelve dato.", "B2B y B2C"],
];

function bloquesDeServicios(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "servicios que se combinan según el punto de partida de cada cliente: se empieza por uno y se termina con un circuito completo.",
    ),
    parrafoRico(
      "Todos arrancan igual: entender cómo opera hoy la empresa. Por eso el diagnóstico usa la ",
      deCs("escala"),
      ", y la propuesta ya estima dónde está la operación del prospecto.",
    ),

    titulo(2, "El catálogo"),
    tarjetas(
      "2",
      ...CATALOGO.map(([servicio, queEs, paraQuien]) =>
        tarjeta(servicio, queEs, parrafoRico(["Para: ", { negrita: true }], `${paraQuien}.`)),
      ),
      tarjeta(
        "SmartLoop",
        "El servicio recurrente: vueltas mensuales que arrancan con una hipótesis y cierran con una métrica medida y un reporte.",
        parrafoRico("Cómo es y cómo se opera: ", deCs("smartloop"), "."),
      ),
    ),

    titulo(2, "Sobre qué plataformas"),
    parrafo(
      "Trabajamos sobre HubSpot, del que somos Elite Partner, y sobre Insider, del que somos partner oficial. La pregunta que decide cuál conviene no es si el cliente le vende a empresas o a personas: es quién cierra la venta.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "La venta la cierra una persona → HubSpot",
        "Ciclos consultivos, con un asesor de por medio: inmobiliarias, educación, salud, servicios, industria y software.",
      ),
      tarjeta(
        "La venta la cierra el sitio → Insider",
        "Alto volumen y compra en línea: retail, e-commerce, viajes, telecomunicaciones y banca masiva.",
      ),
    ),
    parrafo(
      "Donde las dos se cruzan —banca, automotriz, aerolíneas— suele estar la mejor conversación de venta cruzada.",
    ),

    titulo(2, "A quién le hablamos"),
    parrafoRico(
      "El cliente ideal y las buyer personas viven en ",
      enlace("Marketing → Audiencia", "/marketing/icp"),
      ", en Nexus.",
    ),

    titulo(2, "Cómo se ve en la práctica"),
    parrafoRico("Dos proyectos contados de punta a punta: ", a("casos"), "."),

    divisor(),
    nota("El catálogo sale de la página «Servicios» del sitio web de Smarteam."),
  ];
}

function bloquesDeCasos(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "dos proyectos publicados en el sitio web, contados sin cifras inventadas. Sirven para explicar con un ejemplo real cómo trabajamos.",
    ),

    titulo(2, "Grupo Servica: logística integrada, operación conectada"),
    tabla([
      ["Dato", "Grupo Servica"],
      ["Industria", "Logística y transporte internacional"],
      ["Presencia", "Costa Rica (5 oficinas) y Guatemala"],
      ["Trayectoria y equipo", "Más de 45 años y 300 colaboradores"],
      ["Qué hicimos", "HubSpot Sales Hub con cotizaciones"],
    ]),
    titulo(3, "El reto"),
    parrafo(
      "La operación comercial se gestionaba en hojas de Excel. Sin un lugar único donde viviera el proceso no había forma de ver en qué punto estaba cada oportunidad: se perdían leads y la gestión comercial no dejaba rastro.",
    ),
    titulo(3, "Qué hicimos"),
    numerado("Diagnóstico de la operación: el proceso comercial, las herramientas en uso y la usabilidad que el equipo necesitaba. El hallazgo de fondo fue que no existía una estructura operativa clara y todo se hacía a mano."),
    numerado("Diseño: HubSpot Sales Hub con cotizaciones, con el pipeline armado sobre el proceso comercial real de Servica y no sobre una plantilla genérica."),
    numerado("Implementación: el pipeline de ventas con notificaciones internas automáticas, y cotizaciones por plantilla para cada línea de servicio."),
    numerado("Adopción: capacitación por módulos en unas 14 sesiones a lo largo de 2 meses, con un grupo de 10 a 15 personas."),
    titulo(3, "Resultado"),
    vinneta("Pipeline trazable: cada oportunidad tiene etapa, responsable y seguimiento."),
    vinneta("Cotizar sin rehacer: plantillas por línea de servicio en vez de armar cada cotización desde cero."),
    vinneta("Seis meses de proyecto, de enero a julio de 2023."),
    cita(
      "«Realmente nos sentimos muy cómodos desde el inicio. Lograron entender el ADN de nuestra empresa y de ahí en adelante sus aportes y la forma de facilitarnos el entendimiento fue bastante amigable. Sin duda los recomiendo y volvería a adquirir sus servicios.» — Melania González, Gerente Comercial, Grupo Servica",
    ),

    titulo(2, "Grupo INVE: venta técnica en cinco países"),
    tabla([
      ["Dato", "Grupo INVE"],
      ["Industria", "Proveedor industrial para alimentos y bebidas"],
      ["Presencia", "Guatemala, El Salvador, Honduras, Costa Rica y República Dominicana"],
      ["Líneas", "Calidad, higiene, aguas, ingredientes y soporte"],
      ["Qué hicimos", "HubSpot Sales, Data, Service y Marketing Hub, con integraciones"],
    ]),
    titulo(3, "El reto"),
    parrafo(
      "La operación comercial vivía en Salesforce, sobre una base con clientes, contactos y productos duplicados entre las divisiones del grupo.",
    ),
    parrafo(
      "El problema de fondo no era la herramienta sino lo que quedaba afuera de ella: sin integraciones con SAP, 3CX, WhatsApp, Power BI ni DocuSign no había forma de ver la rentabilidad real ni de seguir la gestión comercial y de servicio en un solo lugar.",
    ),
    titulo(3, "Qué hicimos"),
    numerado("Diagnóstico: más de 25 entrevistas con gerentes de país, líderes de línea, equipos comerciales, servicio al cliente, compras y técnicos."),
    numerado("Diseño: un ecosistema de HubSpot con Sales Hub Enterprise como núcleo, más Data, Service y Marketing Hub, integrado a SAP, 3CX y Power BI."),
    numerado("Implementación: la base limpia y sincronizada contra SAP, objetos personalizados para CAPEX, demos, pruebas e inventario, y cotizaciones por división sincronizadas con el catálogo de SAP."),
    numerado("Adopción: una visita presencial de 5 días a Guatemala en diciembre de 2025, con las divisiones entrenadas en grupos de 15 a 20 personas."),
    titulo(3, "Resultado"),
    vinneta("Sin duplicados: la base depurada y sincronizada con SAP."),
    vinneta("Las divisiones operando sobre la misma plataforma, con una sola vista del cliente."),
    vinneta("100 usuarios capacitados presencialmente antes de encender la plataforma."),

    titulo(2, "Lo que tienen en común"),
    parrafoRico(
      "Los dos arrancaron por entender la operación antes de configurar nada, que es uno de nuestros valores: ",
      a("proposito"),
      ".",
    ),

    divisor(),
    nota(
      "Sale de los casos publicados en el sitio web. Lo que no se publicó ahí —precios, plazos internos, citas sin validar— tampoco va acá.",
    ),
  ];
}

export function construirServicios(): PaginaSembrada {
  return {
    ...pagina("servicios"),
    bloques: bloquesDeServicios(),
    hijas: [{ ...pagina("casos"), bloques: bloquesDeCasos() }],
  };
}
