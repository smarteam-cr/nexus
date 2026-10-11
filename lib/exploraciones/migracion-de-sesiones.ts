/**
 * lib/exploraciones/migracion-de-sesiones.ts — las reuniones que el agente YA LEYÓ y no son de ninguna sesión, como
 * sesiones nuevas (la migración del 2026-10-10). PURO.
 *
 * Desde la etapa A (2026-10-09) la exploración son sus sesiones: en un cliente o un proyecto, nada entra solo, y lo
 * que el agente leyó antes y no es la reunión de ninguna sesión pasó a «Fuera de la exploración» (`legado`). Para que
 * la exploración siga leyendo lo que llevaba, scripts/migrar-reuniones-de-los-documentos.ts (parte B) las PROPONE como
 * sesiones unidas a su reunión, igual que «+ Agregar sesión» (`sesionDesdeLaReunion`), y las escribe por la mutación
 * de la ruta (`agregarSesion`, con su control de versión). DECISIONS «Los documentos leen la memoria y solo las
 * reuniones elegidas» › «La migración (2026-10-10)».
 *
 * QUÉ NO PASA A SESIÓN: lo de un prospecto (ahí las sesiones entran solas), lo sumado a mano (ya se lee sin sesión),
 * una de HubSpot en un proyecto (la exploración de un proyecto no lee HubSpot), una que no ocurrió, una de antes del
 * corte de la preventa (un mes antes del alta: así no vuelven las lecturas de 2023 de Grupo Servica; salvo una que una
 * persona eligió a mano en el buscador, que existía justo para sumar reuniones viejas), una que no es de la empresa o
 * del proyecto, una de puertas adentro, una de HubSpot de la que no se sabe quién estuvo (la foto guardada no trae los
 * asistentes: podría ser la preparación del equipo), una que alguien sacó (`fuera`), una de HubSpot cuya gemela de
 * Meet ya está, y lo que ya es de una sesión (unida a mano, por su evento o por la fecha, como lo liga la pantalla).
 * Sin pasar el tope de sesiones: si no entran todas, quedan las más recientes.
 */
import { aFecha, hoyEnCostaRica } from "./fechas";
import { claveDeReunion, MAX_SESIONES, pestanasDeSesiones, type ReunionDeLaExploracion, type SesionPlaneada } from "./guia";
import { sesionDesdeLaReunion } from "./inicio";
import { mismaReunion, sesionUnidaALaReunion } from "./lectura";

/** Una reunión que el agente leyó (o una persona eligió antes de la etapa A), con lo que el servidor sabe de ella. */
export interface ReunionYaLeida {
  id: string;
  origen: "meet" | "hubspot" | "documento";
  /** ISO. null = no se sabe cuándo fue. */
  fecha: string | null;
  titulo: string;
  /** Es de la empresa (y, en un proyecto, de su membresía): por el chokepoint. Las de HubSpot salen de la foto de la empresa. */
  deLaEmpresa: boolean;
  puertasAdentro?: boolean;
  /** No se sabe quién estuvo (una de HubSpot: la foto no guarda los asistentes). No pasa: podría ser de puertas adentro. */
  salaDesconocida?: boolean;
  /** La eligió una persona en el buscador de la preventa (`contenido.reunionesElegidas`): el corte no la deja afuera. */
  elegidaAMano?: boolean;
  /** El evento del calendario de una de Meet (`googleEventId`): la liga a la sesión unida a ese evento. */
  eventoId?: string | null;
}

export interface EntradaDeSesionesQueFaltan {
  sesiones: readonly SesionPlaneada[];
  fuera: readonly string[];
  leidas: readonly ReunionYaLeida[];
  /** La exploración de un proyecto. */
  esDeProyecto: boolean;
  /** La preventa de un prospecto (ahí no se migra nada). */
  esProspecto: boolean;
  /** ms: desde cuándo cuentan (la preventa, un mes antes del alta; el proyecto, 0). */
  desde: number;
  ahora: Date;
  nuevoId: () => string;
}

export type MotivoDeSalto =
  | "prospecto"
  | "sumada a mano"
  | "HubSpot en un proyecto"
  | "sin fecha"
  | "no ocurrió"
  | "de antes del corte"
  | "no es de la empresa"
  | "de puertas adentro"
  | "no se sabe quién estuvo"
  | "la sacaron"
  | "su gemela de Meet ya está"
  | "ya es de una sesión"
  | "no entra (tope de sesiones)";

export interface ResultadoDeSesionesQueFaltan {
  /** Las sesiones nuevas, en orden por fecha (la más vieja primero). */
  nuevas: SesionPlaneada[];
  /** Las reuniones que pasan a sesión, en el mismo orden que `nuevas`. */
  reuniones: ReunionYaLeida[];
  saltadas: { clave: string; titulo: string; motivo: MotivoDeSalto }[];
}

/** LAS SESIONES QUE FALTAN. Puro: el id de cada una sale de `nuevoId`. */
export function sesionesQueFaltan(e: EntradaDeSesionesQueFaltan): ResultadoDeSesionesQueFaltan {
  const saltadas: ResultadoDeSesionesQueFaltan["saltadas"] = [];
  const unicas = new Map<string, ReunionYaLeida>();
  for (const r of e.leidas) if (!unicas.has(claveDeReunion(r))) unicas.set(claveDeReunion(r), r);
  const todas = [...unicas.values()];
  const saltar = (r: ReunionYaLeida, motivo: MotivoDeSalto) => saltadas.push({ clave: claveDeReunion(r), titulo: r.titulo, motivo });

  if (e.esProspecto && !e.esDeProyecto) {
    for (const r of todas) saltar(r, "prospecto");
    return { nuevas: [], reuniones: [], saltadas };
  }

  const fuera = new Set(e.fuera);
  const ahora = e.ahora.getTime();
  const posibles: (ReunionYaLeida & { fecha: string })[] = [];
  for (const r of todas) {
    if (r.origen === "documento") saltar(r, "sumada a mano");
    else if (r.origen === "hubspot" && e.esDeProyecto) saltar(r, "HubSpot en un proyecto");
    else if (!r.fecha || Number.isNaN(Date.parse(r.fecha))) saltar(r, "sin fecha");
    else if (Date.parse(r.fecha) > ahora) saltar(r, "no ocurrió");
    else if (Date.parse(r.fecha) < e.desde && !r.elegidaAMano) saltar(r, "de antes del corte");
    else if (!r.deLaEmpresa) saltar(r, "no es de la empresa");
    else if (r.puertasAdentro) saltar(r, "de puertas adentro");
    else if (r.salaDesconocida) saltar(r, "no se sabe quién estuvo");
    else if (fuera.has(claveDeReunion(r))) saltar(r, "la sacaron");
    else posibles.push({ ...r, fecha: r.fecha });
  }

  // Lo que ya es de una sesión: unida a mano (también la gemela de Meet de una de HubSpot), por su evento o por la
  // fecha, como lo liga la pantalla (`pestanasDeSesiones`).
  const comoExploracion: ReunionDeLaExploracion[] = posibles.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    fecha: r.fecha,
    origen: r.origen,
    leida: true,
    ...(r.eventoId ? { eventoId: r.eventoId } : {}),
  }));
  const ligadas = new Set(
    pestanasDeSesiones(e.sesiones, comoExploracion, hoyEnCostaRica(e.ahora)).flatMap((p) => (p.sesion && p.reunion ? [claveDeReunion(p.reunion)] : [])),
  );
  const deUnaSesion = (r: ReunionYaLeida & { fecha: string }) =>
    ligadas.has(claveDeReunion(r)) ||
    e.sesiones.some(
      (s) =>
        (s.reunion?.id === r.id && s.reunion.origen === r.origen) ||
        (r.origen === "meet" && sesionUnidaALaReunion(s, { id: r.id, eventoId: r.eventoId ?? null, fecha: r.fecha })),
    );
  // Una de HubSpot cuya gemela de Meet (a menos de dos horas) ya es sesión o pasa a serlo: la misma reunión cuenta una vez.
  const meetQueQuedan = posibles.filter((r) => r.origen === "meet");
  const fechasDeSesionesDeMeet = e.sesiones.flatMap((s) => (s.reunion?.origen === "meet" && s.reunion.inicio ? [s.reunion.inicio] : []));

  const libres: (ReunionYaLeida & { fecha: string })[] = [];
  for (const r of posibles) {
    if (deUnaSesion(r)) saltar(r, "ya es de una sesión");
    else if (r.origen === "hubspot" && (meetQueQuedan.some((m) => mismaReunion(m.fecha, r.fecha)) || fechasDeSesionesDeMeet.some((f) => mismaReunion(f, r.fecha))))
      saltar(r, "su gemela de Meet ya está");
    else libres.push(r);
  }

  // Sin pasar el tope: si no entran todas, las más recientes. Se agregan de la más vieja a la más nueva.
  const lugar = Math.max(0, MAX_SESIONES - e.sesiones.length);
  const porReciente = [...libres].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  for (const r of porReciente.slice(lugar)) saltar(r, "no entra (tope de sesiones)");
  const entran = porReciente.slice(0, lugar).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  const nuevas = entran.map((r) => {
    const s = sesionDesdeLaReunion({ id: r.id, origen: r.origen, fecha: r.fecha }, e.nuevoId());
    // Una de HubSpot guarda su hora, como al unirla desde «+ Agregar sesión»: así se liga su gemela de Meet.
    return r.origen === "hubspot" && s.reunion ? { ...s, reunion: { ...s.reunion, inicio: r.fecha } } : s;
  });
  return { nuevas, reuniones: entran, saltadas };
}

/** El día de una reunión en Costa Rica (para imprimir). */
export function diaDeLaReunion(iso: string): string {
  return hoyEnCostaRica(aFecha(iso));
}
