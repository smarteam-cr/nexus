/**
 * lib/escala/nueve/catalogo.ts — los cambios del borrador 9.0.0 de la escala, uno por punto de las fuentes. PURO.
 *
 * Fuentes (2026-10-25, aprobado por Elías el 24 oct: se escribe ya como BORRADOR y se publica después de
 * probar la 8.9.1 con 5 a 8 clientes, nunca Wherex):
 *   · docs/escala/pendiente-9-0.md — 17 temas, 124 puntos. Cada entrada cita su tema y sus anclas.
 *   · docs/escala-engagement-avanzado-plan.md — los 16 cambios de Insider, la condición «tráfico suficiente»
 *     y la lectura «Preparación para engagement avanzado». `habilita` dice qué pone HubSpot y qué Insider
 *     (docs/escala/mapa_de_herramientas.md); la escala misma no nombra herramientas.
 * Los textos entre comillas del documento entran tal cual; donde el documento solo dice «partir en A / B»,
 * la redacción es de Claude y la entrada lo dice (`aplicada-con-redaccion`). Lo que el documento deja con
 * dos caminos o con «decidir» no entra: queda como pregunta (ver tipos.ts).
 *
 * El orden importa: una entrada puede requerir un criterio que creó una anterior, por su alias.
 */
import { PREGUNTA_DEL_TRAFICO } from "@/lib/escala/documento/parsear";
import type { Verificacion } from "@/lib/escala/documento/tipos";
import type { Campos, Entrada, Operacion, Ref } from "./tipos";

// ── La condición «tráfico suficiente» (decisiones 2 y 5 del 24 oct) ─────────────
/** El umbral provisional de tráfico: lo propone Claude (decisión 5) y va marcado «por validar» (decisión 2). */
export const UMBRAL_DE_TRAFICO = "más de 50.000 visitas al mes en el sitio o la app";
/** La base con permiso que pide la lectura de preparación (el plan de Insider: 5.000 para empezar). */
export const UMBRAL_DE_BASE = "5.000 contactos con permiso para recibir mensajes";
const SI_HAY_TRAFICO = `Si el sitio o la app tiene tráfico suficiente —por ahora, ${UMBRAL_DE_TRAFICO}; umbral por validar—,`;
// Desde N4 (noche 3, 2026-10-26) la condición es una marca de perfil con su pregunta. Las tres constantes de arriba
// quedan porque las entradas de antes las usan tal cual: el borrador de producción se armó con ellas.
/** Lo que dice de «Suficiente» la tercera pregunta del perfil. Su número es el umbral que lee Nexus. */
export const TRAFICO_SUFICIENTE =
  "el sitio o la app recibe 50.000 visitas al mes o más —umbral provisional, hasta tener la calificación con que las plataformas de personalización aceptan a un cliente—";
/** Lo que pide «Lista» de la base. Su número es el umbral que lee Nexus. */
export const BASE_SUFICIENTE = "5.000 contactos con permiso para recibir mensajes";

// ── Atajos ────────────────────────────────────────────────────────────────────
const c = (texto: string, verificacion: Verificacion, extra: Omit<Partial<Campos>, "texto" | "verificacion"> = {}): Campos => ({ texto, verificacion, ...extra });
const nuevo = (nivel: string, alias: string, campos: Campos): Operacion => ({ op: "nuevo", nivel, alias, campos });
const editar = (id: Ref, cambios: Partial<Campos>): Operacion => ({ op: "editar", id, cambios });
const retirar = (id: Ref, reemplazo?: Ref): Operacion => ({ op: "retirar", id, ...(reemplazo ? { reemplazo } : {}) });
const mover = (id: Ref, nivel: string, alias: string, cambios?: Partial<Campos>, reescritos: "llevar" | "soltar" = "soltar"): Operacion => ({
  op: "mover",
  id,
  nivel,
  alias,
  ...(cambios ? { cambios } : {}),
  reescritos,
});

const T1 = "1. Igualdad entre áreas";
const T2 = "2. Criterios compuestos que hay que partir";
const T3 = "3. Lo que comparten Ventas y Marketing";
const T4 = "4. Ventas o Servicio";
const T5 = "5. Repetidos dentro de la escala";
const T6 = "6. IA que sugiere y IA que ejecuta";
const T7 = "7. Lo que ningún criterio pide";
const T8 = "8. Criterios que pasan a pedir otra cosa";
const T9 = "9. Señales de Deficiente e Inicial";
const T10 = "10. Datos en sistemas sin conectar";
const T11 = "11. Duplicados y calidad de datos";
const T12 = "12. Suplantación y confianza del cliente";
const T13 = "13. Permiso de contacto";
const T14 = "14. Celdas desbalanceadas";
const T15 = "15. Nombres de dimensiones";
const T16 = "16. Ediciones por industria";
const T17 = "17. Cálculo y especificación";
const TI = "Insider: engagement avanzado";

const META_DEL_AREA = "Si quien lidera el área no es la dirección general, le presenta cada mes los resultados contra la meta, con datos del sistema.";
const ROL = "Cada persona del equipo tiene su rol por escrito: de qué se encarga, qué decide sola y qué aprueba el líder.";

export const CATALOGO: readonly Entrada[] = [
  // ════════════════════════ 1. Igualdad entre áreas ════════════════════════
  {
    punto: "§1 · 3.4.F · 3.8.E3",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "Servicio tiene metas en Funcional, y el autoservicio se mide contra la meta del área (3.8.E3 cambia de lo que mide: sale y entra con otro número).",
    ops: [
      nuevo("3.4.F", "@3.4.F.metas", c("El equipo tiene metas escritas —tiempos de respuesta, casos resueltos, satisfacción— y el líder las revisa cada mes.", "declarado", { habito: true })),
      mover("3.8.E3", "3.8.E", "@3.8.E.autoservicio", {
        texto: "Se mide cuántos clientes resuelven en el autoservicio sin abrir un caso, y ese número alcanza la meta que fijó el área.",
        requiere: ["@3.4.F.metas"],
      }),
    ],
  },
  {
    punto: "§1 · 1.4.E · 2.4.F6 · 3.4.E",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "El reporte del área a la dirección sale de Funcional de Marketing (2.4.F6) y entra en Eficiente de las tres áreas, con la misma vara.",
    ops: [
      retirar("2.4.F6"),
      nuevo("1.4.E", "@1.4.E.direccion", c(META_DEL_AREA, "declarado", { habito: true })),
      nuevo("2.4.E", "@2.4.E.direccion", c(META_DEL_AREA, "declarado", { habito: true })),
      nuevo("3.4.E", "@3.4.E.direccion", c(META_DEL_AREA, "declarado", { habito: true })),
    ],
  },
  {
    punto: "§1 · 2.4.F4 · 2.4.F5",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "pregunta",
    resumen: "Decisiones que citan datos y operar el sistema sin ayuda: el documento deja dos caminos.",
    ops: [],
    pregunta:
      "Decidir con datos y operar el sistema sin ayuda externa hoy solo los pide Marketing en Funcional. ¿Se suman a Ventas y Servicio en Funcional, o bajan a Eficiente en Marketing?",
  },
  {
    punto: "§1 · 1.4.F1 · 2.4.F1 · 3.4.F1",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "El rol por escrito dice qué decide cada persona sola y qué aprueba el líder, en las tres áreas. Sube la vara: los tres salen y entran con otro número.",
    ops: [mover("1.4.F1", "1.4.F", "@1.4.F.rol", { texto: ROL }), mover("2.4.F1", "2.4.F", "@2.4.F.rol", { texto: ROL }), mover("3.4.F1", "3.4.F", "@3.4.F.rol", { texto: ROL })],
  },
  {
    punto: "§1 · 3.3.E · Inmobiliaria 3.3.F2",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "Lo que ha pagado el cliente entra en Eficiente de Servicio, como en Ventas; requiere la integración de §10. Inmobiliaria lo dice con el plan de pagos.",
    ops: [
      // La integración que trae lo que se paga (§10, 3.2.E) va antes: este criterio la requiere.
      nuevo(
        "3.2.E",
        "@3.2.E.integracion",
        c("Si lo que el cliente compró o paga vive en otro sistema, una integración lo trae a su ficha sin cargarlo a mano.", "comprobable"),
      ),
      nuevo("3.3.E", "@3.3.E.pagado", c("La ficha del cliente muestra lo que ha pagado.", "comprobable", { requiere: ["@3.2.E.integracion"] })),
      { op: "edicion-reescrito", edicion: "inmobiliaria", id: "@3.3.E.pagado", texto: "La ficha del comprador muestra su plan de pagos y lo que le falta pagar para escriturar." },
    ],
  },
  {
    punto: "§1 · 1.2.F · 3.2.F · Banca 3.2",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "Las licencias sin uso se miden en Ventas y Servicio con la vara de Marketing (2.2.F2). Banca lo lee igual.",
    ops: [
      nuevo("1.2.F", "@1.2.F.licencias", c("Las herramientas y los módulos que se pagan están en uso: ninguna licencia lleva más de un mes sin usarse.", "comprobable")),
      nuevo("3.2.F", "@3.2.F.licencias", c("Las herramientas y los módulos que se pagan están en uso: ninguna licencia lleva más de un mes sin usarse.", "comprobable")),
    ],
  },
  {
    punto: "§1 · 1.3.F5 · 1.3.F6 · 1.3.F7 · 1.5.F · 1.2.E5",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "Ventas tiene un solo criterio de contexto, como Marketing y Servicio; entra el documento de lo que se ofrece en 1.5.F, y 1.2.E5 requiere el criterio de contexto.",
    ops: [
      nuevo("1.5.F", "@1.5.F.oferta", c("Hay un documento con lo que se ofrece —qué resuelve cada solución y para quién— y el mensaje de valor con que se presenta.", "declarado")),
      nuevo(
        "1.3.F",
        "@1.3.F.contexto",
        c(
          "El contexto que el área documentó —el cliente ideal, lo que se ofrece y, donde se vende con equipo, la definición de lead calificado— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer.",
          "declarado",
          { riesgo: true, habito: true, requiere: ["1.5.F1", "1.6.F2", "@1.5.F.oferta"] },
        ),
      ),
      retirar("1.3.F5", "@1.3.F.contexto"),
      retirar("1.3.F6", "@1.3.F.contexto"),
      retirar("1.3.F7", "@1.3.F.contexto"),
    ],
  },
  {
    punto: "§1 · 1.3.O3 · 3.3.E3",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "parcial",
    resumen: "3.3.E3 pasa a pedir el dato (lo prometido en la venta, en la ficha), no su uso: sale y entra con otro número; 3.6.O3 requiere el nuevo.",
    ops: [
      mover("3.3.E3", "3.3.E", "@3.3.E.prometido", {
        texto: "La ficha de la mayoría de los clientes tiene lo que se le prometió en la venta, registrado al pasar de Ventas a Servicio.",
      }),
    ],
    pregunta:
      "La ficha completa del cliente se cuenta en Ventas (Óptimo) y en Servicio. ¿En qué área y nivel queda (la tabla de paridad)? ¿Y se mide aparte que el equipo la use (evaluado · hábito)?",
  },
  {
    punto: "§1 · 2.6.F3 · 1.6.E3",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "pregunta",
    resumen: "Hablarle distinto a cada segmento: Funcional en Marketing y Eficiente en Ventas.",
    ops: [],
    pregunta: "Hablarle distinto a cada segmento es Funcional en Marketing y Eficiente en Ventas. ¿Cuál de los dos cambia de nivel?",
  },
  {
    punto: "§1 · 2.4.E4",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "Lo que el equipo pide del sistema se revisa y se responde, igual en las tres áreas: 2.4.E4 sale y entra con otro número, y Servicio lo suma (Ventas ya lo pide en 1.4.E4).",
    ops: [
      mover("2.4.E4", "2.4.E", "@2.4.E.pedidos", { texto: "El equipo señala lo que el sistema debería hacer distinto, y el líder revisa y responde cada pedido." }),
      nuevo("3.4.E", "@3.4.E.pedidos", c("El equipo señala lo que el sistema debería hacer distinto, y el líder revisa y responde cada pedido.", "evaluado", { habito: true })),
    ],
  },
  {
    punto: "§1 · 3.8.E2",
    fuente: "pendiente-9-0",
    tema: T1,
    estado: "aplicada",
    resumen: "3.8.E2 se acota a revisar; entra que lo revisado cambie el proceso y quede escrito qué cambió.",
    ops: [
      editar("3.8.E2", { texto: "Al menos una vez por trimestre se revisan los casos que se repiten y, donde la relación es continua, las razones de salida." }),
      nuevo("3.8.E", "@3.8.E.aprendido", c("Lo que sale de esa revisión cambia el proceso, las respuestas publicadas o los playbooks, y queda escrito qué cambió.", "declarado", { habito: true })),
    ],
  },

  // ════════════════════════ 2. Criterios compuestos ════════════════════════
  {
    punto: "§2 · 1.1.F4",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "El proceso escrito y la cadencia de contacto, en dos criterios.",
    ops: [
      editar("1.1.F4", { texto: "Hay un proceso de venta escrito, con sus etapas y lo que se hace en cada una.", verificacion: "declarado", habito: false }),
      nuevo("1.1.F", "@1.1.F.cadencia", c("Hay una cadencia de contacto definida —cuántos intentos y en cuántos días— y se cumple con la mayoría de los leads nuevos.", "comprobable", { habito: true })),
    ],
  },
  {
    punto: "§2 · 1.1.E2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Los playbooks escritos y su uso, en dos criterios.",
    ops: [
      editar("1.1.E2", { texto: "Hay playbooks escritos de descubrimiento, calificación y manejo de objeciones.", verificacion: "declarado", habito: false }),
      nuevo("1.1.E", "@1.1.E.playbooks", c("El equipo usa esos playbooks en sus conversaciones.", "evaluado", { habito: true, perfil: "venta con equipo" })),
    ],
  },
  {
    punto: "§2 · 1.2.E2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Las secuencias que se ramifican y la asignación por varias condiciones, en dos criterios.",
    ops: [
      editar("1.2.E2", { texto: "Hay secuencias de contacto de varios pasos que cambian según cómo responde el prospecto." }),
      nuevo(
        "1.2.E",
        "@1.2.E.asignacion",
        c(
          "Los leads se asignan por varias condiciones o por capacidad y, si el equipo atiende por un canal conversacional, también las conversaciones, con control de quién ve y responde cada una.",
          "comprobable",
        ),
      ),
    ],
  },
  {
    punto: "§2 · 1.2.E4",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "El tablero de conversión y el de las conversaciones, en dos criterios.",
    ops: [
      editar("1.2.E4", { texto: "Hay un tablero en tiempo real de la conversión por etapa y por vendedor —o por canal, donde se compra sin vendedor—." }),
      nuevo(
        "1.2.E",
        "@1.2.E.conversaciones",
        c("Si el equipo atiende por un canal conversacional, hay un tablero de las conversaciones: cuánto tarda la primera respuesta y cuántas quedan sin seguimiento.", "comprobable"),
      ),
    ],
  },
  {
    punto: "§2 · 1.4.F4",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "La meta escrita de cada vendedor y el reporte de su avance, en dos criterios.",
    ops: [
      editar("1.4.F4", { texto: "Cada vendedor —o cada canal, donde se compra sin vendedor— tiene una meta escrita, con un monto o una cantidad y un plazo.", habito: false }),
      nuevo(
        "1.4.F",
        "@1.4.F.avance",
        c("El avance de cada vendedor —o de cada canal, donde se compra sin vendedor— contra su meta se reporta en una fecha fija, al menos una vez al mes.", "declarado", { habito: true }),
      ),
    ],
  },
  {
    punto: "§2 · 1.5.E2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Diferenciarse (se escribe una vez) y sostenerlo en cada contacto (hábito), en dos criterios.",
    ops: [
      editar("1.5.E2", { texto: "La propuesta de valor dice por escrito en qué se distingue de la competencia.", verificacion: "declarado", habito: false }),
      nuevo("1.5.E", "@1.5.E.mensaje", c("Ese mensaje es el mismo en el sitio, en las presentaciones y en lo que dice el equipo.", "evaluado", { habito: true })),
    ],
  },
  {
    punto: "§2 · 1.6.F2 · 1.6.F3",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "1.6.F2 queda con la definición escrita; aplicarla queda en 1.6.F3.",
    ops: [
      editar("1.6.F2", { texto: "Hay una definición escrita de lead calificado: los criterios para aceptar un lead como SQL.", verificacion: "declarado", habito: false }),
      editar("1.6.F3", { texto: "Los vendedores dedican su esfuerzo a los leads que cumplen esa definición y encajan con el cliente ideal." }),
    ],
  },
  {
    punto: "§2 · 1.7.F1",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Definir el plazo de cada etapa y tener un paso de reactivación, en dos criterios.",
    ops: [
      editar("1.7.F1", {
        texto: "Para cada etapa está definido cuánto tiempo sin avance vuelve estancado un negocio, y los estancados se reconocen a tiempo.",
        verificacion: "comprobable",
      }),
      nuevo("1.7.F", "@1.7.F.reactivacion", c("Los negocios estancados tienen un paso de reactivación acordado, no la improvisación de cada vendedor.", "evaluado", { habito: true })),
    ],
  },
  {
    punto: "§2 · 2.2.F5",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "Responderle a quien envía el formulario y avisar a quien corresponde, en dos criterios.",
    ops: [
      editar("2.2.F5", { texto: "Si el sitio tiene formularios, cuando alguien envía uno el sistema le responde automáticamente." }),
      nuevo("2.2.F", "@2.2.F.aviso", c("Si el sitio tiene formularios, cuando alguien envía uno el sistema le avisa a quien corresponde, sin que nadie se lo pase.", "comprobable")),
    ],
  },
  {
    punto: "§2 · 2.3.E2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "La atribución repartida y el ingreso por canal, en dos criterios.",
    ops: [
      editar("2.3.E2", { texto: "La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último.", requiere: [] }),
      nuevo("2.3.E", "@2.3.E.ingreso", c("Se sabe cuánto ingreso deja cada canal, también el conversacional si se usa.", "comprobable", { requiere: ["2.2.F4"] })),
    ],
  },
  {
    punto: "§2 · 2.4.O1",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "Quién valida la IA, quién cuida los datos y qué decide la IA sola, en tres criterios (el de los datos, con la redacción de Ventas y Servicio de §11).",
    ops: [
      editar("2.4.O1", { texto: "Hay responsables de validar lo que produce la IA en marketing." }),
      nuevo("2.4.O", "@2.4.O.datos", c("Hay responsables de cuidar la calidad de los datos de marketing: está por escrito quién corrige cada dato y cada cuánto se revisa.", "declarado")),
      nuevo("2.4.O", "@2.4.O.ia", c("Lo que la IA puede decidir sola en marketing está por escrito.", "declarado")),
    ],
  },
  {
    punto: "§2 · 2.5.F2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "La guía de voz escrita y las piezas que la aplican, en dos criterios.",
    ops: [
      editar("2.5.F2", { texto: "Existe una guía corta de voz de marca, escrita." }),
      nuevo("2.5.F", "@2.5.F.voz", c("Las piezas del último trimestre aplican la guía de voz de marca.", "evaluado", { habito: true })),
    ],
  },
  {
    punto: "§2 · 2.5.F3",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "Los buyer personas escritos y el recorrido de compra de cada uno, en dos criterios.",
    ops: [
      editar("2.5.F3", { texto: "Hay 2 o 3 buyer personas escritos." }),
      nuevo("2.5.F", "@2.5.F.recorrido", c("Cada buyer persona tiene escrito su recorrido de compra básico, etapa por etapa.", "declarado")),
    ],
  },
  {
    punto: "§2 · 2.6.E3",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "El puntaje de leads por reglas y el puntaje que dispara la nutrición, en dos criterios.",
    ops: [
      editar("2.6.E3", {
        texto:
          "Hay un puntaje de leads por reglas: un modelo que suma puntos por varios datos de cada persona, como su perfil o lo que hizo, y la clasifica al pasar un umbral —como MQL, donde hay vendedores—. No es la clasificación de Funcional, que responde al valor de una propiedad, sin modelo de puntaje detrás.",
        requiere: [],
      }),
      nuevo(
        "2.6.E",
        "@2.6.E.nutricion",
        c("El puntaje de leads dispara las secuencias de nutrición: al pasar el umbral, la persona entra a la secuencia que le corresponde.", "comprobable", { requiere: ["2.2.E1"] }),
      ),
    ],
  },
  {
    punto: "§2 · 2.7.E1 · Insider 4",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen:
      "Canales coordinados, remarketing y audiencias desde el CRM, en tres criterios; la parte de los canales queda como dice Insider (al menos tres en un recorrido, con límite de frecuencia y el permiso de cada canal). Pide más que antes: entra con número nuevo.",
    habilita: "Insider (con notificaciones); HubSpot en parte (correo, SMS y WhatsApp).",
    ops: [
      mover("2.7.E1", "2.7.E", "@2.7.E.recorrido", {
        texto:
          "Al menos tres canales —también el conversacional, si se usa— se coordinan en un mismo recorrido: uno continúa lo que empezó otro, con un límite de frecuencia y respetando el permiso de cada canal.",
      }),
      nuevo("2.7.E", "@2.7.E.remarketing", c("Hay remarketing activo: quien visitó el sitio o mostró interés vuelve a ver la oferta en otros canales.", "comprobable")),
      nuevo("2.7.E", "@2.7.E.audiencias", c("Las audiencias de las campañas se arman desde el CRM, no a mano en cada herramienta.", "comprobable")),
    ],
  },
  {
    punto: "§2 · 2.8.E3",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada-con-redaccion",
    resumen: "El proceso de campaña y la planificación que se ajustan con lo aprendido, en dos criterios.",
    ops: [
      editar("2.8.E3", { texto: "El proceso de campaña se refina con base en lo aprendido.", requiere: ["2.1.F2"] }),
      nuevo(
        "2.8.E",
        "@2.8.E.planificacion",
        c("La planificación de las campañas siguientes se ajusta con lo aprendido: las nuevas se arman con lo que mostraron las pruebas y las revisiones de cierre.", "declarado", {
          habito: true,
          requiere: ["2.8.F3"],
        }),
      ),
    ],
  },
  {
    punto: "§2 · 3.1.F2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "parcial",
    resumen: "El responsable registrado y el contacto de seguimiento, en dos criterios.",
    ops: [
      editar("3.1.F2", {
        texto: "Cada cliente tiene registrado quién responde por él —una persona o, si la cartera es tan grande que no se asigna por persona, un equipo—.",
        habito: false,
      }),
      nuevo(
        "3.1.F",
        "@3.1.F.seguimiento",
        c(
          "Cada cliente recibe a tiempo un contacto de seguimiento —en los momentos que fija el proceso de atención—, aunque no haya abierto casos; si responde un equipo, ese contacto puede ser un mensaje automático.",
          "comprobable",
          { habito: true },
        ),
      ),
    ],
    pregunta: "El contacto de seguimiento de Funcional y el acompañamiento de uno a muchos de Eficiente se pueden pisar. ¿Los dos siguen así?",
  },
  {
    punto: "§2 · 3.2.E1",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Los plazos de los SLA y el enrutamiento, en dos criterios.",
    ops: [
      editar("3.2.E1", { texto: "Hay alertas antes del vencimiento de los SLA y escalación automática, con reglas de cuándo se escala y a quién." }),
      nuevo("3.2.E", "@3.2.E.enrutamiento", c("Si el equipo tiene más de un agente, los casos se enrutan por varias condiciones: idioma, tema o habilidad del agente.", "comprobable")),
    ],
  },
  {
    punto: "§2 · 3.2.F5",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "La asignación automática y los avisos de cambio de estado, en dos criterios.",
    ops: [
      editar("3.2.F5", { texto: "Al entrar un caso, el sistema lo asigna solo según una regla simple." }),
      nuevo("3.2.F", "@3.2.F.avisos", c("Quien tiene que enterarse de un cambio de estado recibe el aviso sin que nadie se lo mande.", "comprobable")),
    ],
  },
  {
    punto: "§2 · 3.3.E1",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Los tiempos y el cumplimiento de los SLA, en dos criterios; la revisión de los SLA de cada persona (3.4.E1) requiere el nuevo.",
    ops: [
      editar("3.3.E1", { texto: "Se mide el tiempo de primera respuesta y de resolución en todos los canales.", requiere: [] }),
      nuevo("3.3.E", "@3.3.E.sla", c("Se mide qué parte de los casos cumple su SLA.", "comprobable", { requiere: ["3.1.E1"] })),
      editar("3.4.E1", { requiere: ["3.1.F3", "@3.3.E.sla"] }),
    ],
  },
  {
    punto: "§2 · 3.6.F2",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Lo escrito para cada tipo de cliente y que el equipo lo aplique, en dos criterios.",
    ops: [
      editar("3.6.F2", { texto: "Está escrito qué atención recibe cada tipo de cliente.", verificacion: "declarado", habito: false }),
      nuevo("3.6.F", "@3.6.F.atiende", c("El equipo atiende a cada cliente según lo que está escrito para su tipo.", "evaluado", { habito: true })),
    ],
  },
  {
    punto: "§2 · 3.6.E1",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "El responsable de cada cliente clave y el acompañamiento automatizado del resto, en dos criterios.",
    ops: [
      editar("3.6.E1", { texto: "Cada cliente clave tiene un responsable dedicado que lo conoce." }),
      nuevo("3.6.E", "@3.6.E.uno-a-muchos", c("El resto de la cartera recibe acompañamiento automatizado, de uno a muchos.", "comprobable", { perfil: "cliente recurrente" })),
    ],
  },
  {
    punto: "§2 · 3.7.E4",
    fuente: "pendiente-9-0",
    tema: T2,
    estado: "aplicada",
    resumen: "Que ningún caso se pierda entre áreas y las alertas, en dos criterios.",
    ops: [
      editar("3.7.E4", { texto: "Si otras áreas resuelven casos del cliente, quedan en el mismo sistema y no se pierden." }),
      nuevo(
        "3.7.E",
        "@3.7.E.alertas",
        c(
          "Hay alertas automáticas, para quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica o, si se piden calificaciones, cuando un cliente califica mal.",
          "comprobable",
        ),
      ),
    ],
  },

  // ════════════════════════ 3. Lo que comparten Ventas y Marketing ════════════════════════
  {
    punto: "§3 · 1.6.E1 · 2.6.E3 (puntaje de leads)",
    fuente: "pendiente-9-0",
    tema: T3,
    estado: "parcial",
    resumen: "El puntaje de leads queda solo en Marketing (2.6.E3); Ventas pide usarlo (sale 1.6.E1).",
    ops: [
      nuevo("1.6.E", "@1.6.E.puntaje", c("Los vendedores trabajan primero los leads con más puntaje.", "comprobable", { habito: true, perfil: "venta con equipo", requiere: ["2.6.E3"] })),
      retirar("1.6.E1"),
    ],
    pregunta:
      "Usar el puntaje de Marketing entró en Eficiente de Ventas de forma provisional (el documento dice Eficiente u Óptimo). La regla de asignación hoy pone en Óptimo el uso de lo que produce otra área: hay que escribirle el punto «El puntaje de leads por reglas se asigna a Segmentación y es nivel Eficiente; Ventas lo usa para priorizar». ¿Va así?",
  },
  {
    punto: "§3 · 1.6.F4 · 2.3.F2",
    fuente: "pendiente-9-0",
    tema: T3,
    estado: "parcial",
    resumen: "2.3.F2 se parte en pedir las propiedades del cliente ideal y tenerlas completas; 1.6.F1 requiere 2.3.F2.",
    ops: [
      editar("2.3.F2", {
        texto:
          "Las propiedades que describen al cliente ideal —en empresas, la industria, el nombre de la empresa y el rol de la persona; en personas, lo que define a cada segmento— se piden donde entran los leads —en los formularios o, si no hay formularios, donde se capturan sus datos—.",
      }),
      nuevo("2.3.F", "@2.3.F.completas", c("Esas propiedades están completas en la mayoría de los registros.", "comprobable")),
      editar("1.6.F1", { requiere: ["1.5.F1", "2.3.F2"] }),
    ],
    pregunta:
      "Los rasgos del cliente ideal en el CRM se cuentan en Ventas y en Marketing. ¿Se retira el de Ventas, o pasa a medir su uso: «Los vendedores filtran y asignan los leads con las propiedades del cliente ideal»?",
  },
  {
    punto: "§3 · 1.4.E3 · 2.4.E3 · 3.4.E4 (acuerdos entre dos áreas)",
    fuente: "pendiente-9-0",
    tema: T3,
    estado: "parcial",
    resumen: "El traspaso Marketing–Ventas queda solo en Ventas (1.4.E3); lo de Marketing pasa a acordar con Servicio los casos de éxito y los referidos (sale 2.4.E3).",
    ops: [
      nuevo(
        "2.4.E",
        "@2.4.E.servicio",
        c("El líder de marketing acuerda con Servicio qué clientes se vuelven casos de éxito o referidos y cómo se los invita.", "declarado", { habito: true }),
      ),
      retirar("2.4.E3"),
    ],
    pregunta: "La regla de asignación suma el punto de los acuerdos entre dos áreas (el cambio 36 que no entró en la 8.8). Falta escribirlo en la prosa antes de publicar.",
  },

  // ════════════════════════ 4. Ventas o Servicio ════════════════════════
  {
    punto: "§4 · 3.7.E2 · 1.6.O2 · 1.7.E · 3.4.O3 (la expansión)",
    fuente: "pendiente-9-0",
    tema: T4,
    estado: "parcial",
    resumen:
      "Servicio retiene y señala el potencial a Ventas (3.7.E2 sale y entra con otro número); Ventas trabaja ese potencial como negocios (nuevo en 1.7.E); 3.4.O3 se mide por la retención y lo que pasa a Ventas; sale 1.6.O2.",
    ops: [
      mover("3.7.E2", "3.7.E", "@3.7.E.retencion", {
        texto: "Los clientes en riesgo reciben una acción de retención antes de decidir irse, y los que tienen potencial se le señalan a Ventas con su contexto.",
      }),
      nuevo(
        "1.7.E",
        "@1.7.E.potencial",
        c("Los clientes con potencial de crecer que señala Servicio se trabajan como negocios, con responsable y siguiente paso.", "comprobable", {
          perfil: "relación continua",
          requiere: ["3.7.E1"],
        }),
      ),
      mover("3.4.O3", "3.4.O", "@3.4.O.retencion", {
        texto: "El equipo de servicio se mide por la retención de sus clientes y por los clientes con potencial que le pasa a Ventas, no solo por los casos que cierra.",
      }),
      retirar("1.6.O2"),
    ],
    pregunta:
      "Falta escribir en la prosa: «La próxima compra» suma que ofrecerle el siguiente producto a un cliente actual vuelve a ser de Ventas, con la señal que le pasa Servicio, y la regla de asignación suma el punto de la renovación y el siguiente producto. La regla hoy pone en Óptimo el uso de lo que produce otra área: el criterio nuevo va en Eficiente. ¿Así? En Educación, la propuesta del siguiente programa entra como criterio de Admisiones.",
  },
  {
    punto: "§4 · 3.4.E4 · Banca 3.4.E4",
    fuente: "pendiente-9-0",
    tema: T4,
    estado: "parcial",
    resumen: "3.4.E4 queda con lo que trae cada cliente nuevo; entra el acuerdo de cómo Servicio le pasa a Ventas la señal del siguiente producto.",
    pregunta:
      "Lo que se le prometió al cliente en la venta queda en dos lugares: en la ficha (Datos de Servicio, tema 1) y en lo que trae cada cliente nuevo (Equipo y Gobierno). ¿Se acota uno de los dos?",
    ops: [
      editar("3.4.E4", { texto: "Cada cliente nuevo llega de Ventas con el resultado que persigue y lo que se le prometió." }),
      nuevo(
        "3.4.E",
        "@3.4.E.senal",
        c(
          "El líder de Servicio acuerda con Ventas cómo le pasa la señal de los clientes listos para el siguiente producto y, en la recompra, el aviso de los que se están yendo.",
          "declarado",
          { habito: true },
        ),
      ),
    ],
  },
  {
    punto: "§4 · 3.1.E3",
    fuente: "pendiente-9-0",
    tema: T4,
    estado: "aplicada",
    resumen: "Los playbooks de retención y expansión (relación continua) y uno de prevención para todos.",
    ops: [
      editar("3.1.E3", { texto: "Hay playbooks de retención y expansión.", perfil: "relación continua" }),
      nuevo("3.1.E", "@3.1.E.prevencion", c("Hay un playbook de prevención: qué hacer ante las señales de un problema antes de que el cliente reclame.", "declarado")),
    ],
  },
  {
    punto: "§4 · 3.7.O4 · regla de asignación (lealtad)",
    fuente: "pendiente-9-0",
    tema: T4,
    estado: "parcial",
    resumen: "Los detalles para deleitar se acotan a lo que se da sin pedir una compra (y la IA los elige, §6: ver esa entrada).",
    ops: [],
    pregunta:
      "Falta escribir en la regla de asignación el punto del cambio 43: lo que se gana comprando (puntos, niveles o beneficios) va en Tracción del Negocio; lo que se da sin pedir una compra, en Proactividad; premiar al que trae otro cliente, en Canales. Y sacar «promociones de fidelización» del punto de los detalles para deleitar.",
  },

  // ════════════════════════ 5. Repetidos ════════════════════════
  {
    punto: "§5 · 1.4.F5 · 1.1.E3",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "aplicada",
    resumen:
      "El reporte de tareas pasa de Equipo y Gobierno a Funcional de Procesos, con el mismo texto. Deja de requerir que se trabaje en el CRM: queda en su misma celda. Las ediciones lo deciden de nuevo.",
    ops: [mover("1.4.F5", "1.1.F", "@1.1.F.tareas", { requiere: [] }, "soltar")],
  },
  { punto: "§5 · 1.8.O3", fuente: "pendiente-9-0", tema: T5, estado: "aplicada", resumen: "Sale: no se distingue de 1.8.E2 ni de 1.4.O1.", ops: [retirar("1.8.O3")] },
  {
    punto: "§5 · 1.4.O2",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "pregunta",
    resumen: "Una reunión en Equipo y Gobierno que se pisa con los pilotos de 1.1.O3.",
    ops: [],
    pregunta: "¿Se retira 1.4.O2, o pasa a «El líder decide cada trimestre qué técnica se prueba y revisa el resultado del piloto», que el de los pilotos requiere?",
  },
  {
    punto: "§5 · 1.5.F4 · 1.7.F4",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "texto-pendiente",
    resumen: "La plantilla de la propuesta y el material de apoyo: va a la regla de asignación.",
    ops: [],
    pregunta:
      "Falta escribir en la regla de asignación: «La plantilla de la propuesta se mide en Propuesta y Coherencia; el material de apoyo para mover un negocio —presentaciones, casos de éxito, demos— en Tracción del Negocio».",
  },
  { punto: "§5 · 2.8.E1 · 2.8.E2", fuente: "pendiente-9-0", tema: T5, estado: "aplicada", resumen: "Sale 2.8.E2 (lo mide 2.8.E1, y la planificación ya la pide la parte nueva de 2.8.E3; Insider 5 también lo retira).", ops: [retirar("2.8.E2")] },
  {
    punto: "§5 · 2.5.E1 · 2.5.O1",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "aplicada",
    resumen: "Los buyer personas por segmento y por cuenta salen de Marca y entran en Segmentación.",
    ops: [
      retirar("2.5.E1"),
      retirar("2.5.O1"),
      nuevo("2.6.E", "@2.6.E.personas", c("Cada segmento prioritario tiene su buyer persona escrito.", "declarado")),
      nuevo(
        "2.6.O",
        "@2.6.O.personas",
        c("Hay buyer personas para grupos muy chicos de clientes —o, cuando se vende a empresas, para cada cuenta importante—, no solo para los segmentos grandes.", "declarado"),
      ),
    ],
  },
  {
    punto: "§5 · 2.5.F5 · 2.7.F2",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "aplicada",
    resumen: "El contenido propio queda disponible y no son solo publicaciones en redes (eso es del canal orgánico).",
    ops: [editar("2.5.F5", { texto: "Se publica al menos una vez por mes contenido propio que queda disponible —en el sitio, en un canal de video o en guías—, no solo publicaciones en redes." })],
  },
  {
    punto: "§5 · 2.6.O3",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "parcial",
    resumen: "La personalización uno a uno se acota a los mensajes y al contenido de marketing; lo que cambia en la tienda es de Ventas.",
    ops: [
      editar("2.6.O3", {
        texto:
          "Hay personalización uno a uno: la IA cambia en tiempo real los mensajes y el contenido de marketing que ve cada persona según lo que hizo antes, dentro de las reglas que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué versión vio cada persona.",
      }),
    ],
    pregunta: "Falta escribir en la regla de asignación que lo que cambia en la tienda o en el sitio de venta para cada comprador es de Priorización de Ventas.",
  },
  {
    punto: "§5 · 3.2.E2 · 3.4.O1 · 3.8.E1",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "aplicada",
    resumen: "El portal y la base de conocimiento, en dos criterios; 3.4.O1 deja la base de conocimiento.",
    ops: [
      editar("3.2.E2", { texto: "Hay un portal donde el cliente ve y abre sus casos." }),
      nuevo("3.2.E", "@3.2.E.conocimiento", c("Hay una base de conocimiento interna y pública.", "comprobable")),
      editar("3.4.O1", { texto: "Hay responsables de validar lo que responde la IA, y lo que la IA puede resolver sola está por escrito." }),
    ],
  },
  {
    punto: "§5 · 3.3.F3",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "aplicada",
    resumen: "Sale 3.3.F3 (repite lo que compró); entra el tipo de cada cliente, que necesitan la atención por tipo y los contactos a los clientes clave.",
    ops: [retirar("3.3.F3"), nuevo("3.3.F", "@3.3.F.tipo", c("Cada cliente tiene registrado su tipo, según el documento de tipos de cliente.", "comprobable", { requiere: ["3.5.F4"] }))],
  },
  {
    punto: "§5 · 3.6.O1 · 3.6.O2",
    fuente: "pendiente-9-0",
    tema: T5,
    estado: "pregunta",
    resumen: "Dos criterios de personalización en Servicio: el documento pide juntarlos y que digan qué hace la IA.",
    ops: [],
    pregunta:
      "3.6.O1 y 3.6.O2 se juntan en «Cada cliente ve y recibe lo que corresponde a su tipo, a su historia y a su caso, también en el autoservicio, sin que nadie lo arme a mano». ¿Qué hace la IA ahí y quién valida (decisión 9)?",
  },

  // ════════════════════════ 6. IA que sugiere y IA que ejecuta ════════════════════════
  {
    punto: "§6 · 1.1.O1",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada",
    resumen: "Marcar lo que se sale del proceso es Eficiente; en Óptimo la IA lo corrige sola. Sale 1.1.O1.",
    ops: [
      nuevo("1.1.E", "@1.1.E.marca", c("El sistema marca en el CRM los negocios que se salen del proceso y se los señala al líder.", "comprobable")),
      nuevo(
        "1.1.O",
        "@1.1.O.corrige",
        c(
          "La IA corrige sola lo que se sale del proceso —crea la tarea que falta, completa el dato, reasigna el negocio— y el líder revisa en el CRM lo que no pudo resolver.",
          "comprobable",
        ),
      ),
      retirar("1.1.O1"),
    ],
  },
  {
    punto: "§6 · 1.2.O1",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada",
    resumen: "La probabilidad de cierre queda en Óptimo; las respuestas sugeridas bajan a Eficiente; entra la IA que responde sola en el canal conversacional.",
    ops: [
      editar("1.2.O1", { texto: "La IA calcula la probabilidad de cierre de cada negocio; se ve en el CRM y el líder la revisa antes de usarla." }),
      nuevo("1.2.E", "@1.2.E.respuestas", c("La IA propone respuestas según el contexto de cada conversación y el vendedor decide si las usa.", "comprobable")),
      nuevo(
        "1.2.O",
        "@1.2.O.conversacional",
        c(
          "Si el equipo atiende por un canal conversacional, la IA responde sola ahí las conversaciones de rutina y el vendedor valida las de más valor; en el CRM queda cada conversación que atendió la IA.",
          "comprobable",
        ),
      ),
    ],
  },
  {
    punto: "§6 · 1.2.O2 · Ecommerce 1.2.O2",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "parcial",
    resumen: "1.2.O2 lleva la marca «venta con equipo»; entra su par para la venta sin vendedor.",
    ops: [
      editar("1.2.O2", { perfil: "venta con equipo" }),
      nuevo(
        "1.2.O",
        "@1.2.O.sin-vendedor",
        c(
          "Si la empresa atiende por un canal conversacional, agentes de IA atienden ahí a los compradores y los llevan hasta el pago; una persona revisa lo que no pudieron resolver, y en el CRM queda cada conversación que atendió la IA.",
          "comprobable",
          { perfil: "venta sin vendedor" },
        ),
      ),
    ],
    pregunta: "Ecommerce reescribía 1.2.O2 para la tienda. ¿Reescribe ahora el nuevo de la venta sin vendedor en su lugar, o lo lleva como propio?",
  },
  {
    punto: "§6 · 1.6.O1 · Insider 9",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada",
    resumen:
      "La siguiente mejor acción que propone la IA baja a Eficiente, con las señales de comportamiento digital y una probabilidad de compra (Insider 9); en Óptimo la IA ejecuta lo de rutina.",
    habilita: "HubSpot (puntaje predictivo); con Insider, la probabilidad vuelve al CRM solo con otra integración.",
    ops: [
      mover("1.6.O1", "1.6.E", "@1.6.E.siguiente", {
        texto:
          "Agentes de IA analizan todo lo que se sabe de cada lead —también sus señales de comportamiento digital y una probabilidad de compra calculada por un modelo— y proponen la siguiente mejor acción, que el vendedor ve en el CRM y decide si ejecuta.",
      }),
      nuevo(
        "1.6.O",
        "@1.6.O.ejecuta",
        c(
          "La IA ejecuta sola las acciones de rutina —recordatorios, reagendar, enviar material— y el vendedor valida las de los negocios de más valor; en el CRM queda qué hizo la IA en cada negocio.",
          "comprobable",
          { perfil: "venta con equipo" },
        ),
      ),
    ],
  },
  {
    punto: "§6 · 1.7.O1",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada-con-redaccion",
    resumen: "Detectar y proponer baja a Eficiente; en Óptimo la IA actúa sola con las reglas del líder. Sale 1.7.O1.",
    ops: [
      mover("1.7.O1", "1.7.E", "@1.7.E.detecta", {
        texto: "La IA detecta qué negocios de más valor se están trabando antes de que venza su plazo y propone a quién movilizar o qué contenido enviar; el líder decide, y todo queda en el CRM.",
      }),
      nuevo(
        "1.7.O",
        "@1.7.O.actua",
        c(
          "Con las reglas que fijó el líder, la IA actúa sola en los negocios de más valor que se traban —envía el contenido o avisa a quien corresponde— y el líder revisa en el CRM lo que hizo.",
          "comprobable",
        ),
      ),
    ],
  },
  {
    punto: "§6 · 1.8.O1 · 1.8.O2 · Banca 1.8.O201",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "parcial",
    resumen: "Proponer correcciones al playbook baja a Eficiente (1.8.O2 y su par de Banca salen y entran con otro número).",
    ops: [
      mover("1.8.O2", "1.8.E", "@1.8.E.playbook"),
      { op: "edicion-mover-propio", edicion: "banca", id: "1.8.O201", nivel: "1.8.E", alias: "@banca.1.8.E.cambio" },
    ],
    pregunta:
      "El análisis de las conversaciones (hoy solo las llamadas, 1.8.O1) pasa a cualquier conversación: llamadas, reuniones o chats. ¿Qué ejecuta la IA en el Óptimo de Aprendizaje, para que no sea una IA que solo propone?",
  },
  {
    punto: "§6 · Banca 1.6.O201",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada",
    resumen: "En Banca, la sugerencia que valida el ejecutivo baja a Eficiente; en Óptimo la IA ofrece sola en los canales digitales.",
    ops: [
      { op: "edicion-mover-propio", edicion: "banca", id: "1.6.O201", nivel: "1.6.E", alias: "@banca.1.6.E.sugerencia", cambios: {
        texto: "Un modelo de IA calcula para cada cliente qué producto le conviene y cuándo ofrecérselo, con su comportamiento y con lo que saben Servicio y Marketing de él; la sugerencia se ve en el CRM y el ejecutivo la valida antes de ofrecerla.",
      } },
      {
        op: "edicion-propio",
        edicion: "banca",
        nivel: "1.6.O",
        alias: "@banca.1.6.O.ofrece",
        campos: c("En los canales digitales, la IA le ofrece sola a cada cliente el producto que le conviene, dentro de los límites que fijó la entidad, y el ejecutivo revisa en el CRM lo que se ofreció.", "comprobable"),
      },
    ],
  },
  {
    punto: "§6 · 3.3.O3",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "pregunta",
    resumen: "Modelos que predicen y proponen: el documento deja dos caminos.",
    ops: [],
    pregunta:
      "3.3.O3 (modelos que predicen y proponen) ¿baja a Eficiente, o en Óptimo la IA actúa: «La IA ajusta los turnos y la asignación del equipo según la demanda que predice, dentro de los límites que fijó el líder; el líder revisa los ajustes, y en el sistema queda cada cambio con su razón»?",
  },
  {
    punto: "§6 · 2.3.O3 · 1.3.O5 · 2.3.O4 · 3.3.O4",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada-con-redaccion",
    resumen: "2.3.O3 se funde en el Óptimo de Datos de Marketing, y en las tres áreas ese Óptimo dice qué hace la IA (los tres salen y entran con otro número: ahora piden la IA).",
    ops: [
      retirar("2.3.O3"),
      mover("1.3.O5", "1.3.O", "@1.3.O.datos", {
        texto:
          "Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: la IA toma los datos de cada conversación, los completa y los corrige sola, las personas solo validan las excepciones que el CRM les marca, y queda qué se corrigió.",
      }),
      mover("2.3.O4", "2.3.O", "@2.3.O.datos", {
        texto:
          "Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: la IA toma los datos de cada contacto, los completa y los corrige sola, las personas solo validan las excepciones, y en el sistema queda qué se corrigió y de dónde salió.",
      }),
      mover("3.3.O4", "3.3.O", "@3.3.O.datos", {
        texto:
          "Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: la IA toma los datos de cada conversación, los completa y los corrige sola, las personas solo validan las excepciones, y en el sistema queda qué se corrigió.",
      }),
    ],
  },
  {
    punto: "§6 · 2.7.O1 · 2.4.O4 · 1.4.O1 · 3.4.O4",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "parcial",
    resumen: "Las prácticas de una persona con datos bajan a Eficiente, con la misma vara en las tres áreas (mismo texto: lo que cada edición decía pasa al nuevo).",
    ops: [
      mover("2.7.O1", "2.7.E", "@2.7.E.canales-nuevos", undefined, "llevar"),
      mover("2.4.O4", "2.4.E", "@2.4.E.valor", undefined, "llevar"),
      mover("1.4.O1", "1.4.E", "@1.4.E.numeros", undefined, "llevar"),
      mover("3.4.O4", "3.4.E", "@3.4.E.costo", undefined, "llevar"),
    ],
    pregunta:
      "Los Óptimos que se cumplen sin IA y se quedan en Óptimo tienen que decir qué ejecuta la IA y quién valida: en Marketing 2.4.O2, 2.3.O1, 2.3.O5, 2.2.O3, 2.1.O4, 2.1.O5, 2.7.O4 y los buyer personas de grupos muy chicos (que pasan a Segmentación); en Ventas 1.1.O2, 1.2.O3, 1.3.O3, 1.3.O4 y 1.6.O4; en Servicio 3.1.O3, 3.1.O4, 3.2.O4, 3.3.O2, 3.4.O2 y 3.7.O2. ¿Qué hace la IA en cada uno?",
  },
  {
    punto: "§6 · 3.7.O1 · 3.7.O4 · §4 (lealtad)",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "aplicada-con-redaccion",
    resumen: "En 3.7.O1 la IA arma y envía el informe del resto de los clientes; en 3.7.O4 la IA elige los detalles, solo los que se dan sin pedir una compra. Los dos salen y entran con otro número.",
    ops: [
      mover("3.7.O1", "3.7.O", "@3.7.O.informe", {
        texto:
          "Las revisiones de resultado llegan a todos los clientes: a los clave en persona y al resto con un informe que la IA arma con sus datos y envía sola, dentro de los límites que fijó el equipo; el equipo revisa una muestra, y cada revisión queda registrada en la ficha del cliente.",
      }),
      mover("3.7.O4", "3.7.O", "@3.7.O.detalles", {
        texto:
          "Los clientes reciben, sin pedirlos y sin tener que comprar a cambio, detalles pensados para deleitarlos —obsequios, beneficios o experiencias— que la IA elige según la historia y el momento de cada cliente, dentro del presupuesto y los límites que fijó el equipo; el equipo revisa una muestra, y en el sistema queda qué recibió cada uno.",
      }),
    ],
  },
  {
    punto: "§6 · 2.1.O1 · 3.1.O1",
    fuente: "pendiente-9-0",
    tema: T6,
    estado: "parcial",
    resumen: "La IA que hace las tareas repetitivas pasa de Procesos a Tecnología, en Marketing y en Servicio (salen 2.1.O1 y 3.1.O1).",
    ops: [
      retirar("2.1.O1"),
      nuevo(
        "2.2.O",
        "@2.2.O.tareas",
        c(
          "La IA hace las tareas repetitivas de cada campaña —preparar el brief, adaptar las piezas, cargarla en el calendario—, el responsable valida lo que hizo, y en el sistema se ve qué tareas hizo la IA.",
          "comprobable",
        ),
      ),
      retirar("3.1.O1"),
      nuevo(
        "3.2.O",
        "@3.2.O.rutinas",
        c(
          "La IA ejecuta las rutinas repetitivas de la atención, como dar seguimiento a los casos y cerrarlos; el equipo supervisa y resuelve las excepciones, y en el sistema se ve qué hizo la IA y qué revisó una persona.",
          "evaluado",
          { habito: true },
        ),
      ),
    ],
    pregunta: "En Servicio, la IA de las rutinas entró APARTE del agente de IA que resuelve casos, en la misma celda, de forma provisional (el documento dice decidirlo). ¿Va aparte o se junta con él?",
  },

  // ════════════════════════ 7. Lo que ningún criterio pide ════════════════════════
  {
    punto: "§7 · 2.7.F (plan de canales)",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "parcial",
    resumen: "Entra el plan de canales escrito; los criterios de cada canal se leen contra él.",
    ops: [nuevo("2.7.F", "@2.7.F.plan", c("Existe un plan escrito que dice por qué canales sale la empresa y con qué frecuencia sale cada uno.", "declarado"))],
    pregunta:
      "¿Funcional pide además un mínimo de canales (uno para llegar a quien no conoce a la empresa y uno para seguir en contacto con quien ya la conoce)? Solo si reabres la decisión 1, que deja a la empresa elegir sus canales.",
  },
  {
    punto: "§7 · 2.2.F",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "aplicada",
    resumen: "Todo contacto que llega queda registrado el mismo día, venga por donde venga.",
    ops: [nuevo("2.2.F", "@2.2.F.registro", c("Todo contacto que llega, venga por donde venga, queda registrado en el sistema el mismo día.", "comprobable"))],
  },
  {
    punto: "§7 · 2.5.F (mensaje central)",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "pregunta",
    resumen: "El mensaje central escrito se pediría tres veces: hay que elegir un solo lugar.",
    ops: [],
    pregunta:
      "El mensaje central escrito («qué ofrece la empresa, a quién y por qué elegirla») se pediría en Marca, en el documento nuevo de lo que se ofrece de Ventas y en la diferencia de la competencia. ¿En qué lugar se pide, y los demás lo requieren?",
  },
  {
    punto: "§7 · 3.6.F",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "aplicada",
    resumen: "Entra la regla escrita de prioridad de los casos.",
    ops: [nuevo("3.6.F", "@3.6.F.prioridad", c("Está escrito qué hace que un caso sea urgente, alto, normal o bajo, y el equipo lo aplica al asignar la prioridad.", "declarado"))],
  },
  {
    punto: "§7 · 1.7.F5 · 1.7.E (recompra)",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "aplicada",
    resumen: "La recompra tiene Eficiente en la escala general.",
    ops: [nuevo("1.7.E", "@1.7.E.recompra", c("Los recordatorios de recompra salen solos según el ciclo de cada cliente y se mide cuántos vuelven a comprar.", "comprobable", { perfil: "recompra" }))],
  },
  {
    punto: "§7 · 3.6.E2 · Insider 10",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "aplicada-con-redaccion",
    resumen: "Se suman los listos para recomendar (donde el cliente vuelve) y el valor o el nivel de lealtad (Insider 10). Pide más que antes: entra con número nuevo.",
    habilita: "HubSpot (listas activas) e Insider (audiencias predictivas).",
    ops: [
      mover("3.6.E2", "3.6.E", "@3.6.E.momento", {
        texto:
          "Los clientes se segmentan para acciones diferenciadas según el momento de su relación —donde el cliente vuelve, sanos, en riesgo, con potencial de crecer o listos para recomendar; donde compra una vez, por entregar, en garantía o listos para recomendar— y según su valor o su nivel en el programa de lealtad, que cambian la atención y las ofertas.",
      }),
    ],
  },
  {
    punto: "§7 · 3.7.F2 · Inmobiliaria 3.7.F2",
    fuente: "pendiente-9-0",
    tema: T7,
    estado: "parcial",
    resumen: "Entra el contacto antes de cada entrega, donde se entrega por etapas o de forma periódica.",
    ops: [
      nuevo(
        "3.7.F",
        "@3.7.F.entrega",
        c("Si la empresa entrega por etapas o de forma periódica, los clientes clave reciben contacto antes de cada entrega, no después.", "comprobable", { habito: true, requiere: ["3.5.F4"] }),
      ),
    ],
    pregunta: "En Inmobiliaria, el contacto antes de la entrega de la unidad hoy lo cubren dos criterios de Eficiente. ¿Cómo lee la edición el nuevo de Funcional?",
  },

  // ════════════════════════ 8. Criterios que pasan a pedir otra cosa ════════════════════════
  {
    punto: "§8 · 1.6.E2 · Educación 1.6.E2",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "aplicada",
    resumen: "Las cuentas objetivo con responsable y plan de contacto, y los segmentos prioritarios para la venta a personas, en dos criterios nuevos; sale 1.6.E2.",
    ops: [
      retirar("1.6.E2"),
      nuevo("1.6.E", "@1.6.E.cuentas", c("Hay una lista escrita de cuentas objetivo, cada una con su responsable y su plan de contacto.", "comprobable", { perfil: "venta con equipo" })),
      nuevo("1.6.E", "@1.6.E.segmentos", c("Los segmentos prioritarios están escritos y cada uno tiene su plan de contacto.", "comprobable", { perfil: "venta con equipo" })),
    ],
  },
  { punto: "§8 · 1.5.F5", fuente: "pendiente-9-0", tema: T8, estado: "aplicada", resumen: "Sale la marca «venta sin vendedor»: el «Si se vende por más de un canal» ya lo condiciona.", ops: [editar("1.5.F5", { perfil: null })] },
  {
    punto: "§8 · 2.5.E5",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "aplicada",
    resumen: "La reseña se le pide a cada cliente (sale y entra con otro número).",
    ops: [
      mover("2.5.E5", "2.5.E", "@2.5.E.resenas", {
        texto: "Se le pide una reseña pública a cada cliente después de la compra o la entrega, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo.",
      }),
    ],
  },
  {
    punto: "§8 · 2.1.E2",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "aplicada",
    resumen: "La revisión de cada pieza queda registrada contra una lista escrita (sale y entra con otro número).",
    ops: [mover("2.1.E2", "2.1.E", "@2.1.E.revision", { texto: "Cada pieza pasa por una revisión con lista escrita y una aprobación registrada.", verificacion: "comprobable" })],
  },
  {
    punto: "§8 · 3.5.E1",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "aplicada",
    resumen: "Usar las respuestas guardadas pasa a Funcional; Eficiente queda con la guía y el tono.",
    ops: [mover("3.5.E1", "3.5.F", "@3.5.F.respuestas", { texto: "Los agentes usan las respuestas guardadas para los casos frecuentes." })],
  },
  {
    punto: "§8 · 2.6.F1",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "aplicada",
    resumen: "Los segmentos salen de los buyer personas (sale y entra con otro número; quien lo requería pasa al nuevo).",
    ops: [
      mover("2.6.F1", "2.6.F", "@2.6.F.segmentos", {
        texto: "Existen al menos 2 segmentos con criterios escritos que salen de los buyer personas —qué necesita o cómo decide cada grupo—, no solo de dónde está.",
        requiere: ["2.5.F3"],
      }),
    ],
  },
  {
    punto: "§8 · 2.7.F3 · las cuatro ediciones",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "parcial",
    resumen: "La pauta se mide en el último trimestre, no el día que se mide (sale y entra con otro número).",
    ops: [
      mover("2.7.F3", "2.7.F", "@2.7.F.pauta", {
        texto: "Si la pauta pagada es parte del plan de canales, en el último trimestre corrió al menos una campaña con presupuesto definido.",
      }),
    ],
    pregunta: "En Educación la pauta se mide «en el último período de admisión». Falta reescribirlo en la edición, junto con lo que cada edición decía del criterio viejo.",
  },
  {
    punto: "§8 · 1.7.F5 · Educación 1.7.F5",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "aplicada-con-redaccion",
    resumen: "El plazo de recompra está escrito por tipo de cliente (sale y entra con otro número).",
    ops: [
      mover("1.7.F5", "1.7.F", "@1.7.F.recompra", {
        texto:
          "Los clientes identificados que ya deberían haber vuelto a comprar, según el plazo de recompra que está escrito para cada tipo de cliente, se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos.",
      }),
    ],
  },
  {
    punto: "§8 · Ecommerce 2.4.E3",
    fuente: "pendiente-9-0",
    tema: T8,
    estado: "pregunta",
    resumen: "El acuerdo de Marketing con quien vende y con la posventa en una tienda sin vendedores.",
    ops: [],
    pregunta: "En Ecommerce, ¿preparar el calendario de promociones con quien opera la venta y con la posventa cuenta también sin vendedores? (el acuerdo de Marketing con Ventas salió de la escala general: ver el tema 3).",
  },

  // ════════════════════════ 9. Señales ════════════════════════
  {
    punto: "§9 · 3.1.I",
    fuente: "pendiente-9-0",
    tema: T9,
    estado: "aplicada",
    resumen: "Señal nueva: el equipo se reúne cuando puede.",
    ops: [nuevo("3.1.I", "@3.1.I.reuniones", c("El equipo se reúne cuando puede, sin una fecha fija, y las reuniones se cancelan cuando hay mucho trabajo.", "declarado"))],
  },
  {
    punto: "§9 · 3.4.I",
    fuente: "pendiente-9-0",
    tema: T9,
    estado: "parcial",
    resumen: "Señal nueva: los roles se reparten de palabra.",
    ops: [nuevo("3.4.I", "@3.4.I.roles", c("Los roles se reparten de palabra: cada uno sabe más o menos qué le toca, pero no está escrito.", "evaluado"))],
    pregunta: "La señal de los roles de palabra entra como nueva. ¿Se retira una de las dos señales de números de Inicial de Servicio, que dicen casi lo mismo?",
  },
  {
    punto: "§9 · 1.5.D · 1.5.I (venta sin vendedor)",
    fuente: "pendiente-9-0",
    tema: T9,
    estado: "aplicada-con-redaccion",
    resumen: "Señal baja para la tienda con precios distintos según el canal, sin que sea a propósito.",
    ops: [
      nuevo(
        "1.5.I",
        "@1.5.I.canales",
        c("Los precios, las promociones o las condiciones cambian según el canal sin que sea a propósito: el comprador encuentra en el sitio algo distinto de lo que ve en la tienda.", "comprobable", {
          perfil: "venta sin vendedor",
        }),
      ),
    ],
  },
  { punto: "§9 · Ecommerce 1.2.I2 · 1.2.I101", fuente: "pendiente-9-0", tema: T9, estado: "aplicada", resumen: "Sale 1.2.I101 de Ecommerce: la general 1.2.I2 ya lo dice.", ops: [{ op: "edicion-retirar-propio", edicion: "ecommerce-retail", id: "1.2.I101" }] },
  {
    punto: "§9 · Ecommerce 1.7.I101",
    fuente: "pendiente-9-0",
    tema: T9,
    estado: "aplicada",
    resumen: "La señal de Inicial de los recordatorios, la frase de Inicial de 1.7 y el vistazo de Inicial del Área 1 dicen lo mismo: salen a mano.",
    ops: [
      { op: "edicion-retirar-propio", edicion: "ecommerce-retail", id: "1.7.I101" },
      { op: "edicion-propio", edicion: "ecommerce-retail", nivel: "1.7.I", alias: "@ecommerce.1.7.I.mano", campos: c("Los recordatorios de carrito salen a mano o cuando alguien se acuerda, no cada vez que se abandona uno.", "comprobable") },
      { op: "edicion-frase", edicion: "ecommerce-retail", nivel: "1.7.I", frase: "Hay recordatorios, pero salen a mano y por un solo canal." },
      {
        op: "edicion-panoramica",
        edicion: "ecommerce-retail",
        area: "1",
        letra: "I",
        texto: "Tienes la tienda armada, pero cada canal va por su cuenta. Los pedidos entran a medias al sistema, los reportes se arman a mano y los recordatorios, si salen, salen a mano.",
      },
    ],
  },
  {
    punto: "§9 · 3.3.D1 · Educación 3.3.D1",
    fuente: "pendiente-9-0",
    tema: T9,
    estado: "pregunta",
    resumen: "La medición de tiempos y satisfacción quedó sin señal en Deficiente.",
    ops: [],
    pregunta: "La señal «No hay medición fiable de tiempos ni satisfacción» salió en la 8.8. ¿Vuelve como señal propia de Deficiente en Datos de Servicio?",
  },

  // ════════════════════════ 10. Datos en sistemas sin conectar ════════════════════════
  {
    punto: "§10 · 2.2.E · 3.2.E",
    fuente: "pendiente-9-0",
    tema: T10,
    estado: "aplicada",
    resumen: "Marketing y Servicio piden integrar el sistema donde nacen o viven los datos del cliente (el de Servicio entró con el tema 1, porque lo requiere lo que ha pagado).",
    ops: [
      nuevo(
        "2.2.E",
        "@2.2.E.integracion",
        c(
          "Si los contactos nacen o viven en otro sistema —una plataforma de la industria, la tienda, un ERP—, ese sistema está integrado con el de marketing y los datos pasan solos, sin cargarlos a mano.",
          "comprobable",
        ),
      ),
    ],
  },

  // ════════════════════════ 11. Duplicados y calidad de datos ════════════════════════
  {
    punto: "§11 · 3.3.F (duplicados)",
    fuente: "pendiente-9-0",
    tema: T11,
    estado: "parcial",
    resumen: "Servicio controla los duplicados (riesgo, en la fila de duplicados de la tabla de riesgos), con su señal de Inicial.",
    ops: [
      nuevo(
        "3.3.F",
        "@3.3.F.duplicados",
        c("Los duplicados —el mismo cliente en dos o más fichas— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y la historia de cada cliente queda en una sola ficha.", "comprobable", {
          riesgo: true,
          habito: true,
        }),
      ),
      nuevo(
        "3.3.I",
        "@3.3.I.fichas",
        c("No hay una regla de cuándo se revisan las fichas: los clientes repetidos se unen a mano cuando alguien los nota, y la historia de un mismo cliente queda repartida en varias fichas.", "comprobable"),
      ),
      { op: "riesgo", ids: ["@3.3.F.duplicados"], criterio: "Los duplicados se revisan y se unen cada trimestre" },
    ],
    pregunta:
      "Falta que las ediciones reescriban el control de duplicados de Servicio (Ecommerce: invitado y con cuenta; Banca: una ficha por producto; Educación: aspirante y estudiante; Inmobiliaria: el mismo comprador en dos proyectos).",
  },
  {
    punto: "§11 · 1.4.O · 3.4.O (responsables de los datos)",
    fuente: "pendiente-9-0",
    tema: T11,
    estado: "aplicada",
    resumen: "Ventas y Servicio tienen responsables de la calidad de los datos, como Marketing.",
    ops: [
      nuevo("1.4.O", "@1.4.O.datos", c("Hay responsables de cuidar la calidad de los datos de ventas: está por escrito quién corrige cada dato y cada cuánto se revisa.", "declarado")),
      nuevo("3.4.O", "@3.4.O.datos", c("Hay responsables de cuidar la calidad de los datos de los clientes: está por escrito quién corrige cada dato y cada cuánto se revisa.", "declarado")),
    ],
  },
  {
    punto: "§11 · 2.3.E3 · 1.3.E2",
    fuente: "pendiente-9-0",
    tema: T11,
    estado: "aplicada",
    resumen: "La unión de duplicados de fábrica ya no alcanza: piden reglas del equipo, también para la misma persona con otro correo (los dos salen y entran con otro número).",
    ops: [
      mover("1.3.E2", "1.3.E", "@1.3.E.duplicados", { texto: "Los duplicados se detectan y se unen solos con reglas que definió el equipo, también los de la misma persona con otro correo o sin correo." }),
      mover("2.3.E3", "2.3.E", "@2.3.E.duplicados", { texto: "Los duplicados se detectan y se unen solos con reglas que definió el equipo, también los de la misma persona con otro correo o sin correo." }),
    ],
  },

  // ════════════════════════ 12. Suplantación ════════════════════════
  {
    punto: "§12 · 2.5 (suplantación)",
    fuente: "pendiente-9-0",
    tema: T12,
    estado: "pregunta",
    resumen: "Decirle al cliente desde dónde le escribe la empresa: el documento deja dos niveles.",
    ops: [],
    pregunta:
      "«Si la empresa cobra o pide datos personales por canales digitales, le dice al cliente desde qué números, perfiles y correos le escribe, a qué cuentas se le paga y qué nunca le va a pedir» ¿entra como riesgo de Funcional o como criterio de Eficiente? (y la regla deja de decir «en las ediciones que la piden»).",
  },
  {
    punto: "§12 · Banca 2.5.D · 2.5.I",
    fuente: "pendiente-9-0",
    tema: T12,
    estado: "aplicada",
    resumen: "Banca tiene señales bajas de fraude.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "banca",
        nivel: "2.5.D",
        alias: "@banca.2.5.D.fraude",
        campos: c("El cliente no tiene cómo saber si un mensaje que dice ser de la entidad es de verdad: la entidad no publica por qué canales escribe ni qué nunca le va a pedir.", "comprobable"),
      },
      {
        op: "edicion-propio",
        edicion: "banca",
        nivel: "2.5.I",
        alias: "@banca.2.5.I.rincon",
        campos: c("Los canales oficiales y lo que la entidad nunca pide están publicados solo en un rincón del sitio: no se repiten donde el cliente recibe los mensajes.", "comprobable"),
      },
    ],
  },
  {
    punto: "§12 · Banca 1.2.F · 3.2",
    fuente: "pendiente-9-0",
    tema: T12,
    estado: "aplicada",
    resumen: "En Banca, los ejecutivos escriben solo desde canales oficiales; en la general, el contacto por WhatsApp o teléfono sale de canales verificados (riesgo).",
    ops: [
      {
        op: "edicion-propio",
        edicion: "banca",
        nivel: "1.2.F",
        alias: "@banca.1.2.F.oficiales",
        campos: c("Los ejecutivos le escriben al cliente solo desde los números, perfiles y correos que la entidad publica como oficiales, no desde su teléfono personal.", "evaluado", {
          habito: true,
          perfil: "venta con equipo",
        }),
      },
      nuevo("3.2.F", "@3.2.F.verificados", c("Si el equipo contacta clientes por WhatsApp o teléfono, lo hace desde canales verificados de la empresa y nunca pide claves ni códigos.", "comprobable", { riesgo: true })),
      {
        op: "riesgo",
        ids: ["@3.2.F.verificados"],
        criterio: "El equipo escribe desde canales verificados y nunca pide claves",
        mensaje:
          "Si tu equipo les escribe a tus clientes desde números personales o les pide claves, una estafa que te imita se ve igual que tú: ellos pierden su dinero y tú, su confianza.",
      },
    ],
    pregunta: "El mensaje de riesgo del contacto desde canales verificados es redacción de Claude: el documento no lo traía. ¿Te sirve?",
  },
  {
    punto: "§12 · 3.1.F (verificar la identidad)",
    fuente: "pendiente-9-0",
    tema: T12,
    estado: "parcial",
    resumen: "Servicio verifica la identidad antes de atender cambios en cuentas, pagos, envíos o datos personales (riesgo).",
    ops: [
      nuevo(
        "3.1.F",
        "@3.1.F.identidad",
        c(
          "Si el área atiende cambios en cuentas, pagos, envíos o datos personales, verifica la identidad del cliente con los pasos que define el proceso antes de atenderlos, y queda registrado en el caso.",
          "comprobable",
          { riesgo: true, habito: true },
        ),
      ),
      {
        op: "riesgo",
        ids: ["@3.1.F.identidad"],
        criterio: "Se verifica la identidad antes de atender un cambio",
        mensaje: "Cualquiera que diga ser tu cliente puede pedir un cambio en su cuenta: un fraude le cuesta su dinero al cliente y a ti, su confianza.",
      },
    ],
    pregunta: "Falta que Ecommerce, Educación e Inmobiliaria reescriban la verificación de identidad; Banca la lee con su criterio propio de identidad.",
  },

  // ════════════════════════ 13. Permiso de contacto ════════════════════════
  {
    punto: "§13 · 1.3.F · 3.3.F · 2.3.F7 · Insider 1",
    fuente: "pendiente-9-0",
    tema: T13,
    estado: "aplicada",
    resumen: "El permiso de contacto se ve en las tres áreas (riesgo), y el de Marketing se registra por canal y se respeta en cada envío (Insider 1: pide más que antes, entra con número nuevo).",
    habilita: "HubSpot (suscripción por canal) e Insider.",
    ops: [
      mover("2.3.F7", "2.3.F", "@2.3.F.permiso", { texto: "El permiso de cada contacto está registrado por canal —correo, SMS, WhatsApp, notificaciones— y se respeta en cada envío." }),
      nuevo("1.3.F", "@1.3.F.permiso", c("Las personas a las que el equipo les escribe por WhatsApp o por correo aceptaron que les escriban.", "comprobable", { riesgo: true })),
      nuevo("3.3.F", "@3.3.F.permiso", c("Cada cliente tiene registrado su permiso para recibir mensajes por cada canal, y los avisos lo respetan.", "comprobable", { riesgo: true })),
      { op: "riesgo", ids: ["@1.3.F.permiso", "@3.3.F.permiso"], criterio: "Las personas aceptaron que les escriban" },
    ],
  },
  {
    punto: "§13 · Educación 2.3.F301 · 3.7.F",
    fuente: "pendiente-9-0",
    tema: T13,
    estado: "parcial",
    resumen: "En Educación, el permiso del responsable de un menor decide Funcional en Marketing y en Servicio.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "educacion",
        nivel: "2.3.F",
        alias: "@educacion.2.3.F.menores",
        campos: c("Si el interesado es menor de edad, queda registrado el permiso de su responsable para que Marketing lo contacte, también cuando se registró en una feria o en una charla en su colegio.", "comprobable"),
      },
      {
        op: "edicion-propio",
        edicion: "educacion",
        nivel: "3.7.F",
        alias: "@educacion.3.7.F.menores",
        campos: c("Si la institución atiende a menores de edad, el contacto que el equipo inicia con el estudiante o su familia cuenta con el permiso que exige la ley, registrado en su ficha.", "comprobable"),
      },
    ],
    pregunta:
      "En Banca, ¿el permiso decide Funcional con un criterio propio sin la marca riesgo, o el de Marketing pasa a decidir? Hoy un criterio de Banca que decide requiere uno de riesgo. Y en Educación, el permiso de Admisiones (su criterio propio de Funcional) se queda y falta redactarlo igual que el riesgo nuevo de Ventas.",
  },

  // ════════════════════════ 14. Celdas desbalanceadas ════════════════════════
  {
    punto: "§14 · 1.1.E · 1.2.F · 1.5.E · 1.7.E · 1.3.F · 1.5.O · 2.8.F · 2.1.E · 2.2.E · 2.6.F · 2.3.F · 3.5.O · 3.6.E · 3.7.F · 3.7.E · 3.8.F",
    fuente: "pendiente-9-0",
    tema: T14,
    estado: "despues-de-la-prueba",
    resumen: "Las celdas con uno o con ocho criterios se balancean con lo que muestre la prueba (decisión 13). Este borrador ya suma criterios en varias de ellas.",
    ops: [],
    pregunta:
      "Después de la prueba: la meta es de 3 a 5 criterios por celda de Funcional. Quedan propuestos un criterio nuevo en Óptimo de Propuesta (la IA arma las propuestas y una persona las aprueba) y otro en Funcional de Medición de Marketing (cada campaña sale con una meta escrita).",
  },

  // ════════════════════════ 15. Nombres de dimensiones ════════════════════════
  {
    punto: "§15 · x.6",
    fuente: "pendiente-9-0",
    tema: T15,
    estado: "texto-pendiente",
    resumen: "La dimensión general pasa a llamarse «Priorización».",
    ops: [],
    pregunta: "Falta cambiar el nombre general de la dimensión 6 a «Priorización» en la tabla de la Parte 4 y en «Las ocho dimensiones», y en las semillas de documentación que la nombran.",
  },
  {
    punto: "§15 · Ecommerce 3.8 · Banca 3.8",
    fuente: "pendiente-9-0",
    tema: T15,
    estado: "pregunta",
    resumen: "«Autoservicio» borra el aprendizaje.",
    ops: [],
    pregunta: "En Ecommerce y Banca, la dimensión 8 de Servicio ¿se llama «Autoservicio y aprendizaje», como en Educación, o vuelve al nombre general, «Escalabilidad del Servicio»?",
  },

  // ════════════════════════ 16. Ediciones por industria ════════════════════════
  {
    punto: "§16 · Regla nueva: cambiar solo para un perfil",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "Permitir en las ediciones «No aplica en tal perfil»: toca el lector y la especificación.",
    ops: [],
    pregunta:
      "¿Las ediciones pueden decir «No aplica en tal perfil» y «en los demás perfiles se lee como en la general»? Toca el lector y la especificación; en Ecommerce, las reescrituras del pipeline, la cadencia y la meta pasan a ser solo de la venta sin vendedor.",
  },
  {
    punto: "Insider 11 · 3.7.E5",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "La información antes de los momentos clave sale disparada por el evento y en el canal que el cliente prefiere.",
    habilita: "HubSpot (flujos por fecha) e Insider (canal de cada persona).",
    ops: [
      mover("3.7.E5", "3.7.E", "@3.7.E.eventos", {
        texto:
          "Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —una entrega, un trámite, un vencimiento—; sale sola, disparada por el evento y en el canal que el cliente prefiere, no cuando alguien se acuerda.",
      }),
    ],
  },
  {
    punto: "§16 · Registro de equivalencias · Banca 3.7.E5",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "parcial",
    resumen: "En Banca, el aviso antes de cada cobro vive solo en su criterio propio; 3.7.E5 se lee con los demás momentos clave (y con la parte de Insider 11).",
    ops: [
      {
        op: "edicion-reescrito",
        edicion: "banca",
        id: "@3.7.E.eventos",
        texto:
          "Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los demás momentos clave de su relación —el vencimiento de un certificado, la renovación de su tarjeta, un cambio en las condiciones de su producto—; sale sola, disparada por el evento y en el canal que el cliente prefiere, no cuando alguien se acuerda.",
      },
    ],
    pregunta: "Falta el registro de qué práctica va en qué dimensión y nivel en cada edición (los avisos al cliente); lo que aparece en tres ediciones sube a la general.",
  },
  {
    punto: "§16 · 2.3.E1 en las cuatro",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "Completar los datos con terceros donde se le vende a personas.",
    ops: [],
    pregunta:
      "Completar los datos con servicios de terceros ¿cuenta también con lo que traen los sistemas propios (la tienda, la caja, la facturación), en la escala general? Y si es de Datos o de Tecnología. Después, Banca, Educación e Inmobiliaria lo cambian por uno propio con datos propios y con permiso.",
  },
  {
    punto: "§16 · Regla nueva: el aprendizaje vive en x.8",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "texto-pendiente",
    resumen: "Revisar las ediciones con la regla de que medir y corregir es de la dimensión de aprendizaje.",
    ops: [],
    pregunta: "Falta revisar las seis ediciones y llevar a la dimensión de aprendizaje, con número nuevo, lo que mide y corrige (por ejemplo, Ecommerce 1.1.E101).",
  },
  {
    punto: "§16 · Ecommerce 1.5.E102 · 1.8.F2 · 1.8.F101",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "La razón de una devolución se pide en varias dimensiones.",
    ops: [],
    pregunta: "En Ecommerce, ¿el registro de la razón de una devolución queda solo en Aprendizaje (con la lista de motivos de la general), y lo demás lo requiere?",
  },
  {
    punto: "§16 · Ecommerce 3.4.E101",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "aplicada",
    resumen: "La posventa le devuelve a quien publica los productos lo que se repite en los casos.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "ecommerce-retail",
        nivel: "3.4.E",
        alias: "@ecommerce.3.4.E.productos",
        campos: c(
          "La posventa le pasa al equipo que publica los productos, al menos una vez por mes, lo que se repite en los casos —un producto que falla, una talla que no calza, una foto que confunde—, y queda registrado qué se corrigió en la ficha o en el producto.",
          "declarado",
          { habito: true },
        ),
      },
    ],
  },
  {
    punto: "§16 · Banca 1.7.F201",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "Repite 1.7.F1.",
    ops: [],
    pregunta: "En Banca, ¿se retira la solicitud a medias en un canal digital (la dice ya el plazo de cada etapa), o queda solo para la venta sin vendedor?",
  },
  {
    punto: "§16 · Banca 1.6.F",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "aplicada-con-redaccion",
    resumen: "En la colocación solo digital, Funcional de 1.6 tiene un criterio propio, y la precalificación automática lo requiere (cambiar requeridos no cambia el cálculo: conserva su número).",
    ops: [
      {
        op: "edicion-propio",
        edicion: "banca",
        nivel: "1.6.F",
        alias: "@banca.1.6.F.condiciones",
        campos: c("Las condiciones básicas de cada producto están escritas y el canal digital las aplica antes de pedirle documentos al cliente.", "comprobable", { perfil: "venta sin vendedor" }),
      },
      { op: "edicion-editar-propio", edicion: "banca", id: "1.6.E201", cambios: { requiere: ["1.6.F2", "@banca.1.6.F.condiciones"] } },
    ],
  },
  {
    punto: "§16 · Educación 1.7.F301 · 1.7.F302",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "parcial",
    resumen: "En Educación, el plazo de cada etapa nombra al admitido sin matricular y la solicitud a medias (partido como la general); sale 1.7.F301.",
    ops: [
      {
        op: "edicion-reescrito",
        edicion: "educacion",
        id: "1.7.F1",
        texto:
          "Para cada etapa de la admisión está definido cuánto tiempo sin avance vuelve detenido a un aspirante —sin respuesta, sin documentos, sin pago, admitido sin matricular o con la solicitud a medias en línea—, y los detenidos se reconocen a tiempo.",
      },
      { op: "edicion-reescrito", edicion: "educacion", id: "@1.7.F.reactivacion", texto: "Los aspirantes detenidos tienen un paso acordado para retomarlos, no la improvisación de cada asesor." },
      { op: "edicion-retirar-propio", edicion: "educacion", id: "1.7.F301" },
    ],
    pregunta: "La solicitud a medias en línea de Educación sigue como criterio propio: se retira solo si la regla de cambiar para un perfil lo permite (hoy otro criterio lo requiere).",
  },
  {
    punto: "§16 · Educación 1.3.E1",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "La vara del pronóstico donde la matrícula entra por períodos.",
    ops: [],
    pregunta:
      "En Educación, ¿cómo se lee el ±10% del pronóstico donde la matrícula entra por períodos, y es sobre el total? Por ejemplo: «en al menos dos de los últimos tres cierres de matrícula, la matrícula total quedó dentro de ±10% de lo proyectado».",
  },
  {
    punto: "§16 · Inmobiliaria 1.7.F401",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "aplicada",
    resumen: "En Inmobiliaria, la cadencia incluye el seguimiento después de cada visita; sale 1.7.F401.",
    ops: [
      {
        op: "edicion-reescrito",
        edicion: "inmobiliaria",
        id: "@1.1.F.cadencia",
        texto: "Hay una cadencia de contacto definida —cuántos intentos y en cuántos días, y el seguimiento después de cada visita— y se cumple con la mayoría de los interesados nuevos.",
      },
      { op: "edicion-retirar-propio", edicion: "inmobiliaria", id: "1.7.F401" },
    ],
  },
  {
    punto: "§16 · Inmobiliaria 1.8 · 3.4.E4 (promesa y desistimiento)",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "El comprador que firma la promesa y desiste antes de escriturar.",
    ops: [],
    pregunta:
      "En Inmobiliaria, ¿la venta se gana con la promesa firmada o con la escritura? Con eso entran la razón de cada promesa desistida (Aprendizaje) y las señales de que un comprador puede desistir (Proactividad, o Tracción si va mejor con Ventas).",
  },
  {
    punto: "§16 · Inmobiliaria: encabezado y alquileres",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "pregunta",
    resumen: "Las administradoras de alquileres son de relación continua.",
    ops: [],
    pregunta:
      "¿La edición de Inmobiliaria dice que una administradora de alquileres es de relación continua y suma sus criterios propios (mantenimiento con plazos, contacto antes de la renovación del contrato, entrega y devolución con inventario) y «Comprador o inquilino» en la tabla de palabras?",
  },
  {
    punto: "§16 · Inmobiliaria 1.1.E1",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "aplicada",
    resumen: "En Inmobiliaria, indagar antes de mostrar una unidad es un criterio propio de Funcional.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "inmobiliaria",
        nivel: "1.1.F",
        alias: "@inmobiliaria.1.1.F.indaga",
        campos: c("Antes de mostrar una unidad, el asesor indaga qué busca el cliente, cómo va a pagar y quién decide, y lo deja registrado en el CRM.", "comprobable"),
      },
    ],
  },
  {
    punto: "§16 · Inmobiliaria 2.5.F (corredoras y alquileres)",
    fuente: "pendiente-9-0",
    tema: T16,
    estado: "aplicada",
    resumen: "Las corredoras publican la ficha completa de cada inmueble.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "inmobiliaria",
        nivel: "2.5.F",
        alias: "@inmobiliaria.2.5.F.ficha",
        campos: c("Si la empresa vende o alquila inmuebles de terceros, cada inmueble publicado tiene su ficha completa en el sitio o en los portales —fotos, plano o medidas, ubicación, precio y condiciones—.", "comprobable"),
      },
    ],
  },

  // ════════════════════════ 17. Cálculo y especificación ════════════════════════
  {
    punto: "§17 · especificación (pasos 3 y 6, el chequeo, el salto final, «Qué se emite», el ejemplo de 1.6)",
    fuente: "pendiente-9-0",
    tema: T17,
    estado: "despues-de-la-prueba",
    resumen: "Lo del cálculo va con una versión nueva de la especificación, no con la escala.",
    ops: [],
    pregunta:
      "Después de la prueba, en la especificación: el puntaje debajo de Funcional (los 20 puntos entre Deficiente e Inicial), una tabla fija para el chequeo con una pregunta que destape los riesgos de Datos, preguntar la variante junto con la industria, el tramo de 80 a 99 que no se usa, el «cumple 27 de 30» si la prueba lo pide, y rehacer el ejemplo de Priorización de Leads (sus criterios cambian en este borrador) para que la prueba 3 vuelva a cuadrar.",
  },

  // ════════════════════════ Insider: los demás cambios ════════════════════════
  {
    punto: "Insider 2 · 2.3.E4",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "Lo que la persona hace en el sitio o la app queda en su ficha, también lo de antes de dejar sus datos.",
    habilita: "HubSpot (visitas y eventos; une lo anterior al identificarse) e Insider (todos los eventos).",
    ops: [
      mover("2.3.E4", "2.3.E", "@2.3.E.comportamiento", {
        texto: "Lo que la persona hace en el sitio o la app —qué visita, busca, abandona, compra o reserva— queda en su ficha, también lo que hizo antes de dejar sus datos, que se une al identificarse.",
      }),
    ],
  },
  {
    punto: "Insider 3 · 2.6.E4",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "La segmentación por comportamiento se actualiza sola.",
    habilita: "HubSpot (listas activas) e Insider.",
    ops: [mover("2.6.E4", "2.6.E", "@2.6.E.comportamiento", { texto: "La segmentación usa datos de comportamiento —qué abrió, qué visitó, qué compró—, no solo lo que la persona declaró, y los segmentos se actualizan solos." })],
  },
  {
    punto: "Insider 5 · 2.8.E1",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "Cada prueba A/B tiene su hipótesis escrita y su resultado registrado.",
    habilita: "HubSpot (correos y páginas) e Insider (cada canal).",
    ops: [mover("2.8.E1", "2.8.E", "@2.8.E.pruebas", { texto: "Hay pruebas A/B regulares —al menos una activa por mes—, cada una con su hipótesis escrita y su resultado registrado." })],
  },
  {
    punto: "Insider 6 · 2.8.O3 (tráfico suficiente)",
    fuente: "insider",
    tema: TI,
    estado: "pregunta",
    resumen:
      "El más importante: cada recorrido y cada campaña se miden por el ingreso que agregan contra un grupo de control, donde hay tráfico suficiente. No entra todavía: así redactado es un Óptimo que se cumple sin IA.",
    habilita: "Insider (grupo de control nativo); en HubSpot lo monta Smarteam.",
    ops: [],
    pregunta:
      "Medir cada recorrido y cada campaña contra un grupo de control (" +
      `«${SI_HAY_TRAFICO} cada recorrido y cada campaña se miden por el ingreso que agregan contra un grupo de control que no los recibe, por recorrido y en general, y con eso se decide qué escalar y qué apagar»` +
      ") hoy reemplazaría al Óptimo de Aprendizaje de Marketing, que mide contra un grupo de control lo que decide la IA. Así redactado se cumple sin IA (decisión 9). ¿Entra en Eficiente con número nuevo, o se le escribe qué hace la IA y quién valida? Entre donde entre, lleva la marca «tráfico suficiente» (la tercera pregunta del perfil, N4) en vez del «Si…» del texto.",
  },
  {
    punto: "Insider 7 · 2.2.O2",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "Lo que la persona responde a los agentes de IA alimenta su ficha.",
    habilita: "HubSpot (Customer Agent) e Insider (Agent One).",
    ops: [
      mover("2.2.O2", "2.2.O", "@2.2.O.ficha", {
        texto:
          "Si la empresa atiende por un canal conversacional, agentes de IA responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para comprar —o para hablar con un vendedor, donde los hay—, y lo que la persona responde alimenta su ficha; lo que no pueden resolver pasa a una persona con la conversación completa, y en el sistema queda cada conversación que atendió la IA.",
      }),
    ],
  },
  {
    punto: "Insider 8 · 2.2.O (operar con agentes de IA)",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "El equipo crea segmentos y recorridos en palabras y consulta los resultados en lenguaje natural; una persona aprueba antes de publicar.",
    habilita: "HubSpot (Breeze) e Insider (Agent One).",
    ops: [
      nuevo(
        "2.2.O",
        "@2.2.O.palabras",
        c("El equipo crea segmentos y recorridos describiéndolos en palabras y consulta los resultados en lenguaje natural; una persona aprueba antes de publicar.", "comprobable"),
      ),
    ],
  },
  {
    punto: "Insider 12 · Ecommerce 1.6.O101 (tráfico suficiente)",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "La tienda personaliza también a quien todavía no dejó sus datos, donde hay tráfico suficiente.",
    habilita: "Insider (HubSpot no personaliza al anónimo por lo que hace).",
    ops: [
      {
        op: "edicion-mover-propio",
        edicion: "ecommerce-retail",
        id: "1.6.O101",
        nivel: "1.6.O",
        alias: "@ecommerce.1.6.O.anonimo",
        cambios: {
          texto: `${SI_HAY_TRAFICO} la IA decide qué mostrarle a cada comprador —productos, orden y oferta— en tiempo real, según su comportamiento y también a quien todavía no dejó sus datos, dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa.`,
        },
      },
    ],
  },
  {
    punto: "Insider 13 · Ecommerce 1.7.E",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "El aviso de disponibilidad o de baja de precio.",
    habilita: "Insider.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "ecommerce-retail",
        nivel: "1.7.E",
        alias: "@ecommerce.1.7.E.aviso",
        campos: c("Quien mostró interés en un producto agotado o caro recibe solo el aviso cuando vuelve a haber o cuando baja de precio.", "comprobable"),
      },
    ],
  },
  {
    punto: "Insider 14 · Turismo 1.6.O (tráfico suficiente)",
    fuente: "insider",
    tema: TI,
    estado: "aplicada-con-redaccion",
    resumen: "El sitio y el motor de reservas personalizan también al viajero que no dejó sus datos, donde hay tráfico suficiente; como Óptimo, dice qué decide la IA y que el equipo lo revisa (como su par de Ecommerce).",
    habilita: "Insider.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "turismo",
        nivel: "1.6.O",
        alias: "@turismo.1.6.O.motor",
        campos: c(
          `${SI_HAY_TRAFICO} la IA decide qué mostrarle a cada viajero en el sitio y el motor de reservas, aunque no haya dejado sus datos —destinos, fechas y tarifas, según lo que buscó—, dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa.`,
          "comprobable",
        ),
      },
    ],
  },
  {
    punto: "Insider 15 · Turismo 1.7.F",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "Las búsquedas y las reservas a medias reciben un recordatorio automático por al menos dos canales.",
    habilita: "Insider; HubSpot si el motor de reservas le manda el evento.",
    ops: [
      {
        op: "edicion-propio",
        edicion: "turismo",
        nivel: "1.7.F",
        alias: "@turismo.1.7.F.medias",
        campos: c(
          "Las búsquedas y las reservas que el viajero deja a medias en el sitio o el motor de reservas reciben un recordatorio automático, por al menos dos canales, dentro del plazo acordado.",
          "comprobable",
          { habito: true, perfil: "venta sin vendedor" },
        ),
      },
    ],
  },
  {
    punto: "Insider 16 · Turismo 3.7.E501",
    fuente: "insider",
    tema: TI,
    estado: "aplicada",
    resumen: "El aviso antes de salir cubre también un cambio de vuelo o de horario.",
    habilita: "Insider y HubSpot.",
    ops: [
      {
        op: "edicion-mover-propio",
        edicion: "turismo",
        id: "3.7.E501",
        nivel: "3.7.E",
        alias: "@turismo.3.7.E.vuelo",
        cambios: {
          texto:
            "Si el clima, un cierre de carretera, un cambio de un proveedor o un cambio de vuelo o de horario afecta un viaje ya reservado, el viajero recibe el aviso y sus opciones antes de salir hacia el destino, no al llegar.",
        },
      },
    ],
  },
  {
    punto: "Insider · los «Ajuste» que suben la vara",
    fuente: "insider",
    tema: TI,
    estado: "pregunta",
    resumen: "El plan de Insider marca varios cambios como «Ajuste (mismo identificador)», pero piden más que antes: entraron con número nuevo, por la regla de la escala.",
    habilita: "—",
    ops: [],
    pregunta:
      "El plan de Insider marcaba como «Ajuste (mismo identificador)» el permiso por canal, lo de antes de dejar los datos, los segmentos que se actualizan solos, los tres canales en un recorrido, las pruebas con hipótesis, los agentes que alimentan la ficha, los segmentos de valor y lealtad, los avisos por evento y, en las ediciones, la personalización de Ecommerce y el aviso de Turismo. Como piden más que antes, el borrador les dio número nuevo (la regla de la escala: un criterio que cambia de lo que mide entra con otro número; con el mismo, la misma empresa con la misma evidencia podría quedar en otro nivel sin que se note). ¿Conservan el número?",
  },
  {
    punto: "Insider · la lectura «Preparación para engagement avanzado»",
    fuente: "insider",
    tema: TI,
    estado: "aplicada-con-redaccion",
    resumen: "La lectura entra en la Parte 2: no cambia el nivel, tiene tres estados y no nombra herramientas.",
    habilita: "La lee la exploración de la preventa y el diagnóstico (N6); no nombra a Insider.",
    ops: [
      {
        op: "prosa-agregar",
        parte: "Parte 2",
        bloques: [
          { tipo: "titulo", nivel: 2, texto: "Preparación para engagement avanzado" },
          {
            tipo: "parrafo",
            texto:
              "Es una lectura aparte, para las empresas que le venden a personas (o a personas y a empresas) con una relación digital recurrente. No cambia el nivel: dice si la empresa está lista para personalizar a cada persona en todos sus canales y medir cuánto agrega eso contra un grupo de control.",
          },
          {
            tipo: "lista",
            items: [
              `**Lista.** Cumple el perfil, tiene tráfico suficiente (por ahora, ${UMBRAL_DE_TRAFICO}; umbral por validar) y una base de ${UMBRAL_DE_BASE} (por validar), cumple los cimientos y Marketing está en Funcional o más.`,
              "**Casi lista.** Le faltan cimientos: la lectura dice cuáles. Es lo que se trabaja antes de una plataforma de personalización.",
              "**Todavía no.** Su camino es ordenar primero sus datos, sus canales y sus procesos.",
            ],
          },
          {
            tipo: "parrafo",
            texto:
              "Los cimientos son tres: el permiso de cada contacto registrado por canal y respetado en cada envío; lo que la persona hace en el sitio o la app unido a su ficha, también lo de antes de dejar sus datos; y, donde la edición lo pide, el catálogo al día en un solo lugar.",
          },
        ],
      },
    ],
  },

  // ════════════════════════ Noche 3 (2026-10-26): N4, N6 y N7 ════════════════════════
  // Van AL FINAL a propósito: el borrador de producción ya tiene todo lo anterior, y
  // `scripts/escala-borrador-9-0.ts --apply` le suma solo lo que le falta, sin rehacer ni pisar lo de antes.
  {
    punto: "Insider · N4 · la tercera pregunta del perfil (tráfico suficiente)",
    fuente: "insider",
    tema: TI,
    estado: "aplicada-con-redaccion",
    resumen:
      "«Tráfico suficiente» pasa de un «Si…» en el texto a una marca de perfil con su pregunta, la tercera del perfil. Los dos criterios de las ediciones que la pedían la llevan como marca; ninguno queda con dos condiciones.",
    habilita: "El umbral es el de la calificación de clientes de Insider (pedido); HubSpot no personaliza al anónimo por su comportamiento.",
    ops: [
      {
        op: "prosa-cambiar",
        parte: "Parte 2",
        empieza: "No todas las empresas venden igual",
        bloques: [
          {
            tipo: "parrafo",
            texto:
              "No todas las empresas venden igual, y la escala no cambia de estructura por eso: cambia qué criterios aplican. Cada unidad que se diagnostica tiene un perfil de negocio, que responde tres preguntas.",
          },
        ],
      },
      {
        op: "prosa-insertar",
        parte: "Parte 2",
        despuesDe: "**Qué pasa después de la venta.**",
        bloques: [{ tipo: "parrafo", texto: `**${PREGUNTA_DEL_TRAFICO}.** Suficiente, cuando ${TRAFICO_SUFICIENTE}; o insuficiente, cuando recibe menos.` }],
      },
      {
        op: "prosa-cambiar",
        parte: "Parte 2",
        empieza: "Los criterios que dependen del perfil llevan una marca:",
        bloques: [
          {
            tipo: "parrafo",
            texto:
              "Los criterios que dependen del perfil llevan una marca: venta con equipo; venta sin vendedor, que vale para la venta transaccional y la mixta; cliente recurrente, que vale para recompra y relación continua; recompra; relación continua; o tráfico suficiente, que vale cuando el sitio o la app tiene el tráfico de la tercera pregunta, porque personalizar a quien todavía no dejó sus datos y medir contra un grupo de control solo funcionan con volumen. Si la marca no corresponde al perfil de la unidad, el criterio no aplica y sale de la cuenta. Un criterio lleva una sola marca. En la venta mixta aplican todos los que dependen de cómo se cierra la venta: los de venta con equipo se evalúan sobre el canal que vende con personas, y los de venta sin vendedor, sobre el que vende solo.",
          },
        ],
      },
      {
        op: "edicion-editar-propio",
        edicion: "ecommerce-retail",
        id: "@ecommerce.1.6.O.anonimo",
        cambios: {
          perfil: "tráfico suficiente",
          texto:
            "La IA decide qué mostrarle a cada comprador —productos, orden y oferta— en tiempo real, según su comportamiento y también a quien todavía no dejó sus datos, dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa.",
        },
      },
      {
        op: "edicion-editar-propio",
        edicion: "turismo",
        id: "@turismo.1.6.O.motor",
        cambios: {
          perfil: "tráfico suficiente",
          texto:
            "La IA decide qué mostrarle a cada viajero en el sitio y el motor de reservas, aunque no haya dejado sus datos —destinos, fechas y tarifas, según lo que buscó—, dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa.",
        },
      },
    ],
    pregunta: `El umbral de tráfico (${TRAFICO_SUFICIENTE.replace(/ —.*—$/, "")}) es provisional: lo propuso Claude, en el borde de un rango de los datos de la empresa. Cuando Insider mande su calificación de clientes, se cambia en la tercera pregunta del perfil, que es de donde lo leen los criterios y la lectura de preparación.`,
  },
  {
    punto: "Insider · N6 · la lectura de preparación, con sus umbrales y sus cimientos",
    fuente: "insider",
    tema: TI,
    estado: "aplicada-con-redaccion",
    resumen:
      "La lectura dice qué pide cada estado, con el umbral de la base (5.000 contactos con permiso, por validar) y los cimientos por su número, para que Nexus la calcule en la escala de la exploración sin cambiar el nivel.",
    habilita: "La calcula Nexus en la escala de la exploración (la preventa y la del proyecto); no nombra a Insider.",
    ops: [
      {
        op: "prosa-cambiar",
        parte: "Parte 2",
        empieza: "**Lista.**",
        bloques: [
          {
            tipo: "lista",
            items: [
              `**Lista.** Le vende a personas, o a personas y a empresas; el cliente vuelve (recompra o relación continua); tiene tráfico suficiente (la tercera pregunta del perfil); su base tiene al menos ${BASE_SUFICIENTE} (umbral por validar); cumple los cimientos; y Marketing está en Funcional o más.`,
              "**Casi lista.** Cumple lo demás, pero le faltan cimientos: la lectura dice cuáles. Es lo que se trabaja antes de una plataforma de personalización.",
              "**Todavía no.** No cumple el perfil, el tráfico, la base o el nivel de Marketing. Su camino es ordenar primero sus datos, sus canales y sus procesos.",
            ],
          },
        ],
      },
      {
        op: "prosa-cambiar",
        parte: "Parte 2",
        empieza: "Los cimientos son tres:",
        bloques: [
          {
            tipo: "parrafo",
            texto:
              "Los cimientos son tres: el permiso de cada contacto registrado por canal y respetado en cada envío (`@2.3.F.permiso`); lo que la persona hace en el sitio o la app unido a su ficha, también lo de antes de dejar sus datos (`@2.3.E.comportamiento`); y, donde la edición lo pide, el catálogo al día en un solo lugar (`1.2.F102` en Ecommerce y retail, `1.2.F501` en Turismo).",
          },
          {
            tipo: "parrafo",
            texto:
              "Cuando falta un dato —el perfil, el tráfico, la base, el nivel de Marketing o si se cumple un cimiento—, la lectura no adivina: dice qué falta saber. El tráfico y la base se cuentan por rangos, así que un rango que contiene el umbral queda por confirmar.",
          },
        ],
      },
    ],
    pregunta:
      "Los umbrales se editan en el texto de la escala: el del tráfico, en la tercera pregunta del perfil; el de la base, en «Lista». Nexus los lee de ahí, y una versión que no los trae legibles no se publica.",
  },
  {
    punto: "Insider · N6 · la base dentro de un rango",
    fuente: "insider",
    tema: TI,
    estado: "pregunta",
    resumen: "El umbral de la base (5.000) cae dentro del rango «de mil a 10 mil» de los datos de la empresa.",
    habilita: "—",
    ops: [],
    pregunta:
      "El umbral de la base (5.000 contactos con permiso) cae dentro de un rango de los datos de la empresa, «de mil a 10 mil», que ya existe en HubSpot y que todavía ninguna empresa tiene llenado. Mientras tanto, una empresa en ese rango queda «por confirmar» en la lectura. ¿Partimos ese rango en dos («de mil a 5 mil» y «de 5 mil a 10 mil»), o el umbral pasa a 10.000?",
  },
  {
    punto: "Insider · N6 · qué es una relación digital recurrente",
    fuente: "insider",
    tema: TI,
    estado: "pregunta",
    resumen: "La lectura pide que le venda a personas y que el cliente vuelva; no mira cómo se cierra la venta.",
    habilita: "—",
    ops: [],
    pregunta:
      "Para estar «Lista», la lectura pide que la empresa le venda a personas (o a personas y a empresas) y que el cliente vuelva (recompra o relación continua); no mira cómo se cierra la venta. ¿Una empresa que vende con equipo, sin venta en su sitio, puede estar «Lista» si tiene el tráfico y la base, o la lectura pide además venta sin vendedor (transaccional o mixta)?",
  },
  {
    punto: "Insider · N7 · el mapa de herramientas para la 9.0",
    fuente: "insider",
    tema: TI,
    estado: "texto-pendiente",
    resumen: "El mapa de herramientas 2.0.0 está escrito para este borrador, con los 16 cambios y quién los habilita.",
    habilita: "Insider, HubSpot y Smarteam, criterio por criterio.",
    ops: [],
    pregunta:
      "El mapa de herramientas 2.0.0 (docs/escala/mapa_de_herramientas-9-0.md) está escrito para este borrador: suma los 16 cambios con quién los habilita, lleva cada criterio que cambió de número a su número nuevo, la ficha de Insider dice cuándo conviene con el umbral de tráfico y la de HubSpot, lo que no hace. Al publicar la 9.0 reemplaza al 1.0.1 (docs/escala/mapa_de_herramientas.md).",
  },
];
