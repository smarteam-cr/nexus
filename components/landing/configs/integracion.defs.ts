/**
 * components/landing/configs/integracion.defs.ts
 *
 * Defs SERVER-SAFE (sin React) de la INTEGRACIÓN TÉCNICA, el segundo tipo de artefacto nuevo (etapa V6 de
 * docs/artefactos-plan.md, adelantada por Elías el 29 oct; Cemaco quiere integrar su ERP). Catálogo n.º 6 de
 * docs/artefactos-sugeridos.md (15 cuentas) y el pedido de Elías: un MAPA DE INTEGRACIÓN que documente qué objetos y
 * campos de un sistema pasan a HubSpot y cómo.
 *
 * Aprovecha el requerimiento técnico (`desarrollo.defs.ts`, la pieza «Integraciones»): la portada, qué duele hoy, la
 * arquitectura, la relación entre objetos, el diccionario de propiedades, los momentos de sincronización, los criterios
 * de éxito y el cierre son las MISMAS defs, prestadas. Suma las cuatro que le faltaban, todas con la tabla genérica del
 * motor y sus columnas ya sembradas:
 *   · `alcance_firmado`        — qué entra, qué no y qué cambió desde la firma;
 *   · `identificador_unico`    — la llave que une un registro de cada sistema (la cédula en Cemaco);
 *   · `mapa_integracion`       — EL CORAZÓN: campo de origen ↔ propiedad de HubSpot, sentido, transformación y frecuencia;
 *   · `entregables_de_terceros`— lo que debe entregar el cliente o un tercero (API, credenciales, contrato) y su estado.
 * Sin `estimacion`: lee la tabla DevEstimate del proyecto (ctxDriven), y una copia pintaría la del requerimiento.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { DESARROLLO_DEF_BY_KEY, DESARROLLO_HANDOFF_KEYS, DESARROLLO_TEMPLATE } from "./desarrollo.defs";
import { reglaDeLasColumnas, seccionDeTabla, tablaConColumnas } from "./adopcion.defs";
import { TABLA_SCHEMA, TABLA_TYPE } from "@/lib/landing/catalogo-de-secciones";
import { heroTitleBrief } from "@/lib/landing/hero-title";

const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;
const prestada = (key: string): BCSectionDef => {
  const d = DESARROLLO_DEF_BY_KEY[key];
  if (!d) throw new Error(`integracion.defs: el requerimiento técnico no tiene la sección «${key}».`);
  return d;
};

export const COLUMNAS_DEL_ALCANCE_FIRMADO = ["Qué", "Estado (entra, no entra, cambió)", "Detalle"] as const;
export const COLUMNAS_DEL_IDENTIFICADOR_UNICO = ["Objeto", "Llave en HubSpot", "Llave en el otro sistema", "Si falta o se repite"] as const;
export const COLUMNAS_DEL_MAPA_DE_INTEGRACION = [
  "Origen (sistema · objeto · campo)",
  "Propiedad de HubSpot",
  "Sentido",
  "Transformación",
  "Frecuencia",
] as const;
export const COLUMNAS_DE_LOS_ENTREGABLES_DE_TERCEROS = ["Qué hace falta", "Quién lo entrega", "Para cuándo", "Estado"] as const;

/** Los valores del sentido de una fila del mapa: cerrados, para que la tabla se lea de un vistazo. */
export const SENTIDOS_DEL_MAPA = ["Entra a HubSpot", "Sale de HubSpot", "En los dos sentidos"] as const;

const NO_INVENTES =
  "NUNCA inventes nombres de campos, propiedades internas, IDs, volúmenes ni frecuencias acordadas: lo que no esté confirmado se escribe igual con `⚠️ Por validar`. Sin precios ni horas de Smarteam.";

export const INTEGRACION_SECTION_DEFS: BCSectionDef[] = [
  {
    ...prestada("requerimiento"),
    label: "Requerimiento técnico",
    eyebrow: "Requerimiento técnico",
    agentHint: "Título de la integración + una bajada de qué conecta con qué + chips de los sistemas.",
    brief:
      heroTitleBrief("Requerimiento técnico") +
      "Portada del requerimiento técnico. `headline`: patrón `Integración de HubSpot con [sistema]` (sacá el nombre propio del sistema de la fuente: SAP, Intelisis, Odoo, el ERP…). `subhead`: UNA frase, en lenguaje llano, de qué datos pasan y para qué ('Los clientes y sus compras del ERP llegan a HubSpot para que ventas vea el historial sin pedirlo'). `tags`: 2-5 chips de los sistemas y el tipo de conexión ('HubSpot', 'SAP', 'API REST', 'Bidireccional'). " +
      NO_INVENTES,
  },
  {
    key: "alcance_firmado",
    label: "El alcance firmado",
    eyebrow: "Qué entra y qué no",
    theme: "soft",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DEL_ALCANCE_FIRMADO),
    tip: "Lo que se firmó antes de construir: qué entra, qué queda fuera y qué cambió desde la firma. En la nota, cuándo y quién lo firmó.",
    agentHint: "Una fila por pieza del alcance: si entra, no entra o cambió desde la firma, con su detalle.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DEL_ALCANCE_FIRMADO) +
      "EL ALCANCE QUE SE FIRMA antes de construir: una fila por pieza ('Clientes del ERP a HubSpot', 'Facturas', 'Inventario en tiempo real'). «Estado»: UNO de 'Entra', 'No entra' o 'Cambió' (y si cambió, el «Detalle» dice de qué a qué: 'Pasó de 10 a 25 propiedades'). «Detalle»: una línea. `nota`: cuándo se firmó y quién lo firmó, si la fuente lo dice; si no, déjala vacía. Lo que nadie dijo que entra, no entra. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  prestada("retos_cliente"),
  prestada("arquitectura"),
  {
    key: "identificador_unico",
    label: "El identificador único",
    eyebrow: "La llave entre sistemas",
    theme: "light",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DEL_IDENTIFICADOR_UNICO),
    tip: "Con qué dato se reconoce el mismo registro en los dos sistemas (la cédula, el NIT, el código del vendedor) y qué pasa si falta o se repite.",
    agentHint: "Una fila por objeto que viaja: la llave en HubSpot, la llave en el otro sistema y la regla si falta o se repite.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DEL_IDENTIFICADOR_UNICO) +
      "EL IDENTIFICADOR ÚNICO ENTRE SISTEMAS: una fila por objeto que viaja ('Contacto', 'Empresa', 'Negocio', 'Vendedor'). «Llave en HubSpot»: la propiedad que lo identifica (el email en Contactos, el dominio o el registro fiscal en Empresas, o una propiedad personalizada configurada como Única: un External ID como `id_cliente_erp`). «Llave en el otro sistema»: el campo equivalente (la cédula, el NIT, el código de cliente del ERP, el usuario de SAP del vendedor). «Si falta o se repite»: la regla ('Se crea con la cédula y se revisa a mano', 'No se sincroniza y se avisa'). Los Negocios no se desduplican solos en HubSpot: su regla se define. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  {
    key: "mapa_integracion",
    label: "El mapa de integración",
    eyebrow: "Campo por campo",
    theme: "soft",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DEL_MAPA_DE_INTEGRACION),
    tip:
      "Una fila por campo que pasa entre los sistemas: de dónde sale, a qué propiedad de HubSpot llega, en qué sentido, " +
      "qué se le hace en el camino y cada cuánto. Es la tabla que se firma y la que se consulta mientras se construye.",
    agentHint: "Una fila por campo que viaja: origen, propiedad de HubSpot, sentido, transformación y frecuencia.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DEL_MAPA_DE_INTEGRACION) +
      "EL MAPA DE INTEGRACIÓN — el corazón del documento: qué objetos y campos de cada sistema pasan a HubSpot y cómo. Una fila por CAMPO que viaja (no por objeto): " +
      "«Origen (sistema · objeto · campo)» = de dónde sale, con el nombre del sistema, su objeto y su campo ('SAP · Cliente · KUNNR', 'Intelisis · Venta · Fecha de factura'); " +
      "«Propiedad de HubSpot» = el objeto y la propiedad a la que llega ('Empresa · id_cliente_erp', 'Negocio · Monto'); si la propiedad todavía no existe, escribe 'Nueva: ' y su nombre visible, y márcala `⚠️ Por validar` — NUNCA inventes un nombre interno; " +
      `«Sentido» = UNO de: ${SENTIDOS_DEL_MAPA.map((s) => `'${s}'`).join(" | ")}; ` +
      "«Transformación» = qué se le hace al dato en el camino ('Ninguna', 'Moneda a USD', 'Código de estado → etapa del pipeline', 'Se concatena nombre y apellido'); " +
      "«Frecuencia» = cada cuánto ('En tiempo real', 'Cada hora', 'Una vez al día', 'Solo la carga inicial'). " +
      "Empieza por la llave de cada objeto (la del identificador único) y sigue con los campos que nombran la arquitectura, la fuente y el alcance firmado. Si un campo entra en las dos direcciones con reglas distintas, van dos filas. `nota`: qué sistema manda cuando el dato choca, si la fuente lo dice. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  prestada("relacion_objetos"),
  prestada("propiedades"),
  prestada("comunicacion"),
  {
    key: "entregables_de_terceros",
    label: "Lo que tienen que entregarnos",
    eyebrow: "Del cliente o de un tercero",
    theme: "light",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DE_LOS_ENTREGABLES_DE_TERCEROS),
    tip: "Lo que la integración necesita del cliente o de un tercero (la API, las credenciales, el contrato, un ambiente de pruebas) y en qué está cada cosa.",
    agentHint: "Una fila por cosa que falta: qué, quién la entrega, para cuándo y en qué estado está.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DE_LOS_ENTREGABLES_DE_TERCEROS) +
      "LO QUE DEBE ENTREGAR EL CLIENTE O UN TERCERO para poder construir: una fila por cosa ('Documentación de la API del ERP', 'Usuario y credenciales de pruebas', 'Contrato con el proveedor del ERP', 'Ambiente de pruebas con datos de muestra'). «Quién lo entrega»: el equipo o la empresa (el área de TI del cliente, el socio de SAP), nunca una persona que la fuente no nombre. «Para cuándo»: el momento relativo ('Antes de empezar a construir'), salvo que la fuente dé una fecha. «Estado»: 'Pendiente', 'En curso' o 'Entregado'. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  prestada("criterios_exito"),
  seccionDeTabla({
    key: "guion_pruebas",
    label: "El guion de pruebas",
    eyebrow: "Cómo se acepta",
    columnas: ["Prueba", "Quién la hace", "Qué debería pasar", "Resultado"],
    tip: "Las pruebas con que el cliente acepta la integración. Sin esto, «funciona» es una opinión.",
    agentHint: "Una fila por prueba de aceptación, en orden.",
    brief: "EL GUION DE PRUEBAS Y ACEPTACIÓN: una fila por prueba. «Qué debería pasar»: el resultado observable. «Resultado»: vacío hasta que se pruebe.",
  }),
  seccionDeTabla({
    key: "migracion_datos",
    label: "La migración de datos",
    eyebrow: "Qué se trae",
    theme: "soft",
    columnas: ["Qué datos", "De dónde", "Limpieza que necesita", "Quién la hace"],
    tip: "Qué datos se traen, de dónde y qué limpieza necesitan antes de entrar a HubSpot.",
    agentHint: "Una fila por conjunto de datos a migrar.",
    brief: "LA MIGRACIÓN Y LIMPIEZA DE DATOS: una fila por conjunto de datos (contactos, empresas, negocios). Si no hay migración, deja `filas` vacío.",
  }),
  prestada("cierre"),
];

export const INTEGRACION_TEMPLATE: BcTemplateDef = {
  id: "integracion_v1",
  caseLabel: "Requerimiento técnico",
  maxTokens: 18000, // el mapa de campos es la sección más larga del motor; 18.000 desde que suma el guion de pruebas y la migración
  brandVoice: false, // documento técnico, como el requerimiento
  features: { useCaseChecklist: false },
  agentIntro:
    (DESARROLLO_TEMPLATE.agentIntro ?? "")
      .replace(
        "FUENTE ÚNICA: la sección `desarrollo` del handoff (veredicto + lo conversado), el alcance contratado y el deal del mensaje. No inventes NADA que no esté ahí.",
        "TU FUENTE: la sección `desarrollo` del handoff, el alcance contratado, las reuniones del proyecto que te llegan y los demás documentos del proyecto. No inventes NADA que no esté ahí.",
      ) +
    "\n\nESTE DOCUMENTO ES UN MAPA DE INTEGRACIÓN QUE SE FIRMA: además del esqueleto técnico, deja por escrito el ALCANCE firmado (qué entra, qué no y qué cambió desde la firma), el IDENTIFICADOR ÚNICO con que se reconoce el mismo registro en los dos sistemas, el MAPA campo por campo (origen, propiedad de HubSpot, sentido, transformación y frecuencia) y lo que debe ENTREGAR el cliente o un tercero. El cliente lo lee para firmarlo y el desarrollador para construir: cada fila tiene que poder confirmarse o corregirse en la sesión.\n\n" +
    "Los demás documentos del proyecto (el requerimiento técnico, la planificación) pesan según su estado —lo «terminado» ya se acordó; lo «en construcción» todavía cambia—. En las tablas, conserva las columnas que trae la sección, en su orden, y escribe solo las filas.",
  sections: INTEGRACION_SECTION_DEFS,
};

/** Lookup key → def. */
export const INTEGRACION_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(INTEGRACION_SECTION_DEFS.map((d) => [d.key, d]));

/** El handoff que lee: el mismo del requerimiento técnico. */
export const INTEGRACION_HANDOFF_KEYS = DESARROLLO_HANDOFF_KEYS;
