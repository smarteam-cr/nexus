/**
 * lib/casos-de-uso/catalogo.ts — el catálogo de casos de uso de Smarteam (BORRADOR: versión 1 del 2026-10-11; el
 * 2026-11-04 pasó a 37 casos con el MVP de la biblioteca de actividades, docs/actividades-plan.md).
 *
 * Pedido de Elías: un catálogo mínimo para que la preventa y las propuestas lo usen de inspiración. Cada caso dice
 * el RESULTADO que obtiene el cliente, nunca el trabajo que se hace. Está atado a la Escala de Rendimiento: qué
 * dimensiones mueve, de qué nivel a cuál y qué criterios cubre (`catalogo.test.ts` verifica que existan en la
 * escala publicada y que el nivel calce). Las herramientas y los servicios salen del mapa de herramientas
 * (docs/escala/mapa_de_herramientas.md).
 *
 * Tres tipos, como los ordena la escala («Land and expand»):
 *   - aterrizar: lleva un área a Funcional. Para la escala no es un caso de uso: es el servicio de entrada.
 *   - reactivar: recupera un HubSpot que se paga y no se usa (de Inicial a Funcional).
 *   - expandir: desde Funcional, sube una o varias dimensiones al nivel siguiente. Esto es un caso de uso.
 *   - complementario: un servicio que la escala no mide. No cita criterios.
 *
 * Fase 2: el licenciamiento de cada caso (hubs, ediciones y asientos). Por eso no hay campo todavía.
 * Lo que se entrega, las actividades internas y sus horas viven aparte, en `actividades.ts` (solo servidor).
 * Este archivo es puro y no toca la base: se puede leer en el navegador.
 */
import type { Letra } from "@/lib/escala/documento/tipos";

export type TipoDeCaso = "aterrizar" | "reactivar" | "expandir" | "complementario";

/** Las herramientas, con las claves del mapa de herramientas. */
export type Herramienta = "hubspot" | "insider" | "smarteam";

/** Los servicios de Smarteam, con los nombres del mapa de herramientas. Los dos últimos todavía no están en el mapa. */
export const SERVICIOS = [
  "Implementación de CRM",
  "Rescate de CRM",
  "Migraciones de datos",
  "Integraciones y automatización",
  "RevOps y alineación",
  "CDP y activación",
  "Desarrollo de sitio web",
  "SmartLoop",
  "Contenido y SEO",
  "Capacitación técnica",
] as const;
export type Servicio = (typeof SERVICIOS)[number];

/** Las áreas de la escala: 1 Ventas, 2 Marketing, 3 Servicio. */
export type AreaDeLaEscala = "1" | "2" | "3";

export interface Movimiento {
  /** La dimensión de la escala: `1.5`. */
  dimension: string;
  /** El nivel en que suele estar cuando se ofrece el caso. */
  desde: Letra;
  /** El nivel al que la deja. */
  hasta: Letra;
}

export interface CasoDelCatalogo {
  /** Estable: no cambia aunque cambie el título. */
  id: string;
  /**
   * El nombre de lo que el cliente compra (Marco, 2026-11-09): un verbo en infinitivo con lo que se le entrega
   * («Estandarizar el proceso comercial en HubSpot»), con las reglas que sigue el agente de la preventa
   * (`REGLAS_DEL_TITULO`, orden.ts): de 4 a 10 palabras, una sola idea, sin metáforas. El agente lo adapta al negocio de
   * cada empresa («… de tus servicios SaaS»). `catalogo.test.ts` lo verifica.
   */
  titulo: string;
  /** Lo que gana el cliente, en una frase. */
  promesa: string;
  /** Qué incluye, contado como lo que cambia para el cliente: dos frases. Es la que se lee en la tarjeta del catálogo. */
  descripcion: string;
  tipo: TipoDeCaso;
  areas: AreaDeLaEscala[];
  /** Cómo lo diría el cliente. Es lo que usa el agente para reconocer el caso en una reunión. */
  sintomas: string[];
  /** Lo que el cliente puede hacer, ver o decidir que antes no podía. Resultados, no trabajo. */
  obtienes: string[];
  mueve: Movimiento[];
  /** Los criterios de la escala general que cubre (`1.5.F4`). */
  criterios: string[];
  herramientas: Herramienta[];
  servicios: Servicio[];
  /** Cuándo conviene, en palabras para el cliente (lo puede leer él). */
  cuandoConviene?: string;
  /** Los casos que hacen falta antes, todos. Se leen como el área funcionando: también vale Reactiva, Migra o un HubSpot que ya funciona. */
  requiere?: string[];
  /** Basta con uno de estos casos antes (por ejemplo, Ventas o Servicio funcionando en HubSpot). */
  requiereUnoDe?: string[];
  /** El caso más grande del que este es una parte más chica. */
  dentroDe?: string;
  /**
   * Su capa en el plan (pedido de Marco y Elías del 2026-11-09, lib/casos-de-uso/capas.ts): «casa» es la implementación
   * base (arquitectura y proceso); «proceso», lo que se monta encima; «ia», los agentes, la IA y la automatización
   * avanzada; «sostener», lo que mantiene lo que ya funciona. Un cliente sin la casa ordenada va de la primera a la última.
   */
  capa: CapaDelCaso;
  /** Casos en los que se apoya si están en la misma venta (más blando que `requiere`: sin ellos igual se puede vender). */
  seApoyaEn?: string[];
  /** Casos a los que este les entrega lo que produce (WhatsApp alimenta el centro de ayuda): va después de ellos. */
  alimenta?: string[];
}

/** Las capas del plan, de la primera a la última (lib/casos-de-uso/capas.ts las explica). */
export const CAPAS_DEL_CASO = ["casa", "proceso", "ia", "sostener"] as const;
export type CapaDelCaso = (typeof CAPAS_DEL_CASO)[number];

export const CATALOGO_DE_CASOS: readonly CasoDelCatalogo[] = [
  // ─── Aterrizar por hub (las implementaciones por licencia) ──────────────────────────────────────────────────
  {
    id: "sistematiza-ventas",
    titulo: "Estandarizar el proceso comercial en HubSpot",
    promesa:
      "Tu equipo comercial vende con un mismo proceso en el CRM y ves en qué va cada negocio sin tener que preguntar.",
    descripcion:
      "Tu proceso comercial queda en HubSpot de punta a punta: un pipeline con etapas claras y razones de pérdida, la ficha de cada cliente con lo que importa, reglas para repartir los leads y un tablero ligado a tu meta. Tu equipo vende igual y tú ves el avance sin pedir reportes.",
    tipo: "aterrizar",
    capa: "casa",
    areas: ["1"],
    sintomas: [
      "Cada vendedor vende a su manera.",
      "No sé en qué va cada negocio hasta que pregunto.",
      "Los leads se los queda quien los ve primero.",
      "No sé por qué perdemos los negocios.",
      "Los negocios viven en un Excel y en el WhatsApp de cada vendedor.",
    ],
    obtienes: [
      "Si rota un vendedor, el siguiente sabe en qué va cada negocio.",
      "Ningún lead se pierde por no saber a quién le toca.",
      "Ves el estado real del pipeline cuando lo necesitas, sin armar el reporte a mano.",
      "Ningún negocio se enfría sin que alguien reaccione.",
    ],
    mueve: [
      { dimension: "1.1", desde: "D", hasta: "F" },
      { dimension: "1.2", desde: "D", hasta: "F" },
      { dimension: "1.3", desde: "D", hasta: "F" },
      { dimension: "1.4", desde: "D", hasta: "F" },
      { dimension: "1.7", desde: "D", hasta: "F" },
      { dimension: "1.8", desde: "D", hasta: "F" },
    ],
    criterios: [
      "1.1.F1", "1.1.F2", "1.1.F4", "1.1.F5", "1.1.F6",
      "1.2.F2", "1.2.F3",
      "1.3.F1", "1.3.F3", "1.3.F4",
      "1.4.F6", "1.4.F2", "1.4.F3",
      "1.7.F1", "1.7.F2", "1.7.F3",
      "1.8.F1", "1.8.F2", "1.8.F3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando tienes un equipo que vende (aunque sean dos personas) y tus negocios viven en hojas, en el correo, en el WhatsApp o en la cabeza de cada vendedor.",
  },
  {
    id: "sistematiza-marketing",
    titulo: "Montar tu proceso de marketing en HubSpot",
    promesa:
      "Tu marketing deja de depender de una persona: sabes de dónde viene cada lead y cuánto te cuesta en cada canal.",
    descripcion:
      "Tu marketing queda montado en HubSpot: formularios que entran al sistema, segmentos, campañas con fecha y reportes por canal. Tu cliente ideal, tus buyer personas y tu voz de marca quedan escritos donde la IA de HubSpot los usa para escribir como tu marca.",
    tipo: "aterrizar",
    capa: "casa",
    areas: ["2"],
    sintomas: [
      "No sé de dónde vienen mis leads.",
      "Las campañas salen cuando alguien tiene tiempo.",
      "Pagamos herramientas que nadie usa.",
      "Los formularios del sitio llegan a un correo y ahí se quedan.",
    ],
    obtienes: [
      "Sabes de dónde viene cada lead y cuánto te cuesta según el canal, con reportes que salen del sistema.",
      "Las campañas siguen saliendo aunque cambie una persona del equipo.",
      "Todo lo que entra por el sitio llega al sistema y recibe respuesta.",
      "La IA de HubSpot y sus agentes tienen con qué escribir como tu marca: tu cliente ideal, tus buyer personas y tu voz de marca.",
    ],
    mueve: [
      { dimension: "2.1", desde: "D", hasta: "F" },
      { dimension: "2.2", desde: "D", hasta: "F" },
      { dimension: "2.3", desde: "D", hasta: "F" },
      { dimension: "2.4", desde: "D", hasta: "F" },
      { dimension: "2.5", desde: "D", hasta: "F" },
      { dimension: "2.7", desde: "D", hasta: "F" },
      { dimension: "2.8", desde: "D", hasta: "F" },
    ],
    criterios: [
      "2.1.F1", "2.1.F2", "2.1.F3", "2.1.F6",
      "2.2.F2", "2.2.F3", "2.2.F5", "2.2.F9",
      "2.3.F1", "2.3.F5",
      "2.4.F7", "2.4.F2", "2.4.F3",
      "2.5.F1", "2.5.F2", "2.5.F3", "2.5.F7",
      "2.7.F5", "2.7.F6",
      "2.8.F3", "2.8.F5",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando alguien en tu empresa hace marketing y no sabes de dónde vienen tus leads ni cuánto te cuestan. Si todavía no tienes escritos tu cliente ideal, tus buyer personas ni tu voz de marca, aquí quedan listos para la IA de HubSpot.",
  },
  {
    id: "sistematiza-servicio",
    titulo: "Estructurar el centro de ayuda en HubSpot",
    promesa:
      "Tu servicio deja de depender de una persona: cada caso se atiende igual, con la historia del cliente a la vista.",
    descripcion:
      "Tu servicio queda en HubSpot: cada caso entra a una bandeja, sigue etapas claras, tiene una prioridad y un responsable y queda en la ficha del cliente. El equipo responde con consistencia y tú sabes qué problemas llegan.",
    tipo: "aterrizar",
    capa: "casa",
    areas: ["3"],
    sintomas: [
      "Cuando falta una persona, los casos se acumulan.",
      "Cada agente responde desde su correo o su teléfono.",
      "Nos enteramos del problema cuando el cliente ya está enojado.",
      "No sabemos cuántos casos llegan ni de qué tipo.",
      "Cada cliente nuevo arranca distinto según quién lo reciba.",
    ],
    obtienes: [
      "Un caso se atiende igual sin importar qué agente lo tome.",
      "Cualquier agente tiene la historia del cliente en segundos.",
      "Lo urgente se atiende primero.",
      "Sabes qué tipo de problemas llegan y cuántos.",
    ],
    mueve: [
      { dimension: "3.1", desde: "D", hasta: "F" },
      { dimension: "3.2", desde: "D", hasta: "F" },
      { dimension: "3.3", desde: "D", hasta: "F" },
      { dimension: "3.4", desde: "D", hasta: "F" },
      { dimension: "3.5", desde: "D", hasta: "F" },
      { dimension: "3.6", desde: "D", hasta: "F" },
    ],
    criterios: [
      "3.1.F1", "3.1.F2", "3.1.F4", "3.1.F6", "3.1.F7",
      "3.2.F5",
      "3.3.F1", "3.3.F4", "3.3.F5",
      "3.4.F5", "3.4.F2",
      "3.5.F1",
      "3.6.F1", "3.6.F3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando tu equipo (aunque sean dos personas) atiende solicitudes, soporte o reclamos por correo, teléfono o WhatsApp, sin un registro común de los casos.",
  },
  // ─── Llegar a HubSpot o rescatarlo ──────────────────────────────────────────────────────────────────────────
  {
    id: "migra-a-hubspot",
    titulo: "Migrar a HubSpot con la historia de tus clientes",
    promesa: "Cambias de CRM sin dejar de vender ni de atender, y llegas a HubSpot con la historia de cada cliente.",
    descripcion:
      "Tu información pasa del CRM actual a HubSpot con su historia: contactos, negocios, casos y conversaciones, cada uno con su responsable y su fecha original. El equipo sigue vendiendo y atendiendo mientras se hace el cambio.",
    tipo: "aterrizar",
    capa: "casa",
    areas: ["1", "2", "3"],
    sintomas: [
      "Nuestro CRM actual ya no da más.",
      "Tenemos miedo de perder el historial si cambiamos.",
      "El contrato de nuestro CRM vence y no queremos renovarlo.",
    ],
    obtienes: [
      "El equipo sigue vendiendo y atendiendo mientras se hace el cambio.",
      "Cada cliente llega con su historia: negocios, casos y conversaciones.",
      "Cada contacto llega con su responsable, su etapa y el origen que tenía en el sistema anterior.",
      "Los reportes del primer día ya salen del sistema nuevo.",
    ],
    mueve: [
      { dimension: "1.3", desde: "I", hasta: "F" },
      { dimension: "2.3", desde: "I", hasta: "F" },
      { dimension: "3.3", desde: "I", hasta: "F" },
    ],
    criterios: [
      "1.3.F1", "1.3.F2", "1.3.F3",
      "2.3.F1", "2.3.F3",
      "3.3.F1", "3.3.F2",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Migraciones de datos"],
    cuandoConviene:
      "Cuando dejas otro CRM (Salesforce, Zoho, Pipedrive, Dynamics o uno propio) o juntas en uno dos HubSpot de tu misma empresa, y no quieres perder la historia de tus clientes ni dejar de vender el día del cambio.",
  },
  {
    id: "reactiva-hubspot",
    titulo: "Reactivar el uso del HubSpot que ya pagas",
    promesa: "El HubSpot que ya pagas vuelve a ser la herramienta de trabajo del equipo, no una carga administrativa.",
    descripcion:
      "El HubSpot que pagas vuelve a usarse: se revisa qué se usa y qué no, se quita lo que estorba y el equipo vuelve a trabajar ahí cada día. Recuperas el valor de las licencias antes de pensar en comprar más.",
    tipo: "reactivar",
    capa: "casa",
    areas: ["1", "2", "3"],
    sintomas: [
      "Tenemos HubSpot, pero el equipo trabaja en Excel.",
      "Pagamos módulos que nadie usa.",
      "Cada quien usa HubSpot a su manera.",
      "El CRM se llena después, cuando alguien se acuerda.",
      "Nuestro partner anterior se fue y no sabemos qué hay ni quién lo hizo.",
    ],
    obtienes: [
      "El equipo abre el CRM para saber qué le toca hacer, no para cargar lo que ya hizo.",
      "Ninguna licencia que pagas lleva más de un mes sin usarse.",
      "Los reportes vuelven a mostrar lo que pasa, porque el equipo registra su trabajo en el CRM.",
      "Sacas provecho de lo que ya invertiste antes de invertir más.",
    ],
    mueve: [
      { dimension: "1.1", desde: "I", hasta: "F" },
      { dimension: "1.2", desde: "I", hasta: "F" },
      { dimension: "2.1", desde: "I", hasta: "F" },
      { dimension: "2.2", desde: "I", hasta: "F" },
      { dimension: "3.1", desde: "I", hasta: "F" },
      { dimension: "3.2", desde: "I", hasta: "F" },
    ],
    criterios: [
      "1.1.F6",
      "1.2.F9",
      "2.1.F6",
      "2.2.F2",
      "3.1.F6",
      "3.2.F9",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Rescate de CRM"],
    cuandoConviene:
      "Cuando ya pagas HubSpot y tu equipo no lo usa o lo usa a medias, o cuando vienes de otro partner y no sabes qué hay ni quién lo hizo.",
  },
  {
    id: "limpieza-datos",
    titulo: "Depurar los duplicados de tu base de clientes",
    promesa:
      "Cada cliente está una sola vez, con sus datos escritos igual, y tu base tiene reglas para no volver a ensuciarse.",
    descripcion:
      "Tu base queda sin duplicados, con los datos clave escritos igual y sin las propiedades que nadie usa. Quedan reglas para que no vuelva a pasar: datos obligatorios al entrar, una forma consensuada de unir duplicados y una revisión de la calidad cada mes.",
    tipo: "reactivar",
    capa: "casa",
    areas: ["1", "2", "3"],
    sintomas: [
      "Los reportes no cuadran porque hay contactos duplicados.",
      "A muchos contactos les falta el país o el cargo, y no podemos segmentar.",
      "Pagamos contactos de marketing que ya no sirven.",
      "Tenemos cientos de propiedades y nadie sabe cuáles se usan.",
    ],
    obtienes: [
      "Cada cliente está una sola vez, y los reportes vuelven a cuadrar.",
      "Puedes segmentar por país, industria o cargo, porque esos datos están escritos igual y lo nuevo entra completo.",
      "Dejas de pagar contactos de marketing que no sirven.",
      "La base no se vuelve a ensuciar: lo clave se pide al entrar y alguien revisa la calidad cada mes.",
    ],
    mueve: [
      { dimension: "1.3", desde: "I", hasta: "F" },
      { dimension: "2.3", desde: "I", hasta: "F" },
      { dimension: "3.3", desde: "I", hasta: "F" },
    ],
    criterios: [
      "1.3.F2",
      "2.3.F2", "2.3.F3",
      "3.3.F8",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Rescate de CRM"],
    cuandoConviene:
      "Cuando ya tienes HubSpot y no confías en tus datos (duplicados, datos escritos de mil formas, propiedades de más) o acabas de migrar, y quieres reglas para que no se vuelvan a ensuciar. También antes de encender agentes de IA sobre una base sucia.",
  },
  {
    id: "objetos-personalizados",
    titulo: "Modelar tus contratos o programas en HubSpot",
    promesa:
      "HubSpot habla el idioma de tu negocio: tus unidades, contratos o programas viven en el CRM, con su estado, junto a cada cliente.",
    descripcion:
      "Lo que tu negocio tiene de único, como unidades, contratos, pólizas o programas, tiene su propio registro en HubSpot (un objeto personalizado), con su estado y junto a cada cliente. Ventas sabe qué está disponible y Servicio sabe qué tiene contratado cada uno.",
    tipo: "expandir",
    capa: "casa",
    areas: ["1", "3"],
    sintomas: [
      "HubSpot no tiene dónde guardar lo que vendemos.",
      "Llevamos el inventario de unidades en una hoja aparte.",
      "Forzamos todo a negocios y contactos, y se vuelve un desorden.",
      "Ofrecemos unidades que ya se vendieron.",
    ],
    obtienes: [
      "Lo que tu negocio tiene de único vive en el CRM, con su estado.",
      "Quien vende ve qué está disponible antes de ofrecerlo.",
      "Servicio ve en la ficha lo que cada cliente tiene contratado.",
    ],
    mueve: [
      { dimension: "1.2", desde: "I", hasta: "F" },
      { dimension: "3.3", desde: "I", hasta: "E" },
    ],
    criterios: [
      "1.2.F8",
      "3.3.F2", "3.3.E7",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando vendes o atiendes algo que no es un contacto, una empresa ni un negocio (unidades de un proyecto, pólizas, contratos, programas, equipos instalados, becas o matrículas) y quieres llevarlo en HubSpot, con su estado y junto a cada cliente.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-servicio"],
  },
  {
    id: "marcas-y-paises",
    titulo: "Unificar tus marcas o países en un solo HubSpot",
    promesa:
      "Cada marca o país trabaja en el mismo HubSpot con su equipo, su moneda y sus correos, y la dirección del grupo ve a todas con los mismos números.",
    descripcion:
      "Tus marcas, países o unidades de negocio comparten un HubSpot y cada una tiene su equipo, sus permisos, su moneda, sus correos y el permiso de datos que pide la ley de su país. Sus leads y sus casos llegan a su equipo, y la dirección del grupo las ve juntas con los mismos números.",
    tipo: "expandir",
    capa: "casa",
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada marca del grupo lleva sus clientes a su manera.",
      "Para ver el grupo junto, alguien suma a mano los números de cada país.",
      "Los vendedores de una marca ven los clientes de la otra.",
      "Cada empresa del grupo tiene su propio HubSpot y no se hablan.",
    ],
    obtienes: [
      "Cada marca trabaja con su equipo, su moneda y sus correos, sin pisarse con las otras.",
      "Cada lead y cada caso le llega al equipo de su marca sin que nadie lo reparta.",
      "La dirección ve el grupo junto, con números que significan lo mismo en cada marca.",
      "Una marca o un país nuevo entra al HubSpot que ya funciona, sin empezar de cero.",
    ],
    mueve: [
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "3.2", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.2.E6",
      "3.2.E7",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "RevOps y alineación"],
    cuandoConviene:
      "Cuando tu grupo o tu institución suma a tu HubSpot dos marcas, países, unidades de negocio o dependencias o más, o una que llega con su propio equipo, su dominio, la ley de otro país o su propio HubSpot. También cuando quieres ordenar las que ya conviven mezcladas o que la dirección vea todo el grupo junto.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-marketing", "sistematiza-servicio"],
  },
  // ─── Ventas: casos para crecer ──────────────────────────────────────────────────────────────────────────────
  {
    id: "cotizaciones",
    titulo: "Estandarizar las cotizaciones desde HubSpot",
    promesa: "Cada cotización sale del sistema con la misma estructura, los precios vigentes y el alcance validado.",
    descripcion:
      "Cada cotización sale de HubSpot con tu plantilla, tu catálogo con los precios al día y, si se sale de lo normal, el visto bueno de quien corresponde. Dejas de mandar propuestas distintas a clientes parecidos y ves qué se cotizó en cada negocio.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["1"],
    sintomas: [
      "Cada vendedor arma la cotización a su manera.",
      "Se van cotizaciones con precios viejos o descuentos que nadie aprobó.",
      "Prometemos cosas que después no podemos entregar.",
      "No sé cuánto hay cotizado este mes.",
    ],
    obtienes: [
      "Dos clientes parecidos reciben una propuesta igual de sólida, sin importar qué vendedor les toque.",
      "Ninguna cotización sale con un precio viejo o un descuento sin aprobar.",
      "Solo prometes lo que el equipo puede entregar.",
      "Ves en cada negocio qué se cotizó, cuándo y por cuánto.",
    ],
    mueve: [
      { dimension: "1.5", desde: "I", hasta: "E" },
      { dimension: "1.2", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.5.F4", "1.5.E3",
      "1.2.E1",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando la venta la cierra una persona de tu equipo y cotizas seguido productos o servicios que se repiten.",
    requiere: ["sistematiza-ventas"],
  },
  {
    id: "cobros-en-linea",
    titulo: "Cobrar en línea al aceptar la cotización",
    promesa:
      "Tu cliente paga en línea al aceptar la cotización o con un link de pago, y ves en HubSpot qué se cobró sin pedir comprobantes.",
    descripcion:
      "Tu cliente paga en línea al aceptar la cotización o con un link de pago, y el pago queda en su ficha y mueve el negocio solo. Tu equipo deja de pedir comprobantes de transferencia y ves cada día cuánto entró.",
    tipo: "complementario",
    capa: "proceso",
    areas: ["1"],
    sintomas: [
      "El cliente acepta, pero el pago tarda días porque hay que mandarle los datos de la cuenta.",
      "Perseguimos comprobantes de transferencia por WhatsApp.",
      "No sabemos qué negocios ganados ya pagaron.",
      "Cobrar cada mes a los mismos clientes se hace a mano.",
    ],
    obtienes: [
      "Tu cliente paga en el momento en que acepta, sin esperar a que le mandes los datos de la cuenta.",
      "Cuando un cliente paga, el negocio avanza solo y tu equipo se entera.",
      "Ves en la ficha y en un reporte qué se cobró, cuándo y por qué producto.",
    ],
    mueve: [],
    criterios: [],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "Integraciones y automatización"],
    cuandoConviene:
      "Cuando cobras en el momento (anticipos, inscripciones, servicios de precio fijo o que se cobran cada mes) y el procesador de pagos de HubSpot o Stripe opera en tu país.",
    requiere: ["cotizaciones"],
  },
  {
    id: "playbooks-secuencias",
    titulo: "Automatizar la cadencia de seguimiento a prospectos",
    promesa:
      "Cada vendedor califica con las mismas preguntas, sigue la misma cadencia de contacto y llama desde HubSpot, y todo queda en la ficha del cliente.",
    descripcion:
      "Cada vendedor tiene en la ficha el guion para descubrir y calificar, y una secuencia de correos, llamadas y tareas que sigue sola hasta que el prospecto responde. Las llamadas salen de HubSpot y quedan en la ficha con su resultado.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["1"],
    sintomas: [
      "Cada vendedor pregunta cosas distintas en la primera llamada.",
      "Los prospectos se enfrían porque nadie les dio seguimiento.",
      "Las llamadas no quedan registradas en ningún lado.",
      "No sabemos cuántos intentos hace cada vendedor.",
    ],
    obtienes: [
      "Dos vendedores califican al mismo prospecto con las mismas preguntas.",
      "Ningún prospecto se enfría por olvido: el seguimiento sigue solo hasta que responde.",
      "Cada llamada queda en la ficha con su resultado y su grabación.",
      "Ves cuántos intentos hace cada vendedor y qué cadencia trae más respuestas.",
    ],
    mueve: [
      { dimension: "1.1", desde: "F", hasta: "E" },
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "1.7", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.1.E2", "1.1.E5",
      "1.2.E2",
      "1.7.E1",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando varios de tus vendedores prospectan o dan seguimiento por correo y por teléfono, cada uno a su manera.",
    requiere: ["sistematiza-ventas"],
  },
  {
    id: "prospeccion-ia",
    titulo: "Priorizar la prospección de cada vendedor con IA",
    promesa:
      "Cada vendedor sabe cada mañana a quién contactar primero, y la IA le prepara el primer mensaje para que él lo revise y lo envíe.",
    descripcion:
      "Un agente de IA de HubSpot investiga las cuentas que encajan con tu cliente ideal, detecta cuáles muestran interés y le prepara al vendedor un primer mensaje para cada una. El vendedor decide qué sale, y tú ves cuántas reuniones trae y cuántos créditos gasta.",
    tipo: "expandir",
    capa: "ia",
    seApoyaEn: ["playbooks-secuencias"],
    alimenta: ["sistematiza-ventas"],
    areas: ["1"],
    sintomas: [
      "Los vendedores pierden tiempo con prospectos que nunca iban a comprar.",
      "Prospectamos a todos igual.",
      "No tenemos tiempo de investigar a cada prospecto antes de escribirle.",
    ],
    obtienes: [
      "Cada vendedor sabe cada mañana a quién contactar primero.",
      "La IA investiga cada cuenta y propone el primer mensaje; el vendedor decide si sale.",
      "Tus cuentas objetivo están en una lista, cada una con su vendedor y un mensaje pensado para su segmento.",
      "Sabes cuántas reuniones te trae la IA y cuántos créditos gasta.",
    ],
    mueve: [
      { dimension: "1.6", desde: "F", hasta: "E" },
      { dimension: "1.2", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.6.E6", "1.6.E3", "1.6.E5",
      "1.2.E5",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "SmartLoop"],
    cuandoConviene:
      "Cuando le vendes a empresas, la venta la cierra una persona de tu equipo y tienes vendedores que buscan clientes nuevos.",
    requiere: ["sistematiza-ventas"],
  },
  {
    id: "pronostico",
    titulo: "Pronosticar las ventas desde el pipeline",
    promesa: "Comprometes un número de ventas sabiendo que el pronóstico se acerca a lo que de verdad pasa.",
    descripcion:
      "El pronóstico sale de tus negocios al día, por categorías que consensúa tu equipo, y no de lo que cada vendedor calcula a ojo. Ves en qué etapa se caen y cuándo uno se traba, y comprometes un número que se acerca a lo que de verdad pasa.",
    tipo: "expandir",
    capa: "proceso",
    seApoyaEn: ["limpieza-datos"],
    areas: ["1"],
    sintomas: [
      "El pronóstico es lo que cada vendedor cree que va a cerrar.",
      "Nos enteramos en la última semana del mes de que no llegamos.",
      "No sé en qué etapa se caen los negocios.",
    ],
    obtienes: [
      "En la mayoría de los meses, lo vendido queda dentro de ±10% del pronóstico.",
      "Ves en qué etapa se le caen los negocios a cada vendedor.",
      "Te enteras cuando un negocio se traba, sin esperar a la reunión.",
      "Ves cada semana qué tan cerca va el pronóstico de lo vendido.",
    ],
    mueve: [
      { dimension: "1.3", desde: "F", hasta: "E" },
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "1.7", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.3.E1",
      "1.2.E4",
      "1.7.E4",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando tus negocios llevan unos meses en HubSpot con montos y fechas de cierre al día, y tu dirección te pide un número cada mes.",
    requiere: ["sistematiza-ventas"],
  },
  {
    id: "reuniones-con-ia",
    titulo: "Registrar cada reunión con su resumen automático",
    promesa:
      "Cada reunión de tu equipo con un cliente deja en su ficha de HubSpot el resumen y los próximos pasos, sin que nadie los escriba.",
    descripcion:
      "Las reuniones de tu equipo con clientes se graban con aviso a quien participa, y HubSpot deja en la ficha de cada cliente sus notas, su resumen y los próximos pasos. Tu equipo deja de escribir minutas y cualquiera sabe qué se habló con un cliente antes de volver a contactarlo.",
    tipo: "expandir",
    capa: "ia",
    alimenta: ["sistematiza-ventas", "sistematiza-servicio"],
    areas: ["1", "3"],
    sintomas: [
      "Lo que se habla en las reuniones con clientes no queda en ningún lado.",
      "Cada vendedor toma notas a su manera, o no las toma.",
      "Para saber qué se habló con un cliente hay que preguntarle a quien estuvo en la reunión.",
      "Escribir la minuta de cada reunión le quita tiempo al equipo.",
      "Tenemos HubSpot, pero las reuniones quedan fuera del CRM.",
    ],
    obtienes: [
      "Cada reunión con un cliente deja en su ficha el resumen y los próximos pasos, sin que nadie los escriba.",
      "Cualquiera de tu equipo sabe qué se habló con un cliente antes de volver a contactarlo, aunque no haya estado en la reunión.",
      "Tu equipo dedica a sus clientes el tiempo que se le iba en escribir minutas.",
      "Toda tu empresa graba con las mismas reglas, y quien participa en una reunión sabe que se graba.",
    ],
    mueve: [
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "3.2", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.2.E5",
      "3.2.E4",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando tu equipo de ventas o de servicio ya trabaja en HubSpot, tiene reuniones con clientes cada semana y lo que se habla en ellas no queda en la ficha.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-servicio"],
  },
  // ─── Marketing: casos para crecer ───────────────────────────────────────────────────────────────────────────
  {
    id: "alinea-marketing-ventas",
    titulo: "Entregar a Ventas los leads calificados a tiempo",
    promesa:
      "Marketing y Ventas usan la misma definición de lead calificado, y cada lead listo le llega al vendedor que corresponde, con su historia.",
    descripcion:
      "Marketing y Ventas consensúan por escrito qué es un lead calificado y quién se hace cargo de cada uno. Los leads listos le llegan al vendedor que corresponde con su historia, y Marketing ve qué pasó con lo que entregó.",
    tipo: "expandir",
    capa: "proceso",
    alimenta: ["sistematiza-ventas"],
    areas: ["1", "2"],
    sintomas: [
      "Ventas dice que los leads de Marketing no sirven.",
      "Los leads pasan días sin que nadie los llame.",
      "Marketing no sabe qué pasó con los leads que entregó.",
    ],
    obtienes: [
      "Ventas recibe primero los leads con más probabilidad de comprar.",
      "Cada lead listo llega al vendedor que corresponde, con su historial, sin que nadie lo pase a mano.",
      "Se acaba la discusión de quién se hace cargo de un lead: hay reglas escritas que se cumplen.",
      "Marketing ve qué pasó con cada lead que entregó y por qué se descartó.",
    ],
    mueve: [
      { dimension: "1.6", desde: "I", hasta: "E" },
      { dimension: "2.6", desde: "I", hasta: "E" },
      { dimension: "2.2", desde: "F", hasta: "E" },
      { dimension: "1.4", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.6.F2", "1.6.E4",
      "2.6.F4", "2.6.E3",
      "2.2.E3",
      "1.4.E3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["RevOps y alineación", "Implementación de CRM"],
    cuandoConviene: "Cuando Marketing le pasa leads a uno o más vendedores y los dos equipos ya trabajan en HubSpot.",
    requiere: ["sistematiza-marketing", "sistematiza-ventas"],
  },
  {
    id: "atribucion",
    titulo: "Medir cuánto cuesta cada venta por canal",
    promesa: "Sabes qué canal te trae ventas y cuánto te cuesta cada una, y mueves el presupuesto hacia donde rinde.",
    descripcion:
      "Cada lead y cada venta quedan con el canal y la campaña que los trajeron, también lo que llega por WhatsApp, referidos o eventos. Ves cuánto te cuesta un lead y una venta por canal y mueves el presupuesto hacia lo que rinde.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["2"],
    sintomas: [
      "Sé qué canal me trae clics, pero no cuál me trae ventas.",
      "Invertimos en pauta por costumbre.",
      "Cuando la dirección pregunta por el retorno, armamos una hoja a mano.",
      "Las ventas que llegan por WhatsApp, referidos o eventos no tienen origen.",
    ],
    obtienes: [
      "Ves cuánto te costó cada lead y cada venta el último mes, por canal.",
      "Sabes cuánto ingreso deja cada canal, también lo que llega por WhatsApp, referidos o eventos.",
      "Cada mes mueves el presupuesto hacia el canal que mejor rinde.",
    ],
    mueve: [
      { dimension: "2.7", desde: "F", hasta: "E" },
      { dimension: "2.3", desde: "F", hasta: "E" },
    ],
    criterios: [
      "2.3.E2", "2.3.E5",
      "2.7.E3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["RevOps y alineación"],
    cuandoConviene:
      "Cuando inviertes en varios canales pagados y tus ventas quedan en HubSpot: como negocios del equipo comercial o traídas desde tu tienda en línea o tu ERP.",
    requiere: ["sistematiza-marketing"],
  },
  {
    id: "marketing-ia-breeze",
    titulo: "Producir campañas con IA en la voz de tu marca",
    promesa:
      "Tu equipo produce más campañas y contenido con una IA que escribe con tu voz de marca y conoce a tus buyer personas.",
    descripcion:
      "La IA de HubSpot trabaja con tu voz de marca y tus buyer personas: prepara cada campaña, adapta los textos y llena el calendario, y una persona aprueba todo antes de publicarlo. Cada mes planificas con nosotros la campaña del mes, y cada trimestre se pone al día lo que la IA sabe de tu negocio.",
    tipo: "expandir",
    capa: "ia",
    seApoyaEn: ["sistematiza-marketing"],
    areas: ["2"],
    sintomas: [
      "Cada uno usa ChatGPT a su manera y todo suena distinto.",
      "El equipo no da abasto con el contenido.",
      "La IA escribe cosas genéricas que no suenan a nosotros.",
    ],
    obtienes: [
      "La IA redacta con tu voz de marca y para tus buyer personas, no a ciegas.",
      "El equipo dedica su tiempo a la estrategia mientras la IA prepara cada campaña, adapta los textos a cada canal y llena el calendario.",
      "Está escrito qué puede decidir la IA sola, y todo lo que prepara pasa por una persona antes de publicarse.",
      "Sabes cuántos créditos gasta la IA y qué produce con ellos.",
    ],
    mueve: [
      { dimension: "2.2", desde: "I", hasta: "O" },
      { dimension: "2.5", desde: "F", hasta: "O" },
      { dimension: "2.4", desde: "F", hasta: "O" },
    ],
    criterios: [
      "2.2.E6", "2.2.O4",
      "2.5.O2",
      "2.4.O1", "2.4.O6",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["SmartLoop", "Implementación de CRM"],
    cuandoConviene:
      "Cuando tu equipo de marketing ya trabaja en HubSpot, tiene su voz de marca y sus buyer personas, y produce contenido o campañas cada mes.",
    requiere: ["sistematiza-marketing"],
  },
  {
    id: "nutricion-agente",
    titulo: "Nutrir a los leads que todavía no compran",
    promesa:
      "Cada lead que todavía no está listo recibe mensajes escritos para él, con tu voz de marca, y le llega a Ventas cuando muestra interés de compra.",
    descripcion:
      "Los leads que todavía no compran entran a un recorrido de correos que un agente de IA adapta a cada persona según quién es y qué hizo. Cuando muestran interés, le llegan al vendedor con su historia.",
    tipo: "expandir",
    capa: "ia",
    alimenta: ["alinea-marketing-ventas"],
    areas: ["2"],
    sintomas: [
      "Los leads que no compran en el primer contacto se abandonan.",
      "Mandamos el mismo correo a todos.",
      "No damos abasto para darle seguimiento a cada lead.",
    ],
    obtienes: [
      "Ningún lead se queda sin seguimiento por no estar listo todavía.",
      "Cada correo le habla a esa persona de lo que le interesa, con tu voz de marca.",
      "Ventas recibe el lead cuando muestra señales de compra.",
      "Sabes cuántos créditos gasta el agente y qué logra con ellos.",
    ],
    mueve: [
      { dimension: "2.2", desde: "F", hasta: "E" },
      { dimension: "2.6", desde: "F", hasta: "O" },
    ],
    criterios: [
      "2.2.E1",
      "2.6.E2", "2.6.O3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "SmartLoop"],
    cuandoConviene:
      "Cuando entran más leads de los que Ventas puede atender y la compra toma semanas o meses, así que muchos todavía no están listos.",
    requiere: ["sistematiza-marketing"],
  },
  {
    id: "abm",
    titulo: "Trabajar tus cuentas clave entre Marketing y Ventas",
    promesa:
      "Marketing y Ventas trabajan juntos las mismas empresas grandes: saben quién decide en cada una y ven qué cuentas se están moviendo.",
    descripcion:
      "Ventas y Marketing eligen juntos las cuentas que valen el esfuerzo y las trabajan con un mismo plan, con el comité de compra de cada una a la vista. HubSpot avisa cuando una cuenta clave se mueve y muestra cuánto pipeline dejan.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["1", "2"],
    sintomas: [
      "Ventas persigue cuentas grandes y Marketing hace campañas para todos.",
      "En las empresas grandes solo conocemos a una persona.",
      "No sabemos cuáles de nuestras cuentas objetivo se están moviendo.",
      "Cada vendedor tiene su lista de cuentas en una hoja.",
    ],
    obtienes: [
      "Ventas y Marketing trabajan la misma lista de cuentas, con niveles consensuados.",
      "Ves quién decide en cada cuenta y a quién te falta conocer.",
      "Te enteras cuando una cuenta clave muestra interés.",
      "Sabes cuánto pipeline te dejan las cuentas clave y cuánto inviertes en ellas.",
    ],
    mueve: [
      { dimension: "1.6", desde: "F", hasta: "E" },
      { dimension: "2.7", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.6.E6",
      "2.7.E8",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["RevOps y alineación", "Implementación de CRM"],
    cuandoConviene:
      "Cuando le vendes a empresas grandes, con ciclos largos y varias personas que deciden, y tienes una lista corta de cuentas que valen el esfuerzo (decenas, no miles).",
    requiere: ["sistematiza-ventas", "sistematiza-marketing"],
  },
  // ─── Web y contenido ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "seo-aeo",
    titulo: "Posicionar tu marca en Google y los asistentes de IA",
    promesa:
      "Tu sitio y tu contenido quedan listos para que Google y la IA te encuentren cuando buscan lo que vendes, y sabes cuántas veces apareces frente a tu competencia.",
    descripcion:
      "Tu sitio cumple lo básico para Google y para los asistentes de IA (SEO y AEO), y tu contenido se organiza por temas alrededor de lo que vendes. Sabes cuántas veces apareces y frente a qué competidores.",
    tipo: "expandir",
    capa: "proceso",
    alimenta: ["sistematiza-marketing"],
    areas: ["2"],
    sintomas: [
      "No aparecemos en Google por lo que vendemos.",
      "Cuando alguien le pregunta a ChatGPT por lo que hacemos, no salimos.",
      "Publicamos contenido sin un plan.",
      "La competencia sale primero cuando buscan lo que vendemos.",
    ],
    obtienes: [
      "Google y los asistentes de IA leen bien tu sitio: cada página clave con su título y su descripción, y sin enlaces rotos.",
      "Tu contenido está organizado por temas y refuerza lo que vendes.",
      "Tu contenido está preparado para que los asistentes de IA lo citen, y ves en qué preguntas apareces tú y en cuáles tu competencia.",
      "Publicas contenido propio cada mes, con un plan.",
    ],
    mueve: [
      { dimension: "2.5", desde: "I", hasta: "E" },
    ],
    criterios: [
      "2.5.F4", "2.5.F5", "2.5.E2", "2.5.E3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Contenido y SEO", "SmartLoop"],
    cuandoConviene:
      "Cuando tus clientes investigan antes de comprar (buscan en Google o le preguntan a una IA) y alguien puede sostener una publicación al mes: tu equipo o un SmartLoop. Rinde poco si vendes solo por recomendación o por licitación.",
    requiereUnoDe: ["sistematiza-marketing", "presencia-web"],
  },
  {
    id: "presencia-web",
    titulo: "Lanzar un sitio en HubSpot que editas sin programador",
    promesa:
      "Tu sitio dice lo mismo que tu equipo, convierte visitas en contactos y lo administras sin depender de un programador.",
    descripcion:
      "Tu sitio vive en HubSpot, junto a tus campañas: cada formulario entra como contacto y recibe respuesta, y las páginas de campaña salen sin esperar a nadie. El sitio dice lo mismo que tu equipo y lo cambias sin un programador.",
    tipo: "expandir",
    capa: "proceso",
    alimenta: ["sistematiza-marketing"],
    areas: ["1", "2"],
    sintomas: [
      "Para cambiar un texto del sitio dependemos de un proveedor.",
      "El sitio se ve viejo y no cuenta lo que hoy vendemos.",
      "El sitio dice una cosa y los vendedores otra.",
    ],
    obtienes: [
      "Lo que una persona llena en el sitio entra solo como contacto y recibe respuesta.",
      "Tus páginas de campaña se crean en el mismo sistema que tus campañas.",
      "El sitio y tu equipo dicen lo mismo sobre lo que te distingue, porque parten de la misma propuesta de valor escrita.",
      "Tu equipo cambia el sitio sin esperar a un programador.",
    ],
    mueve: [
      { dimension: "2.2", desde: "I", hasta: "E" },
      { dimension: "2.5", desde: "I", hasta: "F" },
      { dimension: "1.5", desde: "F", hasta: "E" },
    ],
    criterios: [
      "2.2.F3", "2.2.F5", "2.2.E5",
      "2.5.F4",
      "1.5.E2",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Desarrollo de sitio web"],
    cuandoConviene:
      "Cuando tu sitio es por donde llegan tus clientes nuevos y dependes de un proveedor para cambiarlo, o ya no cuenta lo que hoy vendes. También sirve para empezar con nosotros: muchos clientes empiezan por su sitio.",
  },
  // ─── Servicio y conversaciones ──────────────────────────────────────────────────────────────────────────────
  {
    id: "whatsapp",
    titulo: "Registrar las conversaciones de WhatsApp en HubSpot",
    promesa:
      "Lo que tu equipo habla por WhatsApp queda en la ficha del cliente, en una sola bandeja, y nadie se queda sin respuesta.",
    descripcion:
      "WhatsApp, el chat y el correo llegan a una sola bandeja en HubSpot, donde un agente de IA atiende a quien escribe por primera vez. Ves cuánto tarda la primera respuesta, y cada conversación queda en la ficha del cliente aunque alguien se vaya, porque se atiende desde el número de la empresa.",
    tipo: "expandir",
    capa: "proceso",
    alimenta: ["sistematiza-ventas", "sistematiza-servicio"],
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada vendedor atiende WhatsApp desde su teléfono.",
      "Si alguien se va, se lleva sus conversaciones.",
      "No sabemos cuántos mensajes quedan sin responder.",
      "Queremos un bot o un agente que conteste WhatsApp.",
      "Nos escriben por WhatsApp, Instagram y correo, y no sabemos quién ya respondió.",
      "Queremos que el agente agende reuniones o tome pedidos.",
    ],
    obtienes: [
      "Lo que cada persona habla por WhatsApp queda en la empresa, aunque responda desde el celular (con la app de HubSpot) o se vaya.",
      "WhatsApp, el chat del sitio y tus otros canales escritos llegan a una sola bandeja.",
      "Ves en tiempo real cuánto tarda la primera respuesta y cuántas conversaciones esperan.",
      "Quien te escribe por primera vez recibe respuesta al momento, aunque sea fuera de horario.",
    ],
    mueve: [
      { dimension: "1.2", desde: "I", hasta: "E" },
      { dimension: "2.2", desde: "I", hasta: "E" },
      { dimension: "3.2", desde: "I", hasta: "E" },
    ],
    criterios: [
      "1.2.F4", "1.2.E7",
      "2.2.F4", "2.2.E4", "2.2.E7",
      "3.2.F4", "3.2.E3", "3.2.E5",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando tu equipo atiende o vende por WhatsApp, o cuando quieres juntar tus canales escritos en una sola bandeja, con reglas de quién responde y en qué horario.",
  },
  {
    id: "agentes-ia-atencion",
    titulo: "Atender las consultas frecuentes con un agente de IA",
    promesa:
      "Un agente de IA resuelve las consultas de siempre en tus canales y le pasa a una persona, con todo el contexto, lo que no puede resolver.",
    descripcion:
      "Un agente de IA atiende las consultas de siempre en tus canales, con el tono de tu marca y las respuestas de tu empresa. Lo que no puede resolver le llega a una persona con todo el contexto, y tu cartera crece sin crecer el equipo al mismo ritmo.",
    tipo: "expandir",
    capa: "ia",
    seApoyaEn: ["base-conocimiento-portal", "whatsapp"],
    alimenta: ["sistematiza-servicio"],
    areas: ["3"],
    sintomas: [
      "Atendemos las mismas preguntas todos los días.",
      "Para atender más clientes tenemos que contratar más gente.",
      "Fuera del horario nadie responde.",
      "Queremos un chatbot o un agente de IA para la atención al cliente.",
    ],
    obtienes: [
      "Buena parte de los casos se resuelve sin que intervenga una persona.",
      "La cartera crece sin que el equipo crezca en la misma proporción.",
      "Lo que la IA no puede resolver llega a una persona con el contexto completo.",
      "La IA responde con el tono de tu marca, y el equipo revisa una muestra de sus respuestas.",
    ],
    mueve: [
      { dimension: "3.8", desde: "I", hasta: "O" },
      { dimension: "3.2", desde: "F", hasta: "O" },
      { dimension: "3.4", desde: "F", hasta: "O" },
      { dimension: "3.5", desde: "F", hasta: "O" },
    ],
    criterios: [
      "3.8.E4", "3.8.O2",
      "3.2.O1",
      "3.4.O1",
      "3.5.O1",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "SmartLoop"],
    cuandoConviene:
      "Cuando tu servicio ya funciona en HubSpot y tu equipo responde las mismas preguntas todos los días, o nadie atiende fuera de horario.",
    requiere: ["sistematiza-servicio"],
  },
  {
    id: "base-conocimiento-portal",
    titulo: "Publicar un centro de respuestas para tus clientes",
    promesa:
      "Tus clientes encuentran solos las respuestas de siempre y ven en qué va su caso, y tu equipo deja de escribir lo mismo cada día.",
    descripcion:
      "Las preguntas de siempre tienen su artículo publicado, ordenado por temas y fácil de buscar, y tu equipo responde con el enlace en vez de escribir de nuevo. Tus clientes entran a un portal donde ven sus casos y su estado, y esa misma base es la que usa un agente de IA para responder.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["3"],
    sintomas: [
      "Respondemos las mismas preguntas todos los días.",
      "Los clientes nos escriben solo para preguntar en qué va su caso.",
      "Queremos un agente de IA, pero no tenemos nada escrito para que aprenda.",
      "Nuestros distribuidores nos escriben para saber de sus pedidos y sus facturas.",
    ],
    obtienes: [
      "Tus clientes encuentran solos la respuesta a lo que más preguntan.",
      "Tu equipo remite a un artículo en vez de escribir lo mismo.",
      "Tus clientes ven en qué va su caso en un portal, sin escribirte.",
      "Tu base de conocimiento queda lista para que un agente de IA responda con ella.",
    ],
    mueve: [
      { dimension: "3.8", desde: "D", hasta: "E" },
      { dimension: "3.2", desde: "F", hasta: "E" },
    ],
    criterios: [
      "3.8.F1", "3.8.F2", "3.8.E1",
      "3.2.E2",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene:
      "Cuando tus clientes te preguntan lo mismo una y otra vez o te escriben solo para saber en qué va su caso, o antes de poner un agente de IA a responder. También cuando vendes por distribuidores o socios que te escriben para saber de sus pedidos, sus facturas o sus casos.",
    requiere: ["sistematiza-servicio"],
  },
  {
    id: "customer-success",
    titulo: "Detectar a tiempo los clientes en riesgo de irse",
    promesa:
      "Sabes qué cliente está sano, cuál se puede ir y cuál está listo para comprarte más, antes de que te lo diga.",
    descripcion:
      "Cada cliente tiene un indicador de salud que junta sus casos, su satisfacción y, cuando se mide, su uso. Los que están en riesgo reciben una acción a tiempo, los que tienen potencial una propuesta, y tus clientes clave revisan contigo qué lograron.",
    tipo: "expandir",
    capa: "proceso",
    seApoyaEn: ["base-conocimiento-portal"],
    areas: ["3", "1"],
    sintomas: [
      "Los clientes se van sin aviso.",
      "Solo hablamos con el cliente cuando hay un problema.",
      "No sabemos a qué clientes venderles más.",
      "No sabemos si nuestros clientes están contentos: no medimos el NPS ni hacemos encuestas.",
      "Queremos hacer Customer Success, pero no sabemos a qué cliente atender primero.",
    ],
    obtienes: [
      "Cada cliente tiene un indicador de salud que combina sus casos, su satisfacción y, cuando se mide, su uso.",
      "Los clientes en riesgo reciben una acción de retención antes de decidir irse.",
      "Los que tienen potencial reciben una propuesta de expansión, y el vendedor ve el riesgo y el potencial en el CRM.",
      "Tus clientes clave revisan contigo cada trimestre qué lograron y qué sigue.",
    ],
    mueve: [
      { dimension: "3.3", desde: "F", hasta: "E" },
      { dimension: "3.6", desde: "F", hasta: "E" },
      { dimension: "3.7", desde: "F", hasta: "E" },
      { dimension: "3.4", desde: "F", hasta: "E" },
      { dimension: "1.7", desde: "F", hasta: "E" },
    ],
    criterios: [
      "3.3.E5", "3.3.E2",
      "3.6.E1", "3.6.E5",
      "3.7.E1", "3.7.E7", "3.7.E3",
      "3.4.E7",
      "1.7.E5",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "RevOps y alineación"],
    cuandoConviene:
      "Cuando tu relación con tus clientes es continua (contratos, suscripciones o servicios recurrentes) y quieres saber a tiempo quién se puede ir y quién te compraría más. También cuando quieres medir su satisfacción, aunque sea solo al cerrar cada caso.",
    requiere: ["sistematiza-servicio"],
  },
  // ─── Datos e integraciones ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "integracion-erp",
    titulo: "Integrar tu ERP con HubSpot",
    promesa:
      "Ventas y Servicio ven en la ficha de cada cliente lo que te compra y lo que tiene contratado, sin pedírselo a nadie.",
    descripcion:
      "Tu ERP, tu facturación, tu tienda en línea o tu sistema propio se conectan con HubSpot: pedidos, contratos e inventario aparecen en la ficha del cliente, y sus facturas si tu sistema permite traerlas. Quien vende sabe qué hay disponible antes de ofrecerlo y nadie carga dos veces el mismo dato.",
    tipo: "expandir",
    capa: "proceso",
    alimenta: ["customer-success", "tablero-direccion"],
    areas: ["1", "3"],
    sintomas: [
      "El vendedor llama a administración para saber si un cliente pagó.",
      "Ofrecemos productos que ya no hay en inventario.",
      "Cargamos dos veces el mismo pedido.",
      "Para saber todo de un cliente hay que abrir tres sistemas.",
      "Tenemos SAP y el vendedor no ve lo que el cliente compró.",
    ],
    obtienes: [
      "La ficha del cliente reúne lo comercial con lo que te compra y lo que tiene contratado.",
      "Quien vende ve qué está disponible antes de ofrecerlo.",
      "Ventas y Servicio ven la misma información del cliente.",
      "Nadie carga dos veces el mismo dato.",
    ],
    mueve: [
      { dimension: "1.2", desde: "I", hasta: "E" },
      { dimension: "1.3", desde: "F", hasta: "E" },
      { dimension: "3.3", desde: "I", hasta: "E" },
      { dimension: "3.2", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.2.F8", "1.2.E3",
      "1.3.E3",
      "3.3.F2", "3.3.E7",
      "3.2.E6",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    cuandoConviene:
      "Cuando tu operación vive en otro sistema (tu ERP, tu facturación, tu tienda en línea, tu herramienta de soporte o un sistema propio) y Ventas o Servicio necesitan verla en la ficha de cada cliente.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-servicio"],
  },
  {
    id: "cobranza",
    titulo: "Automatizar los avisos de cobro desde HubSpot",
    promesa:
      "Cobras a tiempo sin perseguir a nadie a mano, y Ventas y Servicio ven en la ficha quién debe antes de venderle o atenderlo.",
    descripcion:
      "Tus facturas abiertas viven en HubSpot y los avisos de cobro salen solos antes y después del vencimiento. Tu equipo trabaja la cartera vencida desde un solo lugar, y Ventas y Servicio ven quién debe antes de venderle o de atenderlo.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["1", "3"],
    sintomas: [
      "Nos enteramos de que un cliente debe cuando ya pasó un mes.",
      "Cobranza persigue a los clientes por correo y por WhatsApp, a mano.",
      "Ventas le vuelve a vender a un cliente que no ha pagado.",
      "No sabemos cuánto tenemos vencido ni desde cuándo.",
    ],
    obtienes: [
      "Cada cliente recibe el aviso de su cobro antes de que venza, sin que nadie lo mande a mano.",
      "Sabes cuánto tienes vencido, desde cuándo y cuánto recuperas cada mes.",
      "Ningún reclamo por un cobro se pierde entre áreas.",
    ],
    mueve: [
      { dimension: "3.7", desde: "F", hasta: "E" },
    ],
    criterios: [
      "3.7.E4", "3.7.E8",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización", "Implementación de CRM"],
    cuandoConviene: "Cuando vendes a crédito o con pagos recurrentes y tu equipo persigue a mano la cartera vencida.",
    requiereUnoDe: ["integracion-erp", "cobros-en-linea"],
  },
  {
    id: "data-lake",
    titulo: "Centralizar los datos de todos tus sistemas",
    promesa:
      "Los datos de todos tus sistemas se juntan en un solo lugar confiable, y lo que se calcula ahí vuelve a la ficha de HubSpot.",
    descripcion:
      "Lo que pasa en Ventas, Marketing, Servicio y tus otros sistemas se junta en un almacén de datos confiable. Lo que se calcula ahí, como el riesgo de un cliente o el potencial de una cuenta, vuelve a la ficha de HubSpot.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada área tiene su número y ninguno cuadra.",
      "Para un reporte de la dirección cruzamos cinco sistemas a mano.",
      "Queremos saber qué cliente se puede ir, pero el dato está repartido en varios sistemas.",
    ],
    obtienes: [
      "Ventas, Marketing y Servicio se apoyan en el mismo almacén de datos.",
      "Lo que se calcula afuera, como el potencial de una cuenta o el riesgo de un cliente, se ve en la ficha.",
      "El pronóstico y la atribución salen de la vista completa de la empresa, no de una sola herramienta.",
    ],
    mueve: [
      { dimension: "1.2", desde: "E", hasta: "O" },
      { dimension: "1.3", desde: "E", hasta: "O" },
      { dimension: "2.2", desde: "E", hasta: "O" },
      { dimension: "2.3", desde: "E", hasta: "O" },
      { dimension: "3.2", desde: "E", hasta: "O" },
      { dimension: "3.3", desde: "E", hasta: "O" },
    ],
    criterios: [
      "1.2.O3",
      "1.3.O4",
      "2.2.O3",
      "2.3.O1",
      "3.2.O4",
      "3.3.O2",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    cuandoConviene:
      "Cuando los datos que necesitas para decidir viven en varios sistemas, o quieres calcular algo con ellos y verlo en la ficha de HubSpot, como el riesgo de que un cliente se vaya o el potencial de una cuenta.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-marketing", "sistematiza-servicio"],
  },
  {
    id: "power-bi",
    titulo: "Conectar los datos de HubSpot con tu Power BI",
    promesa:
      "Los números de HubSpot llegan solos a tu Power BI, con el mismo significado que en el CRM, para que la dirección los mire junto al resto de la empresa.",
    descripcion:
      "Los datos de HubSpot llegan solos al BI de tu empresa, sin exportarlos a mano y con un diccionario de qué significa cada número. Tu equipo de BI los cruza con el resto de la empresa y la dirección los mira donde ya mira sus números.",
    tipo: "expandir",
    capa: "proceso",
    seApoyaEn: ["limpieza-datos"],
    areas: ["1", "2"],
    sintomas: [
      "La dirección no entra a HubSpot: quiere todo en Power BI.",
      "Cada semana exportamos de HubSpot a Excel para armar el reporte.",
    ],
    obtienes: [
      "Los datos de HubSpot llegan solos al BI de la empresa, sin exportarlos a mano.",
      "La dirección decide qué canal y qué cliente dejan más margen, con números de fondo.",
      "Los números de HubSpot dicen lo mismo en el BI que en el CRM.",
    ],
    mueve: [
      { dimension: "1.4", desde: "F", hasta: "E" },
      { dimension: "2.4", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.4.E6",
      "2.4.E8",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    cuandoConviene: "Cuando tu dirección ya mira la empresa en Power BI u otro BI y no va a entrar a HubSpot.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-marketing", "sistematiza-servicio"],
  },
  {
    id: "tablero-direccion",
    titulo: "Armar el tablero de gerencia con la meta por área",
    promesa:
      "La gerencia ve en un tablero cómo va cada área que trabaja en HubSpot contra su meta, con números que salen solos de HubSpot.",
    descripcion:
      "Las métricas de cada área se consensúan con sus líderes y quedan en un tablero de dirección en HubSpot, contra su meta. La gerencia lo revisa con una rutina fija y decide con números, sin pedir reportes a mano.",
    tipo: "expandir",
    capa: "proceso",
    seApoyaEn: ["limpieza-datos"],
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada área me trae sus números en una hoja distinta.",
      "Para la reunión de gerencia alguien arma el reporte a mano.",
      "No sé si vamos a llegar a la meta hasta fin de mes.",
    ],
    obtienes: [
      "Ves en un solo tablero cómo va cada área contra su meta.",
      "Cada número significa lo mismo para todos los líderes.",
      "La reunión de gerencia se hace con los números del sistema.",
      "Te enteras a tiempo cuando un área se desvía de su meta.",
    ],
    mueve: [
      { dimension: "1.4", desde: "F", hasta: "E" },
      { dimension: "2.4", desde: "F", hasta: "E" },
      { dimension: "3.4", desde: "F", hasta: "E" },
    ],
    criterios: [
      "1.4.E5",
      "2.4.E5",
      "3.4.E5",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["RevOps y alineación", "Implementación de CRM"],
    cuandoConviene:
      "Cuando tu empresa ya trabaja en HubSpot y tu gerencia quiere ver ahí cómo va cada área contra su meta.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-marketing", "sistematiza-servicio"],
  },
  // ─── La IA para tu equipo ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "asistente-ia-conectado",
    titulo: "Usar HubSpot desde ChatGPT o Claude",
    promesa:
      "Tu equipo consulta sus clientes y negocios y registra su trabajo en HubSpot desde el asistente de IA que ya usa, y cada uno ve y cambia solo lo que le toca.",
    descripcion:
      "HubSpot queda conectado al ChatGPT o al Claude de tu empresa, y cada persona entra con su propio usuario. Tu equipo pregunta en qué va un cliente o un negocio y deja sus notas, tareas y avances sin abrir el CRM, con reglas que aprueba tu TI o tu gerencia sobre qué puede ver y cambiar cada rol.",
    tipo: "complementario",
    capa: "ia",
    areas: ["1", "2", "3"],
    sintomas: [
      "Mi equipo usa ChatGPT para todo, menos para el CRM.",
      "Los vendedores no registran en HubSpot porque les quita tiempo.",
      "Alguien conectó la IA a HubSpot y no sabemos qué puede ver o cambiar.",
      "TI no nos deja conectar la IA al CRM porque no sabe qué datos se exponen.",
    ],
    obtienes: [
      "Preguntas en qué va un cliente o un negocio y el asistente te responde con lo que hay en HubSpot.",
      "Tu equipo deja sus notas, tareas y avances en HubSpot sin salir del asistente.",
      "Cada persona ve y cambia desde el asistente solo lo que sus permisos de HubSpot le dejan.",
      "Sabes qué datos de tus clientes llegan al asistente, y tu TI o tu gerencia lo aprobó antes de conectarlo.",
    ],
    mueve: [],
    criterios: [],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    cuandoConviene:
      "Cuando tu empresa ya paga cuentas de empresa de ChatGPT o Claude, tu equipo usa HubSpot y quiere consultarlo y registrar su trabajo desde ahí, o alguien ya lo conectó sin reglas. En gobierno, solo con el visto bueno escrito de tu TI.",
  },
  {
    id: "agentes-ia-internos",
    titulo: "Delegar las tareas repetitivas a un agente de IA",
    promesa:
      "Tu equipo deja de perder horas en lo que repite cada semana: un agente de IA lo hace en HubSpot, una persona revisa lo que importa y sabes cuánto te cuesta.",
    descripcion:
      "Un agente de IA hace en HubSpot la tarea que tu equipo repite cada semana (preparar el traspaso de un negocio ganado, revisar un negocio perdido) y deja su trabajo listo para revisar. Arranca con una parte del equipo y un tope de créditos, y cada mes ves lo que hizo, lo que ahorró y lo que gastó.",
    tipo: "expandir",
    capa: "ia",
    seApoyaEn: ["limpieza-datos"],
    areas: ["1", "3"],
    sintomas: [
      "Mi equipo pierde horas en tareas que se repiten cada semana.",
      "Cuando se gana un negocio, Servicio arranca sin saber qué se le prometió al cliente.",
      "Nadie revisa por qué se perdió cada negocio ni cuáles conviene retomar.",
      "Cada solicitud de garantía espera a que alguien la revise contra la política.",
      "Queremos usar agentes de IA, pero no sabemos para qué ni cuánto nos van a costar.",
    ],
    obtienes: [
      "Tu equipo recupera las horas que se le iban en tareas repetitivas.",
      "La tarea se hace igual cada vez, aunque nadie se acuerde de hacerla.",
      "Sabes qué hace la IA sola, qué revisa una persona y cuánto te cuesta cada mes.",
      "Tu equipo dedica su tiempo a lo que necesita criterio.",
    ],
    mueve: [
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "3.2", desde: "F", hasta: "E" },
      { dimension: "1.4", desde: "F", hasta: "O" },
    ],
    criterios: [
      "1.2.E5",
      "3.2.E4",
      "1.4.O3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "SmartLoop"],
    cuandoConviene:
      "Cuando tu equipo ya trabaja en HubSpot y repite cada semana una tarea interna con los mismos pasos. Por ejemplo, preparar el traspaso de cada negocio ganado, revisar por qué se perdió cada negocio o revisar cada solicitud de garantía contra tu política.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-servicio"],
  },
  // ─── Insider (personalización y recompra) ───────────────────────────────────────────────────────────────────
  {
    id: "personalizacion-web",
    titulo: "Personalizar el sitio según lo que hizo cada visitante",
    promesa:
      "Cada visitante ve en tu sitio y tu app lo que le corresponde según lo que hizo antes, sin que nadie arme un segmento para él.",
    descripcion:
      "Tu sitio y tu app muestran a cada visitante lo que le corresponde según lo que hizo antes, sin armar segmentos a mano. Cada cliente ve en su cuenta lo que tiene que ver con lo que compró.",
    tipo: "expandir",
    capa: "ia",
    areas: ["2", "3"],
    sintomas: [
      "Todos ven el mismo sitio, hayan comprado o no.",
      "Tenemos tráfico, pero convierte poco.",
      "El sitio no reconoce a un cliente que vuelve.",
      "Le mostramos la misma oferta a quien ya la compró.",
    ],
    obtienes: [
      "Cada persona ve el contenido que le corresponde según lo que hizo antes.",
      "En su cuenta, cada cliente ve lo que corresponde a lo que compró.",
      "Se ve qué versión vio cada persona y cuánto más compra que quien no la vio.",
    ],
    mueve: [
      { dimension: "2.6", desde: "E", hasta: "O" },
      { dimension: "3.6", desde: "E", hasta: "O" },
    ],
    criterios: [
      "2.6.O3",
      "3.6.O1",
    ],
    herramientas: ["insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene:
      "Cuando vendes sobre todo en tu sitio o tu app, con muchas visitas cada mes, y tu marketing ya trabaja con una base de contactos que te dio su permiso.",
  },
  {
    id: "carritos-abandonados",
    titulo: "Recuperar las compras que quedan a medias",
    promesa: "Quien deja una compra a medias recibe a tiempo el recordatorio correcto, por correo, WhatsApp o la app, sin que nadie lo mande.",
    descripcion:
      "Quien deja una compra a medias recibe el recordatorio correcto, a tiempo y sin que nadie lo mande. El mensaje combina correo, WhatsApp y notificaciones, y sabes cuántas compras recupera cada uno.",
    tipo: "expandir",
    capa: "ia",
    areas: ["1"],
    sintomas: [
      "Se nos quedan carritos abandonados todos los días.",
      "Mandamos un solo correo y nada más.",
      "No sabemos cuánta venta se recupera.",
      "Las solicitudes o reservas que dejan a medias nadie las retoma.",
    ],
    obtienes: [
      "Cada compra a medias recibe su recordatorio a tiempo, sin que nadie lo mande.",
      "El recordatorio combina correo, WhatsApp y notificaciones de la app.",
      "Sabes cuántas compras recupera cada mensaje y cada canal.",
    ],
    mueve: [
      { dimension: "1.7", desde: "I", hasta: "E" },
    ],
    criterios: [
      "1.7.F1", "1.7.F2", "1.7.E1",
    ],
    herramientas: ["hubspot", "insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene:
      "Cuando vendes en tu sitio o tu app, o recibes ahí solicitudes o reservas, muchas personas dejan la compra a medias y tu marketing ya funciona.",
  },
  {
    id: "recompra",
    titulo: "Avisar a cada cliente cuando le toca volver a comprar",
    promesa: "Cada cliente recibe el recordatorio o la oferta para volver a comprar justo cuando le toca.",
    descripcion:
      "Con Insider o con HubSpot, cada cliente recibe su recordatorio, su recomendación o su oferta justo cuando le toca volver, según el ciclo de lo que compró. Sabes cuántos clientes vuelven a comprar y con qué mensaje.",
    tipo: "expandir",
    capa: "ia",
    areas: ["1", "2"],
    sintomas: [
      "Los clientes compran una vez y no vuelven.",
      "Mandamos la misma promoción a todos.",
      "No sabemos quién debería estar volviendo a comprar.",
      "No sabemos cada cuánto vuelve a comprar un cliente.",
    ],
    obtienes: [
      "Los clientes que ya deberían haber vuelto se reconocen a tiempo y reciben su recordatorio.",
      "Sabes cada cuánto vuelve a comprar un cliente, por producto.",
      "Sabes cuántos clientes vuelven y con qué mensaje.",
    ],
    mueve: [
      { dimension: "1.7", desde: "I", hasta: "E" },
    ],
    criterios: [
      "1.7.F7", "1.7.E7",
    ],
    herramientas: ["hubspot", "insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene:
      "Cuando tus clientes vuelven a comprar sin contrato en tu sitio o tu app, sobre todo si lo que vendes se acaba o se repone (alimentos, farmacia, mascotas, belleza), y tu marketing ya funciona.",
  },
  {
    id: "ficha-unica",
    titulo: "Unificar la ficha de cada cliente entre canales",
    promesa:
      "Reconoces a cada cliente como una sola persona aunque compre en la tienda, navegue en el sitio y abra la app.",
    descripcion:
      "Lo que cada cliente hace en tu tienda, tu sitio y tu app se junta en una sola ficha. La mayoría de tus ventas quedan asociadas a una persona identificada, y lo que hizo antes de dejar sus datos no se pierde.",
    tipo: "expandir",
    capa: "proceso",
    areas: ["1", "2"],
    sintomas: [
      "El mismo cliente aparece tres veces en nuestros sistemas.",
      "No sabemos quién compra en la tienda.",
      "Lo que alguien hizo en el sitio se pierde cuando se registra.",
      "En la tienda no le pedimos ningún dato al cliente.",
    ],
    obtienes: [
      "La mayoría de las ventas quedan asociadas a un cliente identificado.",
      "Lo que alguien hizo antes de dejar sus datos queda en su ficha.",
      "Cada persona tiene una sola ficha que junta al momento lo que hace en todos los canales.",
    ],
    mueve: [
      { dimension: "1.3", desde: "F", hasta: "E" },
      { dimension: "2.3", desde: "F", hasta: "O" },
    ],
    criterios: [
      "1.3.E4",
      "2.3.E6", "2.3.E7", "2.3.O5",
    ],
    herramientas: ["insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene:
      "Cuando tus clientes compran por más de un canal sin vendedor (en tu tienda, tu sitio y tu app) y hoy no sabes que son la misma persona.",
  },
  // ─── Sostener lo que ya funciona ────────────────────────────────────────────────────────────────────────────
  {
    id: "equipo-tecnico",
    titulo: "Capacitar a tu equipo técnico para mantener HubSpot",
    promesa:
      "Tu equipo técnico entiende cómo está conectado HubSpot y puede mantenerlo y hacerlo crecer por su cuenta.",
    descripcion:
      "Tu equipo técnico aprende cómo está conectado HubSpot, por qué se hizo así y cómo extenderlo, con todo documentado. Corrige y hace crecer las integraciones sin esperar a un proveedor.",
    tipo: "complementario",
    capa: "sostener",
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada cambio en la integración depende del proveedor.",
      "Nadie en la empresa sabe cómo está conectado HubSpot.",
      "Tenemos miedo de tocar un workflow y romper algo.",
    ],
    obtienes: [
      "Tu equipo técnico sabe cómo está conectado HubSpot y por qué.",
      "Corrige y extiende las integraciones sin esperar a un proveedor.",
      "Lo que se construyó queda documentado y no se va con una persona.",
    ],
    mueve: [],
    criterios: [],
    herramientas: ["smarteam"],
    servicios: ["Capacitación técnica"],
    cuandoConviene: "Cuando tienes TI o desarrolladores que van a mantener HubSpot y sus integraciones por su cuenta.",
  },
  {
    id: "hubspot-administrado",
    titulo: "Administrar tu HubSpot con cambios cada mes",
    promesa:
      "Tu HubSpot sigue al día: cada mes se hacen los cambios que tu equipo prioriza y sabes de una falla antes de que te la muestre un reporte.",
    descripcion:
      "Cada mes, los cambios que tu equipo prioriza en una reunión fija quedan hechos y probados con quien los pidió. Si una integración o un formulario deja de traer datos te enteras antes que por un reporte, y cada trimestre tus líderes revisan con nosotros cómo se usa HubSpot y qué sigue.",
    tipo: "complementario",
    capa: "sostener",
    areas: ["1", "2", "3"],
    sintomas: [
      "Terminó la implementación y ya no tenemos a quién pedirle los ajustes.",
      "Cada cambio chico en HubSpot termina siendo un proyecto con el partner.",
      "Se fue quien administraba HubSpot y nadie sabe cómo cambiar nada.",
      "Nos enteramos de que la integración dejó de sincronizar cuando el reporte no cuadró.",
    ],
    obtienes: [
      "Los ajustes que pide tu equipo no esperan a un proyecto nuevo.",
      "Sabes que una integración o un formulario dejó de traer datos antes de que te lo diga un reporte.",
      "Tu HubSpot no depende de una persona: si alguien se va, sigue al día.",
      "Cada trimestre sabes qué se usa, qué sobra en tus licencias y qué conviene hacer después.",
    ],
    mueve: [],
    criterios: [],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["SmartLoop"],
    cuandoConviene:
      "Cuando ya usas HubSpot, después de un proyecto con nosotros o por tu cuenta, y cada mes aparecen cambios chicos que nadie hace. Por ejemplo, se fue quien lo administraba, los ajustes se acumulan o una integración dejó de traer datos sin que nadie se enterara.",
    requiereUnoDe: ["sistematiza-ventas", "sistematiza-marketing", "sistematiza-servicio", "migra-a-hubspot", "reactiva-hubspot"],
  },
];

export function casoPorId(id: string): CasoDelCatalogo | undefined {
  return CATALOGO_DE_CASOS.find((c) => c.id === id);
}

/**
 * Los nombres que tuvieron los casos: hasta el 2026-11-06, cuando 14 se renombraron al sumar sus actividades; hasta el
 * 2026-11-08, cuando los 38 pasaron a las reglas del título del agente (una sola idea, de 4 a 10 palabras), y hasta el
 * 2026-11-09, cuando pasaron a decir lo que el cliente compra (Marco: «Estandarizar el proceso comercial»). Lo que se
 * guardó con el nombre viejo (un caso de la empresa, uno elegido o descartado en una preventa) sigue siendo el mismo
 * caso: `tituloVigente` lo traduce, y así «Lo que le falta comprar» y el agente de la preventa no lo ofrecen de nuevo.
 */
export const NOMBRES_ANTERIORES: Readonly<Record<string, readonly string[]>> = {
  "sistematiza-ventas": ["Sistematiza tu proceso comercial con HubSpot", "Tu equipo comercial vende con un mismo proceso en HubSpot"],
  "sistematiza-marketing": ["Sistematiza tu marketing con HubSpot", "Tu marketing funciona en HubSpot sin depender de una persona"],
  "sistematiza-servicio": ["Sistematiza tu servicio con HubSpot", "Cada caso de servicio se atiende igual en HubSpot"],
  "migra-a-hubspot": ["Migra a HubSpot sin perder datos ni continuidad", "Migra a HubSpot sin perder tu historial ni dejar de vender", "Cambia a HubSpot sin perder la historia de tus clientes"],
  "reactiva-hubspot": ["Reactiva tu inversión en HubSpot", "Reactiva el HubSpot que ya pagas", "Tu equipo vuelve a usar el HubSpot que ya pagas"],
  "limpieza-datos": ["Limpia tu base de datos y mantenla limpia", "Cada cliente aparece una sola vez en tu base"],
  "objetos-personalizados": ["Mapea tu operación única en HubSpot con objetos personalizados", "Gestiona lo único de tu negocio en HubSpot", "Tus contratos o programas tienen su propio registro en HubSpot"],
  "marcas-y-paises": ["Ordena tus marcas, países o unidades de negocio en un solo HubSpot", "Todas tus marcas o países trabajan en un solo HubSpot"],
  "cotizaciones": ["Estandariza y controla tus cotizaciones comerciales", "Cada cotización sale de HubSpot con la misma plantilla"],
  "cobros-en-linea": ["Cobra en línea en el momento de cerrar la venta", "Tu cliente paga en línea al aceptar la cotización"],
  "playbooks-secuencias": ["Vende con el mismo guion y un seguimiento que no se olvida", "Seguimiento a prospectos con la misma cadencia para todos"],
  "prospeccion-ia": ["Prioriza y acelera tu prospección B2B con IA", "La IA le dice a cada vendedor a quién contactar"],
  "pronostico": ["Pronostica tus ventas con confianza", "Un pronóstico de ventas que se acerca a lo real"],
  "reuniones-con-ia": ["Haz que cada reunión deje su resumen en HubSpot", "Cada reunión con un cliente deja su resumen en HubSpot"],
  "alinea-marketing-ventas": ["Alinea Marketing y Ventas para que cada lead calificado llegue a tiempo", "Cada lead calificado le llega al vendedor que corresponde"],
  "atribucion": ["Descubre qué canal te trae ventas y cuánto te cuesta cada una", "Sabes cuánto te cuesta cada venta por canal"],
  "marketing-ia-breeze": ["Acelera tu marketing con IA y Breeze", "Produce más campañas y contenido con IA que suena a tu marca", "La IA escribe tus campañas con tu voz de marca"],
  "nutricion-agente": ["Acompaña a cada lead hasta que esté listo para comprar", "Los leads que aún no compran reciben correos personalizados"],
  "abm": ["Gana tus cuentas clave con Marketing y Ventas trabajando juntos", "Marketing y Ventas trabajan juntos tus cuentas clave"],
  "seo-aeo": ["Optimiza tu SEO y tu AEO", "Haz que te encuentren en Google y en los asistentes de IA", "Te encuentran en Google y en los asistentes de IA"],
  "presencia-web": ["Evoluciona tu presencia web sobre HubSpot", "Lanza un sitio que trae contactos y que cambias sin programador", "Un sitio en HubSpot que cambias sin programador"],
  "whatsapp": ["Integra WhatsApp y unifica tus conversaciones en HubSpot", "Las conversaciones de WhatsApp quedan registradas en HubSpot"],
  "agentes-ia-atencion": ["Automatiza la atención al cliente con agentes de IA", "Resuelve las consultas de siempre con un agente de IA", "Un agente de IA responde las consultas de siempre"],
  "base-conocimiento-portal": ["Haz que tus clientes encuentren solos sus respuestas y vean en qué va su caso", "Tus clientes encuentran solos las respuestas de siempre"],
  "customer-success": ["Expande tus cuentas con Customer Success en HubSpot", "Retén a tus clientes y haz crecer cada cuenta", "Sabes a tiempo qué clientes están por irse"],
  "integracion-erp": ["Integra HubSpot con tu ERP y tu backoffice", "Integra tus sistemas con HubSpot para ver a cada cliente completo", "Lo que compra cada cliente se ve en HubSpot"],
  "cobranza": ["Acelera y controla tu cobranza con HubSpot", "Los avisos de cobro salen solos desde HubSpot"],
  "data-lake": ["Convierte tus datos en un activo confiable e integra tu stack", "Convierte tus datos en un activo confiable", "Los datos de todos tus sistemas en un solo lugar"],
  "power-bi": ["Lleva los datos de HubSpot a Power BI o a tu BI corporativo", "Los datos de HubSpot llegan solos a tu Power BI"],
  "tablero-direccion": ["Dirige tu empresa con los números a la vista", "La gerencia ve cada área contra su meta"],
  "asistente-ia-conectado": ["Consulta y actualiza tu HubSpot desde ChatGPT o Claude", "Tu equipo usa HubSpot desde ChatGPT o Claude"],
  "agentes-ia-internos": ["Pon a un agente de IA a hacer el trabajo repetitivo de tu equipo", "Un agente de IA hace en HubSpot las tareas repetitivas"],
  "personalizacion-web": ["Personaliza la experiencia web de tus visitantes con Insider", "Personaliza tu sitio y tu app para cada visitante con Insider", "Cada visitante ve tu sitio según lo que hizo antes"],
  "carritos-abandonados": ["Recupera carritos y compras a medias con Insider", "Recupera carritos y compras a medias", "Quien deja una compra a medias recibe su recordatorio"],
  "recompra": ["Haz que tus clientes vuelvan a comprar con Insider", "Haz que tus clientes vuelvan a comprar", "Cada cliente recibe su oferta justo cuando le toca volver"],
  "ficha-unica": ["Une la ficha de cada cliente entre tu sitio, tu app y tu tienda", "Une la ficha de cada cliente entre tu sitio, tu app y tu tienda con Insider", "Cada cliente tiene una sola ficha en todos tus canales"],
  "equipo-tecnico": ["Haz que tu equipo técnico sostenga y extienda HubSpot sin depender de terceros", "Tu equipo técnico mantiene HubSpot sin depender de terceros"],
  "hubspot-administrado": ["Ten tu HubSpot administrado y al día cada mes", "Los cambios que pide tu equipo se hacen cada mes"],
};

const comparable = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const VIGENTE_POR_NOMBRE_ANTERIOR: ReadonlyMap<string, string> = new Map(
  Object.entries(NOMBRES_ANTERIORES).flatMap(([id, viejos]) => {
    const vigente = casoPorId(id)?.titulo;
    return vigente ? viejos.map((v) => [comparable(v), vigente] as const) : [];
  }),
);

/** El nombre de hoy de un caso guardado con un nombre anterior; cualquier otro título vuelve igual. */
export function tituloVigente(titulo: string): string {
  return VIGENTE_POR_NOMBRE_ANTERIOR.get(comparable(titulo)) ?? titulo;
}

/**
 * La clave para saber si dos títulos guardados son el mismo caso: con el nombre de hoy y en minúsculas. Los casos de una
 * empresa (`CasoDeUso`) se guardan por título, sin el id del catálogo: comparar sin esto ofrece de nuevo, o duplica, uno
 * guardado con un nombre anterior (revisión del 2026-11-08, cuando cambiaron los 38).
 */
export function claveDelTitulo(titulo: string): string {
  return tituloVigente(titulo.trim()).trim().toLowerCase();
}
