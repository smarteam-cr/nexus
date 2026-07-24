/**
 * components/landing/configs/exploracion-lenses.ts
 *
 * LENTES DE EXPLORACIÓN por tag — el corazón del Tag-Driven en este documento.
 *
 * Un tag del handoff dejó de ser una etiqueta decorativa: define QUÉ tiene que ir a buscar
 * el agente de exploración. Antes los tags se aplanaban a una línea ("Alcance etiquetado:
 * Sales Hub, Sitio web") y el agente producía lo mismo tuviera los tags que tuviera.
 *
 * Cada lente nombra los SUPUESTOS que ese tipo de proyecto suele esconder y el tipo de
 * pregunta que los cierra. NO son checklists para copiar: el método sigue siendo "leé el
 * handoff, detectá el supuesto, derivá la pregunta" — la lente dice DÓNDE mirar.
 *
 * REGLAS DE ESTE REGISTRO:
 *  1. Una lente por CADA tag del catálogo. `lib/canvas/exploracion-lenses.test.ts` falla si
 *     falta alguna → agregar un tag obliga a decidir qué cambia en la exploración.
 *  2. Solo influyen el CONTENIDO (qué se pregunta y qué se supone) dentro de las 7 secciones
 *     fijas. NO agregan secciones: el set está congelado por `registry.test` y ya existe en
 *     los canvases creados. Una sección condicional por tag sería otra decisión.
 *  3. Se inyectan SOLO las lentes de los tags que el proyecto tiene — el prompt no carga las
 *     12 siempre.
 *
 * Voseo a propósito: es material de prompt y `exploracion.defs.ts` (el agentIntro que lo
 * acompaña) ya está en voseo — mezclar registros dentro del mismo prompt es peor.
 */
import { sanitizeTags, labelForTag } from "@/lib/tags/catalog";

/** slug del catálogo → qué tiene que ir a buscar la exploración en ese tipo de proyecto. */
export const EXPLORACION_TAG_LENSES: Record<string, string> = {
  // ── Alcance / características ───────────────────────────────────────────────
  sitio_web:
    "Un sitio se aprueba por GUSTO y se atrasa por INSUMOS — los dos se dan por supuestos en el handoff. Buscá: " +
    "REFERENCIAS y ANTI-REFERENCIAS (qué sitios les gustan y cuáles NO soportan, siempre con el PORQUÉ — el porqué es el dato, no el link); " +
    "FUNCIONALIDAD más allá del contenido (formularios y a dónde entregan, buscador, área privada o portal, multi-idioma, e-commerce, reservas, integraciones con lo que ya usan); " +
    "ASSETS REALES (¿existen fotos y video de calidad o hay que producirlos?, ¿quién los produce y para cuándo?, ¿hay manual de marca o hay que inventarlo?); " +
    "CONTENIDO EXISTENTE (qué se migra tal cual, qué se reescribe, qué se tira, y quién escribe lo que falta); " +
    "y QUIÉN APRUEBA el diseño — si son varios, cuántas rondas y quién desempata. " +
    "El supuesto más caro de un proyecto web es 'el cliente tiene el contenido listo'.",
  custom_dev:
    "Lo técnico se rompe en los BORDES, no en el centro. Buscá: qué sistemas se tocan de verdad y quién es dueño de cada uno; " +
    "cuál es el identificador único de cada lado y qué pasa cuando no matchea; cómo se evita duplicar; " +
    "en qué dirección viaja el dato y quién gana si los dos lados cambian; volúmenes reales y ventanas de mantenimiento; " +
    "y a quién se llama del lado del cliente cuando la integración falla un viernes.",
  crm_migration:
    "Migrar es DECIDIR QUÉ SE DEJA, y eso nunca está en el handoff. Buscá: qué historia se trae y desde cuándo; " +
    "qué propiedades se usan de verdad vs. las que nadie llenó nunca; cómo de sucios están los datos (duplicados, campos libres, formatos); " +
    "quién tiene autoridad para decir 'esto no se migra'; qué pasa con lo que está a mitad de camino el día del corte; " +
    "y qué reportes actuales tienen que seguir funcionando después.",

  // ── Productos ──────────────────────────────────────────────────────────────
  sales_hub:
    "El pipeline dibujado y el proceso real casi nunca coinciden. Buscá: cómo venden HOY de verdad, etapa por etapa, con un caso reciente concreto; " +
    "qué hecho observable dispara el paso de una etapa a la siguiente (no la definición teórica); dónde vive hoy la información (cabeza, WhatsApp, Excel, otro CRM); " +
    "quién carga y quién no, y qué pasa cuando no cargan; si el pronóstico se usa para algo o es decorativo; " +
    "y qué hace un vendedor en su primera hora del día.",
  marketing_hub:
    "Marketing se mide con lo que ya existe, y lo que existe suele estar peor de lo que dicen. Buscá: de dónde vienen hoy los leads y cuáles cierran de verdad; " +
    "qué le pasa a un lead entre que levanta la mano y que alguien lo llama; qué se le promete al lead y quién cumple esa promesa; " +
    "en qué estado están las listas y los permisos de contacto; qué contenido tienen vs. qué van a tener que producir; " +
    "y cómo definen 'lead calificado' — pediles que lo digan Ventas y Marketing por separado y comparalos.",
  service_hub:
    "Soporte se juzga por los casos malos, no por el promedio. Buscá: por dónde entra un caso hoy (todos los canales, incluidos los informales); " +
    "qué se considera resuelto y quién lo declara; qué casos escalan y a quién; qué preguntan los clientes una y otra vez; " +
    "qué compromisos de tiempo tienen (escritos o de palabra) y qué pasa si no los cumplen; " +
    "y qué sabe Soporte del cliente que Ventas no sabe.",
  content_hub:
    "Contenido muere por falta de dueño, no por falta de herramienta. Buscá: quién escribe, quién aprueba y con qué frecuencia real (no la deseada); " +
    "qué contenido ya tienen y en qué estado; cómo miden si un contenido sirvió; " +
    "quién mantiene el sitio hoy y qué tan autónomo quiere ser el cliente después; " +
    "y qué pasó la última vez que quisieron publicar algo rápido.",
  operations_hub:
    "Operaciones aparece cuando algo ya se rompió en silencio. Buscá: qué se arregla hoy a mano y cada cuánto; " +
    "qué datos no coinciden entre sistemas y quién los concilia; qué automatización existente nadie se anima a tocar; " +
    "qué pasa cuando un registro entra mal (¿alguien se entera?); y a quién le explota el problema cuando explota.",
  commerce_hub:
    "Cobrar toca finanzas, y finanzas no suele estar en la sala del handoff. Buscá: cómo cobran hoy y con qué herramienta; " +
    "qué pasa cuando un pago falla o llega tarde; quién concilia contra contabilidad y con qué frecuencia; " +
    "qué necesita el equipo fiscal/contable que el sistema tiene que emitir sí o sí; " +
    "y quién de finanzas tiene que estar de acuerdo para que esto salga.",
  data_hub:
    "Datos es un proyecto de ACUERDOS antes que de tecnología. Buscá: qué dato es la fuente de verdad de qué, y quién lo decidió; " +
    "qué métrica calcula distinto cada área y cuál es la versión que se lleva a dirección; " +
    "qué tan sucios están los datos de origen; quién es dueño de la calidad; " +
    "y qué decisión concreta quieren tomar con estos datos que hoy no pueden tomar.",
  insider_one:
    "Insider One es producto propio: el supuesto es que el cliente sabe qué esperar y casi nunca es así. Buscá: qué entendió el cliente que hace la app y qué NO hace; " +
    "cómo encaja en el flujo de trabajo que ya tienen; quién la va a usar todos los días y qué usa hoy en su lugar; " +
    "qué datos necesita para funcionar y si el cliente los tiene; y qué mediría el cliente para decir que valió la pena.",

  // ── Modalidad del servicio ──────────────────────────────────────────────────
  recurrente:
    "En un servicio de continuidad el riesgo no es entregar mal: es volverse invisible. Buscá: cómo se ve un mes bueno vs. un mes malo PARA EL CLIENTE; " +
    "quién adentro tiene que justificar este gasto y ante quién; qué esperan recibir cada mes (y con qué frecuencia quieren verse); " +
    "qué haría que no renueven; y quién es el reemplazo si mañana cambia el contacto.",
};

/** Encabezado del bloque — nombra la mecánica para que el modelo sepa por qué está ahí. */
const LENTE_HEADER = "=== LENTES POR ETIQUETA DEL PROYECTO (dirigen tu exploración) ===";

/**
 * Arma el bloque de prompt con las lentes de los tags ACTIVOS del proyecto. PURO (testeable).
 *
 * - Con tags: encabezado + labels + una lente por tag reconocido (los desconocidos se
 *   descartan vía `sanitizeTags`, igual que en el resto del sistema).
 * - Sin tags: un bloque EXPLÍCITO de "sin etiquetas". El silencio no sirve — el modelo lo
 *   leería como permiso para asumir un tipo de proyecto; acá se le dice que no lo haga.
 */
export function buildTagLensBlock(slugs: string[]): string {
  const activos = sanitizeTags(slugs);

  if (activos.length === 0) {
    return (
      `${LENTE_HEADER}\n` +
      "Este proyecto NO tiene etiquetas de alcance. No asumas de qué tipo de proyecto se trata: " +
      "derivá todo del handoff y, si el tipo de trabajo no queda claro ahí, eso mismo ES un supuesto sin verificar " +
      "y va a «Lo que damos por supuesto»."
    );
  }

  const conLente = activos.filter((s) => EXPLORACION_TAG_LENSES[s]);
  const lineas = conLente.map((s) => `\n• ${labelForTag(s)} — ${EXPLORACION_TAG_LENSES[s]}`);

  return (
    `${LENTE_HEADER}\n` +
    `Este proyecto está etiquetado como: ${activos.map(labelForTag).join(", ")}.\n` +
    "Estas lentes NO son un checklist para copiar: te dicen DÓNDE mirar. El método no cambia — " +
    "seguí derivando cada pregunta de un supuesto concreto de ESTE handoff. Si el handoff ya confirma " +
    "algo que la lente sugiere preguntar, va a «Lo que ya sabemos», no a las preguntas." +
    lineas.join("")
  );
}
