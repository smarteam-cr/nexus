/**
 * lib/auditoria-portal/comprobar.ts — «COMPROBAR A MANO».
 *
 * Dos clases de pendientes para el ejecutivo, cada uno con dónde mirarlo en HubSpot:
 *  · Lo que la auditoría NO PUDO LEER en esta corrida (un permiso que falta, un error de HubSpot):
 *    sale de las lecturas fallidas y cambia con cada corrida.
 *  · Lo que la API de HubSpot NO MUESTRA nunca (quién creó un workflow, apps conectadas, último
 *    ingreso, plan…): una lista fija, medida contra la API el 2026-10-03.
 * Cuando Breeze (el asistente dentro de HubSpot) puede responderlo, va la pregunta exacta, marcada
 * si HubSpot documenta que la responde o si está por probar. Cada pendiente se marca «revisado»
 * con quién y cuándo (`FotoDeAuditoria.comprobados`).
 *
 * Las rutas de menú son las de HubSpot en español. Las exportaciones nombradas (propiedades,
 * workflows, usuarios) están en la base de conocimiento de HubSpot. PURO.
 */
import type { RevisionManual } from "./foto";
import type { BloqueDeLectura, LecturaFallida, MotivoDeFalla } from "./lecturas";

export interface PreguntaParaBreeze {
  pregunta: string;
  /** HubSpot documenta que Breeze la responde; si no, «por probar». */
  confirmada: boolean;
}

export interface CosaPorComprobar {
  /** Estable: «lectura:<bloque>» o «api:<tema>». Es lo que se marca como revisado. */
  clave: string;
  origen: "lectura" | "api";
  titulo: string;
  /** Por qué importa en una reimplementación (solo los fijos). */
  porQue?: string;
  /** Qué lecturas faltaron, sin repetir (solo los de lectura). */
  faltantes: string[];
  /** Qué significa que falte, si cambia lo que se ve en la auditoría. */
  consecuencia?: string;
  /** Por qué falló y qué hacer, una frase por motivo distinto (solo los de lectura). */
  motivos: string[];
  dondeComprobarlo: string;
  breeze?: PreguntaParaBreeze;
  revision?: RevisionManual;
}

const BLOQUES: Record<BloqueDeLectura, { titulo: string; donde: string; consecuencia?: string }> = {
  cuenta: {
    titulo: "Datos de la cuenta",
    donde: "En la configuración de HubSpot, la sección de la cuenta: moneda, zona horaria y dónde se alojan los datos.",
  },
  totales: {
    titulo: "Totales por objeto",
    donde: "Abre cada objeto en el CRM (Contactos, Empresas, Negocios, Tickets): el total aparece arriba de la tabla.",
    consecuencia: "Sin el total de contactos o de empresas, su gráfico de etapas no se muestra.",
  },
  etapas_del_portal: {
    titulo: "Etapas del ciclo de vida del portal",
    donde: "Configuración › Propiedades › Contactos › «Etapa del ciclo de vida»: ahí están todas las etapas, incluidas las propias del portal.",
    consecuencia: "Los gráficos de etapas no se muestran: los contactos de una etapa propia del portal se sumarían a «sin etapa».",
  },
  contactos_por_etapa: {
    titulo: "Contactos por etapa del ciclo de vida",
    donde: "CRM › Contactos: filtra por «Etapa del ciclo de vida» y anota cuántos hay en cada una.",
    consecuencia: "El gráfico de etapas de contactos no se muestra.",
  },
  empresas_por_etapa: {
    titulo: "Empresas por etapa del ciclo de vida",
    donde: "CRM › Empresas: filtra por «Etapa del ciclo de vida» y anota cuántas hay en cada una.",
    consecuencia: "El gráfico de etapas de empresas no se muestra.",
  },
  workflows: {
    titulo: "Workflows",
    donde: "Automatización › Workflows. En «Acciones de tabla › Exportar vista» sale la lista con quién creó y quién editó cada uno.",
    consecuencia: "La sección de workflows se muestra con lo que sí se leyó.",
  },
  propietarios: {
    titulo: "Asignación de propietarios",
    donde: "CRM › Contactos: filtra por «Propietario del contacto». La lista de usuarios sale de Configuración › Usuarios y equipos › Exportar (solo un Super Admin).",
    consecuencia: "La sección de propietarios no se muestra: un total que sume solo a los que salieron sería inventado.",
  },
  actividad_de_pipelines: {
    titulo: "Actividad de los pipelines de negocios",
    donde: "CRM › Negocios: elige cada pipeline y ordena por «Última modificación».",
  },
  detalle_de_contactos: {
    titulo: "Detalle de contactos (actividad, fuentes, estado del lead)",
    donde: "CRM › Contactos, con un filtro por la propiedad de cada lectura que faltó.",
  },
  detalle_de_empresas: {
    titulo: "Detalle de empresas (actividad, industria, negocios)",
    donde: "CRM › Empresas, con un filtro por la propiedad de cada lectura que faltó.",
  },
  propiedades: {
    titulo: "Propiedades",
    donde: "Configuración › Propiedades › Exportar todas las propiedades.",
    consecuencia: "La sección de propiedades se muestra con los objetos que sí se leyeron.",
  },
  pipelines: {
    titulo: "Pipelines",
    donde: "Configuración › Objetos › Negocios (y Tickets) › Pipelines.",
  },
  usuarios: {
    titulo: "Usuarios y equipos",
    donde: "Configuración › Usuarios y equipos.",
  },
  objetos: {
    titulo: "Objetos personalizados",
    donde: "Configuración › Objetos › Objetos personalizados.",
  },
};

export function explicarMotivo(motivo: MotivoDeFalla, status?: number): string {
  switch (motivo) {
    case "sin_permiso":
      return "La conexión no tiene permiso para leer esto: compruébalo a mano o pide ampliar los permisos de la conexión.";
    case "credencial":
      return "La conexión venció o fue revocada: hay que volver a conectarla y correr la auditoría de nuevo.";
    case "limite":
      return "HubSpot frenó las consultas por exceso de llamadas: vuelve a correr la auditoría más tarde.";
    case "red":
      return "HubSpot no respondió: vuelve a correr la auditoría.";
    case "error_hubspot":
      // Un 400 no se arregla reintentando: casi siempre es una propiedad que este portal no tiene.
      if (status === 400) {
        return "HubSpot rechazó la consulta (código 400): casi siempre es una propiedad que no existe en este portal. Compruébalo a mano y avisa a quien mantiene la auditoría.";
      }
      return `HubSpot respondió con un error${status ? ` (código ${status})` : ""}: vuelve a correrla y, si se repite, compruébalo a mano.`;
  }
}

/** Lo que no se pudo leer, agrupado por sección y sin repetir, en el orden de la primera falla. */
export function cosasPorComprobar(
  fallidas: LecturaFallida[],
  comprobados: Record<string, RevisionManual> = {},
): CosaPorComprobar[] {
  const porBloque = new Map<BloqueDeLectura, { faltantes: Set<string>; motivos: Set<string> }>();
  for (const f of fallidas) {
    let g = porBloque.get(f.bloque);
    if (!g) {
      g = { faltantes: new Set(), motivos: new Set() };
      porBloque.set(f.bloque, g);
    }
    g.faltantes.add(f.que);
    g.motivos.add(explicarMotivo(f.motivo, f.status));
  }
  return [...porBloque.entries()].map(([bloque, g]) => {
    const def = BLOQUES[bloque];
    const clave = `lectura:${bloque}`;
    return {
      clave,
      origen: "lectura" as const,
      titulo: def.titulo,
      faltantes: [...g.faltantes],
      ...(def.consecuencia ? { consecuencia: def.consecuencia } : {}),
      motivos: [...g.motivos],
      dondeComprobarlo: def.donde,
      ...(comprobados[clave] ? { revision: comprobados[clave] } : {}),
    };
  });
}

/**
 * Lo que la API de HubSpot no muestra, en el orden en que más cambia una reimplementación.
 * Medido contra la API el 2026-10-03 (ver lib/auditoria-portal/inventario.ts).
 */
export const LO_QUE_LA_API_NO_MUESTRA: ReadonlyArray<Omit<CosaPorComprobar, "origen" | "faltantes" | "motivos" | "revision">> = [
  {
    clave: "api:workflows-creador",
    titulo: "Quién creó cada workflow y cuántos registros inscribió",
    porQue: "Dice qué armó el partner anterior y qué se usa de verdad.",
    dondeComprobarlo: "Automatización › Workflows › Acciones de tabla › Exportar vista: trae quién lo creó, quién lo editó por última vez y sus inscripciones.",
    breeze: { pregunta: "¿Qué workflows no se usan?", confirmada: true },
  },
  {
    clave: "api:apps-conectadas",
    titulo: "Apps conectadas y si sincronizan bien",
    porQue: "Una integración del partner anterior puede seguir escribiendo en el portal.",
    dondeComprobarlo: "Configuración › Integraciones › Apps conectadas: quién la instaló, sus permisos, sus llamadas y sus errores.",
    breeze: { pregunta: "¿Alguna de mis apps conectadas tiene errores de sincronización?", confirmada: true },
  },
  {
    clave: "api:ultimo-ingreso",
    titulo: "Último ingreso de cada usuario",
    porQue: "Muestra qué usuarios del partner anterior siguen con acceso.",
    dondeComprobarlo: "Configuración › Usuarios y equipos › Exportar todos los usuarios (solo un Super Admin).",
    breeze: { pregunta: "¿Qué usuarios no entran hace 90 días?", confirmada: false },
  },
  {
    clave: "api:plan",
    titulo: "Plan y asientos",
    porQue: "Qué Hubs y qué nivel tiene el portal: define qué se puede reconstruir.",
    dondeComprobarlo: "Configuración › Cuenta y facturación.",
  },
  {
    clave: "api:propiedades-uso",
    titulo: "Uso y llenado de las propiedades",
    porQue: "Una propiedad que nadie llena no se migra.",
    dondeComprobarlo: "Configuración › Propiedades › Exportar todas las propiedades: trae dónde se usa cada una y qué parte de los registros la tiene llena.",
    breeze: { pregunta: "¿Qué propiedades personalizadas casi no se llenan?", confirmada: false },
  },
  {
    clave: "api:reportes",
    titulo: "Reportes y dashboards en uso",
    porQue: "Lo que la dirección mira hoy tiene que seguir funcionando después.",
    dondeComprobarlo: "Reportes › Dashboards: revisa con el cliente cuáles usa de verdad y quién los mira.",
  },
  {
    clave: "api:obligatorias-por-etapa",
    titulo: "Propiedades obligatorias por etapa",
    porQue: "Cambian lo que hay que llenar para que un negocio avance.",
    dondeComprobarlo: "Configuración › Objetos › Negocios › Pipelines: en cada etapa, las propiedades obligatorias y las reglas del pipeline.",
  },
  {
    clave: "api:salud-workflows",
    titulo: "Workflows con errores",
    porQue: "Un workflow que falla en silencio deja registros a medio procesar.",
    dondeComprobarlo: "Automatización › Workflows › pestaña Salud: los que necesitan revisión y los que no inscriben a nadie hace 90 días (Pro o Enterprise).",
  },
  {
    clave: "api:duplicados",
    titulo: "Duplicados y calidad de los datos",
    porQue: "Una migración con duplicados los multiplica.",
    dondeComprobarlo: "Gestión de datos › Calidad de datos (desde Starter) y la herramienta de duplicados (Pro o Enterprise).",
  },
];

/** Los pendientes fijos, con su revisión si la hay. */
export function loQueLaApiNoMuestra(comprobados: Record<string, RevisionManual> = {}): CosaPorComprobar[] {
  return LO_QUE_LA_API_NO_MUESTRA.map((c) => ({
    ...c,
    origen: "api" as const,
    faltantes: [],
    motivos: [],
    ...(comprobados[c.clave] ? { revision: comprobados[c.clave] } : {}),
  }));
}

/** Las claves que se pueden marcar como revisadas (las fijas y las de cada bloque de lectura). */
export function esClaveDePendiente(clave: string): boolean {
  if (LO_QUE_LA_API_NO_MUESTRA.some((c) => c.clave === clave)) return true;
  const bloque = clave.startsWith("lectura:") ? clave.slice("lectura:".length) : null;
  // `in` miraría también el prototipo («lectura:__proto__» daría true).
  return bloque !== null && Object.hasOwn(BLOQUES, bloque);
}
