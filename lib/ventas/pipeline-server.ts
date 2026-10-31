/**
 * lib/ventas/pipeline-server.ts — lo que ve Ventas › Pipeline. SERVER-ONLY, solo lectura: sale de la copia de los negocios
 * (`NegocioAbierto`), de Tareas y del calendario de cada vendedor; nunca le pregunta a HubSpot. Las reglas son puras
 * (lib/ventas/pipeline.ts).
 *
 * Todo Ventas ve todos los negocios (decisión de Elías, 2026-10-30): el permiso lo mira la página. Una reunión cuenta si
 * está en el calendario de alguno de los vendedores de los negocios abiertos y es de UNA empresa (`cuentaDelEvento`).
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotDealUrl } from "@/lib/hubspot/urls";
import { calendarioDeLosProximosDias } from "@/lib/mi-dia/calendario-server";
import { pasosVigentes } from "@/lib/siguiente-paso/lectura-server";
import type { SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import { cseDeLaCuenta } from "@/lib/lecturas/personas";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { compromisosDeLasEmpresas, tareasDeReunionAjena } from "@/lib/tareas/compromisos-del-pipeline";
import { hoyEnCostaRica } from "@/lib/tareas/semana";
import { aNegocioVisto, reunionesDelCalendario, ultimasReuniones } from "./cartera-server";
import { esPausado, pasoDeVentas, type NegocioVisto, type ReunionDelNegocio } from "./negocios";
import {
  esReunionPorAgendar,
  estadoDelCompromiso,
  marcaDelPaso,
  negociosDelPipeline,
  ordenarCompromisos,
  ordenarNegocios,
  pasosParaLaRegla,
  primeraReunionDeCadaEmpresa,
  sinCumplirPorEmpresa,
  type EstadoDelCompromiso,
  type MarcaDelPaso,
} from "./pipeline";

export interface FilaDelPipeline extends Pick<NegocioVisto, "id" | "nombre" | "pipeline" | "etapa" | "empresa" | "clientId" | "monto" | "moneda" | "fechaCierre" | "probabilidad"> {
  /** El nombre del dueño del negocio, si está en Nexus. */
  vendedor: string | null;
  esMio: boolean;
  hubspotUrl: string | null;
  paso: SiguientePasoVisto | null;
  reunion: ReunionDelNegocio | null;
  /** `hs_next_step`: solo una sugerencia. */
  sugerencia: string | null;
  marca: MarcaDelPaso | null;
  /** Lo prometido a su empresa que venció o nunca se volvió tarea. */
  compromisosSinCumplir: number;
}

export interface CompromisoDelPipeline {
  id: string;
  titulo: string;
  clientId: string;
  empresa: string;
  estado: EstadoDelCompromiso;
  venceEl: string | null;
  /** null = «Por asignar». */
  responsable: string | null;
  equipo: string | null;
  /** ISO. */
  creadaAt: string;
  /** null = quien mira no estuvo en la reunión. */
  cita: string | null;
  reunion: { titulo: string; fecha: string } | null;
}

export interface VistaDelPipeline {
  /** `YYYY-MM-DD`, en hora de Costa Rica. */
  hoyISO: string;
  filas: FilaDelPipeline[];
  compromisos: CompromisoDelPipeline[];
  /** Negocios abiertos en una etapa de pausa: no se están vendiendo. */
  pausados: number;
  /** Los de quien mira. */
  pausadosMios: number;
  /** Cuántos vendedores no tienen el calendario legible: sus reuniones no cuentan. */
  calendariosSinLeer: number;
  /** ISO: la última copia de los negocios. */
  copiadoAt: string | null;
}

export type ResultadoDelPipeline = { estado: "ok"; vista: VistaDelPipeline } | { estado: "sin-tabla" };

export async function vistaDelPipeline(tm: TeamMember, ahora: Date): Promise<ResultadoDelPipeline> {
  const hoyISO = hoyEnCostaRica(ahora);
  let abiertos;
  try {
    abiertos = await prisma.negocioAbierto.findMany({
      where: { abierto: true },
      include: { client: { select: { name: true, kind: true } }, vendedor: { select: { id: true, name: true, email: true } } },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tabla" };
    throw e;
  }
  const { activos, pausados } = negociosDelPipeline(abiertos.map((f) => ({ ...f, etapa: f.etapaLabel ?? f.etapaId })));
  const clientIds = [...new Set(activos.flatMap((f) => (f.clientId ? [f.clientId] : [])))];
  const correos = [...new Set(activos.flatMap((f) => (f.vendedor ? [f.vendedor.email.toLowerCase()] : [])))];

  const [portal, copia, todosLosPasos, calendarios, ultimas, leidos, clientes] = await Promise.all([
    portalDelSistema().catch(() => null),
    prisma.negocioAbierto.aggregate({ _max: { sincronizadoEn: true } }),
    pasosVigentes([...activos.map((f) => ({ objeto: "negocio" as const, objetoId: f.id })), ...clientIds.map((id) => ({ objeto: "empresa" as const, objetoId: id }))]),
    Promise.all(correos.map((c) => calendarioDeLosProximosDias(c, ahora).catch(() => null))),
    ultimasReuniones(clientIds, ahora),
    compromisosDeLasEmpresas(tm, clientIds, ahora),
    clientesQueVesParaTareas(tm),
  ]);
  const ajenas = await tareasDeReunionAjena(todosLosPasos.map((p) => p.id));
  const pasos = todosLosPasos.filter((p) => !ajenas.has(p.id));

  const pasosDe = new Map<string, SiguientePasoVisto[]>();
  for (const p of pasos) {
    const k = `${p.objeto}:${p.objetoId}`;
    pasosDe.set(k, [...(pasosDe.get(k) ?? []), p]);
  }
  const delCalendario = calendarios.map((cal) => reunionesDelCalendario(cal, ahora));
  const proximas = primeraReunionDeCadaEmpresa(delCalendario);
  // Una reunión prometida la agenda quien lleva la cuenta: su calendario también dice si se cumplió, como en el aviso de
  // las 48 horas. Solo para eso: la reunión que es el siguiente paso de un negocio sigue siendo la de un vendedor.
  const conReunionPrometida = [...new Set(leidos.filter((c) => esReunionPorAgendar(c.titulo)).map((c) => c.clientId))];
  const encargados = [...new Set((await Promise.all(conReunionPrometida.map((id) => cseDeLaCuenta(id).catch(() => null)))).flatMap((c) => (c ? [c.toLowerCase()] : [])))].filter((c) => !correos.includes(c));
  const deLosEncargados = await Promise.all(encargados.map((c) => calendarioDeLosProximosDias(c, ahora).catch(() => null)));
  const agendadas = primeraReunionDeCadaEmpresa([...delCalendario, ...deLosEncargados.map((cal) => reunionesDelCalendario(cal, ahora))]);

  const empresaDe = new Map(activos.flatMap((f) => (f.clientId ? [[f.clientId, f.client?.name ?? f.empresaNombre ?? "La empresa"] as const] : [])));
  const compromisos = ordenarCompromisos(
    leidos.flatMap((c): CompromisoDelPipeline[] => {
      const estado = estadoDelCompromiso(c, { ultima: ultimas.get(c.clientId) ?? null, proxima: agendadas.get(c.clientId)?.inicio ?? null }, hoyISO, ahora);
      if (!estado) return [];
      return [
        {
          id: c.id,
          titulo: c.titulo,
          clientId: c.clientId,
          empresa: empresaDe.get(c.clientId) ?? "La empresa",
          estado,
          venceEl: c.venceEl,
          responsable: c.responsable,
          equipo: c.equipo,
          creadaAt: c.creadaAt.toISOString(),
          cita: c.cita,
          reunion: c.reunion,
        },
      ];
    }),
  );
  const sinCumplir = sinCumplirPorEmpresa(compromisos);

  const filas = activos.map((f): FilaDelPipeline => {
    const n = aNegocioVisto(f, null);
    const juzgado = {
      pasos: pasosParaLaRegla(pasosDe.get(`negocio:${f.id}`) ?? [], f.clientId ? (pasosDe.get(`empresa:${f.clientId}`) ?? []) : [], hoyISO),
      reunion: f.clientId ? (proximas.get(f.clientId) ?? null) : null,
    };
    const veLaCuenta = !f.clientId || clientes.ids.has(f.clientId);
    return {
      id: n.id,
      nombre: n.nombre,
      pipeline: n.pipeline,
      etapa: n.etapa,
      empresa: n.empresa,
      clientId: n.clientId,
      monto: n.monto,
      moneda: n.moneda,
      fechaCierre: n.fechaCierre,
      probabilidad: n.probabilidad,
      vendedor: f.vendedor?.name ?? null,
      esMio: f.vendedorId === tm.id,
      hubspotUrl: hubspotDealUrl(portal, f.hubspotDealId),
      // El negocio lo ve todo Ventas; el título de un paso o de una reunión, quien ve esa cuenta.
      paso: veLaCuenta ? pasoDeVentas(juzgado) : null,
      reunion: veLaCuenta ? juzgado.reunion : null,
      sugerencia: n.siguientePasoHubspot,
      marca: marcaDelPaso(juzgado, hoyISO),
      compromisosSinCumplir: f.clientId ? (sinCumplir.get(f.clientId) ?? 0) : 0,
    };
  });

  return {
    estado: "ok",
    vista: {
      hoyISO,
      filas: ordenarNegocios(filas),
      compromisos,
      pausados,
      pausadosMios: abiertos.filter((f) => f.vendedorId === tm.id && esPausado({ etapa: f.etapaLabel ?? f.etapaId })).length,
      calendariosSinLeer: calendarios.filter((c) => !c).length,
      copiadoAt: copia._max.sincronizadoEn?.toISOString() ?? null,
    },
  };
}
