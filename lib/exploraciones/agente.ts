/**
 * lib/exploraciones/agente.ts — correr el agente de la exploración. SERVIDOR.
 *
 * Cuatro momentos: «preparar» (antes de la primera reunión), «leer» (después de cada una), «casos»
 * (los casos de uso, en modo experimental) y «guia» (la guía de la próxima reunión, que también se
 * rearma sola al final de cada preparación y de cada lectura). La corrida queda en `AgentRun` (creada ANTES de llamar
 * a nada: cualquier falla deja su causa) y corre en segundo plano; la pantalla sigue su fase.
 *
 * ⛔ El agente PROPONE: lo que guarda es `propuesta` (lo propuesto, lo que ya leyó y sus corridas) y
 * la foto de lo leído en `test` (que conserva de la anterior las reuniones de HubSpot que ya pasaron:
 * lectura.ts › `agendaRenovada`), con la fila BLOQUEADA y releída, como el vendedor: así una corrida
 * que leyó antes de un «Descartar» no lo resucita, y la lápida de lo descartado se respeta.
 *
 * La ÚNICA excepción es lo que la preparación deja hecho sola (pedido de Elías, 2026-10-01: «debería
 * leerse la información de HubSpot para automáticamente seleccionar…»): la industria y su perfil
 * —mientras el vendedor no los haya tocado—, el área del test si no había ninguna y el país y el
 * tamaño de la empresa si estaban vacíos. Son datos de arranque, no conclusiones: se ven con quién
 * los eligió y por qué, y el vendedor los cambia con un clic (`escribirLoQueVaSolo`).
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { casosParaLasAreas } from "@/lib/casos-de-uso/en-la-preventa";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { estaColgada, MOTIVO_COLGADA } from "@/lib/agents/run-colgada";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import type { Escala } from "@/lib/escala/documento/tipos";
import {
  leerLaIndustria,
  leerLaRespuesta,
  leerLosCasos,
  juntarCobertura,
  leerLosResumenes,
  pedidoDeCasos,
  pedidoDeLaExploracion,
  pedidoDePosicionar,
  pedidoDeLaIndustria,
  pedidoDeLosResumenes,
  propuestasDelTest,
  type ContextoDeLosResumenes,
  type ContextoDelPedido,
  type Lectura,
} from "./agente-pedido";
import { proponerALaFichaSinIA } from "@/lib/clients/ficha-propuesta";
import { aportesDeLaPreparacion, ORIGEN_DE_LA_PREVENTA, propuestaParaLaFicha } from "./a-la-ficha";
import { exploracionParaLosCasos } from "./casos-de-uso";
import { listaParaProponer } from "./calidad";
import {
  cambioLoConfirmado,
  claveDelDestino,
  esFuenteDelCliente,
  destinoValido,
  fusionarPropuestas,
  industriaDelVendedor,
  laEscalaTieneBase,
  MAX_LECTURAS,
  propuestaVigente,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type LecturaDeReunion,
  type ModoDeLaCorrida,
} from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { leerContenido, leerPropuesta } from "./esquemas";
import { leerFuentes, reunionesDeLaExploracion, reunionesSinLeer, type LoQueSeLeyo, type LoQueSeRelee } from "./fuentes";
import { agendaRenovada, exploracionesQueLeenLaReunion, hayQueLeerAlPreparar, mismaReunion } from "./lectura";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { hoyEnCostaRica } from "./fechas";
import { bloqueDeInstrucciones } from "./notas-de-sesion";
import { avisoDeVoseo, contextoDeLaGuia, leerLaGuiaDelAgente, notasParaLaGuia, pedidoDeLaGuia, voseoEnLaGuia } from "./guia-pedido";
import {
  focoDeLaGuia,
  guiaDeAntesDeLaReunion,
  lecturasDeLaExploracion,
  MAX_SESIONES,
  opcionesDeLasPestanas,
  ordenDeLaConversacion,
  pestanasDeSesiones,
  preguntasParaMostrar,
  reunionDeLaSesion,
  type GuiaDeLaSesion,
  type PreguntaParaMostrar,
} from "./guia";
import type { SaberDelCliente } from "./lo-que-ya-sabemos";
import { aplicarAjustes, apuntaDelTema } from "./ajustes-de-la-guia";
import { contextoDelPlan, type PreguntaPlaneada } from "./plan-de-la-guia";
import { leerEmpresa } from "./hubspot";
import { leerLoLeido, type LoLeidoDeHubspot } from "./lo-leido";
import { investigacionDesdeLaRadiografia, leerLaRadiografia, pedidoDeLaRadiografia, radiografiaDesdeLaInvestigacion } from "./radiografia-pedido";
import type { Radiografia } from "./casillas";
import { guardarInvestigacionDeLaPreventa, ultimaInvestigacion } from "@/lib/clients/investigacion/servidor";
import { comunicacionesDeLaCuenta } from "@/lib/comunicaciones/lectura-server";
import { contextoDeSmarteam, empresaQueUsaNexus, perfilDe } from "@/lib/smarteam/contexto";
import { textoParaLaPreventa } from "@/lib/smarteam/perfil";
import {
  entradaDeLaRespuesta,
  hayQuePedirlo,
  hechosDisponibles,
  pedidoDelPosicionamiento,
  textoDelPosicionamientoDelProspecto,
  validarElPosicionamiento,
  type ContratacionEncontrada,
  type PosicionamientoDelProspecto,
  type ValoresParaElPosicionamiento,
} from "./posicionamiento";
import { posicionesDelMapa } from "./mapa";
import { DE_LA_PREVENTA, marcoDe, type Marco } from "./marco";
import { avanceDeLaEstrategia } from "./avance-del-proyecto";
import { fuentesDelProyecto, loVendidoDelProyecto } from "./fuentes-del-proyecto";
import { acuerdosDeLasReuniones } from "./historia-de-las-sesiones-server";
import { memoriaDelProyecto } from "@/lib/memoria";
import { proyectoDeContextoDeLaEmpresa } from "./escala-de-la-cuenta";
import { fuentesParaPosicionar } from "./posicionar-fuentes";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import {
  bloquearFila,
  chequeoDe,
  datosParaGuardar,
  escalaDeLaExploracion,
  escalaParaExplorar,
  estadoDesdeFila,
  leerExploracion,
  validezPara,
} from "./servidor";

export const AGENTE_DE_LA_EXPLORACION = "exploracion-de-venta";

/** Hasta cuántos días después del alta el agente lee solo las reuniones nuevas. */
export const DIAS_DE_LECTURA_AUTOMATICA = 180;

export type ModoDelAgente = ModoDeLaCorrida;

const ETIQUETA: Record<ModoDelAgente, string> = {
  preparar: "Preventa: preparar",
  leer: "Preventa: leer la reunión",
  casos: "Preventa: proponer casos de uso",
  guia: "Preventa: armar la guía de la próxima reunión",
  posicionar: "Escala: ubicar la empresa",
};

/** En la exploración de un proyecto (lib/exploraciones/marco.ts) solo se lee, se arma la guía y se ubica la escala. */
const ETIQUETA_DEL_PROYECTO: Partial<Record<ModoDelAgente, string>> = {
  leer: "Exploración: leer la sesión",
  guia: "Exploración: armar la guía de la próxima sesión",
  posicionar: "Escala: ubicar la empresa",
};

/** Lo que una corrida leyó, para guardarlo con lo propuesto. */
interface LoQueLeyoLaCorrida {
  /** Cómo lo ve el vendedor, para la historia. */
  leyo: string[];
  leidas: { sesiones: string[]; hubspot: string[]; documentos: string[]; soloNotas?: string[] };
  /**
   * La foto de HubSpot (el test, la agenda, los correos). null = no leyó HubSpot: queda la anterior.
   * Su agenda trae solo lo que viene: las que ya pasaron se conservan de la foto anterior al guardar.
   */
  foto: Omit<LoLeidoDeHubspot, "leidoEn"> | null;
  /** Las reuniones que ya pasaron y HubSpot dice que no ocurrieron: dejan de avisarse. */
  noOcurrieron?: readonly string[];
  /** Al leer: si la reunión más reciente se puso técnica. undefined = no se toca la alerta guardada. */
  tecnica?: Lectura["tecnica"];
  /** Al leer: lo que el agente dijo de cada reunión, por su clave (contenido.ts › `claveDeLaReunion`). */
  lecturas?: Record<string, LecturaDeReunion>;
  /**
   * Al preparar la preventa: el position statement del prospecto (K3). null = la base ya no permite armarlo (sin frase o
   * sin hechos): se borra el anterior, que quedaría mostrándose como válido. undefined = falló o no se pidió: queda el anterior.
   */
  posicionamiento?: PosicionamientoDelProspecto | null;
}

/** Un fallo con un mensaje que ya está escrito para el vendedor (no hace falta traducirlo). */
class FalloDeLaExploracion extends Error {}

export type ResultadoDeLanzar = { ok: true; runId: string; yaCorria: boolean } | { ok: false; status: number; error: string };

interface OpcionesDeLaCorrida {
  triggeredByEmail: string | null;
  /** Para «leer»: la reunión que hay que leer (la que acaba de llegar). */
  sesionId?: string | null;
  /** Para «leer»: el documento que el vendedor acaba de sumar. */
  documentoId?: string | null;
  /** La lanzó una reunión nueva, no una persona. */
  automatica?: boolean;
  /**
   * Para «leer»: solo el RESUMEN de estas reuniones, que el agente ya leyó antes de que resumiera cada
   * una (`resumirLoYaLeido`). No propone nada ni marca nada como leído. Lo pide el script
   * scripts/leer-reuniones-de-preventas.ts.
   */
  releer?: LoQueSeRelee;
  /**
   * Con `releer`: la lectura ENTERA de eso (propone y reemplaza lo que el agente dijo de la reunión), no solo
   * el resumen. La pide «Volver a leer» de una reunión de HubSpot: cuando su grabación no se leía, el agente
   * la había resumido como una invitación (CreditForce, 28 sep), y el resumen solo no la corregía.
   */
  completa?: boolean;
  /**
   * Para «posicionar» (2026-10-18, «Actualizar escala» en La cuenta › La escala): la venta sobre la que se ubica y cómo
   * se llama lo que se ubica («Implementación de Sales Hub», «La cuenta entera»). Lo pide siempre una persona.
   */
  ventaId?: string | null;
  objetivo?: string | null;
  /**
   * Para «posicionar» sobre la escala de la cuenta (escala única, 2026-10-28): un proyecto de la empresa cuyo handoff,
   * cuestionarios, cronograma y memoria se leen como contexto. Lo propuesto queda igual en la escala de la cuenta.
   */
  proyectoDeContexto?: string | null;
}

/**
 * La última corrida de esta exploración (la pantalla la sigue). Con `modo`, la última de ese modo: la
 * pieza Preparación mira si la última preparación falló para no relanzarla sola (Elías, 2026-10-05).
 */
export async function ultimaCorrida(exploracionId: string, clientId: string, db: Prisma.TransactionClient | typeof prisma = prisma, modo?: ModoDelAgente) {
  return db.agentRun.findFirst({
    where: {
      clientId,
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      filters: { path: ["exploracionId"], equals: exploracionId },
      ...(modo ? { AND: [{ filters: { path: ["modo"], equals: modo } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, createdAt: true, updatedAt: true, output: true, stepLabel: true, filters: true },
  });
}

export async function lanzarCorrida(exploracionId: string, modo: ModoDelAgente, opts: OpcionesDeLaCorrida): Promise<ResultadoDeLanzar> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  if (lectura.fila.archivadaEn) return { ok: false, status: 409, error: "La preventa está archivada: el agente ya no trabaja en ella." };
  const delProyecto = !!lectura.fila.projectId;
  // La exploración de un proyecto no se prepara ni propone casos de uso: lee las sesiones y arma la guía.
  if (delProyecto && !ETIQUETA_DEL_PROYECTO[modo]) return { ok: false, status: 409, error: "En la exploración de un proyecto el agente solo lee las sesiones y arma la guía." };
  const clientId = lectura.fila.clientId;

  /* Una corrida a la vez, y la revisión con el alta en la MISMA transacción, con la fila bloqueada:
     dos pedidos juntos (un clic durante la lectura automática, dos reuniones que llegan a la vez) no
     arrancan dos corridas. Una que dice RUNNING pero hace rato que no da señales murió con un
     reinicio (lib/agents/run-colgada.ts): se cierra con su motivo y se lanza otra. */
  const r = await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const ultima = await ultimaCorrida(exploracionId, clientId, tx);
    if (ultima?.status === "RUNNING") {
      if (!estaColgada(ultima)) return { runId: ultima.id, yaCorria: true };
      await tx.agentRun.update({
        where: { id: ultima.id },
        data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: MOTIVO_COLGADA }) },
      });
    }
    const run = await tx.agentRun.create({
      data: {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        clientId,
        status: "RUNNING",
        stepLabel:
          opts.releer && !opts.completa ? "Preventa: resumir las reuniones ya leídas" : ((delProyecto ? ETIQUETA_DEL_PROYECTO[modo] : null) ?? ETIQUETA[modo]),
        currentPhase: "Empezando…",
        triggeredByEmail: opts.triggeredByEmail,
        filters: { exploracionId, modo, ...(opts.automatica ? { automatica: true } : {}), ...(opts.releer && !opts.completa ? { soloResumen: true } : {}), ...(modo === "posicionar" ? { ventaId: opts.ventaId ?? null, ...(opts.proyectoDeContexto ? { proyectoDeContexto: opts.proyectoDeContexto } : {}) } : {}) } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { runId: run.id, yaCorria: false };
  });
  // En segundo plano: la pantalla sigue la fase. Cualquier falla queda en la corrida.
  if (!r.yaCorria) {
    void correr(r.runId, exploracionId, modo, opts).catch((e) => console.error("[exploraciones/agente] la corrida falló fuera de su try", e));
  }
  return { ok: true, ...r };
}

async function fase(runId: string, texto: string) {
  await prisma.agentRun.update({ where: { id: runId }, data: { currentPhase: texto } }).catch(() => {});
}

async function correr(runId: string, exploracionId: string, modo: ModoDelAgente, opts: OpcionesDeLaCorrida) {
  try {
    const escalaVig = await escalaParaExplorar();
    if (escalaVig.estado !== "ok") throw new FalloDeLaExploracion("La escala no está publicada en Nexus: sin ella el agente no puede proponer niveles.");
    const lectura = await leerExploracion(exploracionId);
    if (lectura.estado !== "ok") throw new FalloDeLaExploracion("La preventa ya no existe.");
    const fila = lectura.fila;
    let estado = estadoDesdeFila(fila);
    let escala = escalaDeLaExploracion(escalaVig.general, estado);

    if (modo === "casos") {
      await proponerCasos(runId, exploracionId, { fila, estado, escala, general: escalaVig.general }, opts);
      return;
    }
    if (modo === "posicionar") {
      await posicionarLaEscala(runId, exploracionId, { fila, estado, escala }, opts);
      return;
    }
    if (modo === "guia") {
      await fase(runId, "Armando la guía de la próxima reunión…");
      const preguntas = await armarGuia(runId, exploracionId, opts, true);
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "DONE", currentPhase: null, output: JSON.stringify({ propuestos: 0, guia: preguntas, nadaNuevo: false }) },
      });
      return;
    }

    await fase(runId, "Leyendo HubSpot y las reuniones…");
    const leido = await leerFuentes({
      exploracionId,
      clientId: fila.clientId,
      projectId: fila.projectId,
      elegidas: estado.contenido.reunionesElegidas,
      fuera: estado.contenido.fuera,
      leido: leerLoLeido(fila.test),
      companyId: fila.client.hubspotCompanyId,
      creadaEn: fila.createdAt,
      escala,
      propuesta: estado.propuesta,
      notas: estado.contenido.notas,
      sesiones: estado.contenido.sesiones,
      modo,
      sesionId: opts.sesionId,
      documentoId: opts.documentoId,
      ...(modo === "leer" && opts.releer ? { releer: opts.releer } : {}),
    });

    if (modo === "leer" && opts.releer && !opts.completa) {
      await resumirLoYaLeido(runId, exploracionId, { fila, estado, escala, leido }, opts);
      return;
    }

    // Lo que la preparación deja hecho sola; desde ahí, la escala con la industria y el perfil nuevos.
    if (modo === "preparar") {
      const armado = await armarLoQueVaSolo(runId, exploracionId, { fila, estado, escala, general: escalaVig.general, leido }, opts);
      if (armado) {
        estado = armado;
        escala = escalaDeLaExploracion(escalaVig.general, armado);
      }
    }

    const ctx: ContextoDelPedido = {
      modo,
      marco: marcoDe(fila.marco).clave,
      empresa: fila.client.name,
      industria: fila.client.industry,
      escala,
      areas: estado.areas,
      perfil: estado.perfilCierre && estado.perfilDespues ? `venta ${estado.perfilCierre} · relación ${estado.perfilDespues}` : null,
      contenido: estado.contenido,
      fuentes: leido.fuentes,
      hoy: new Date().toISOString(),
      proxima: leido.agenda[0] ?? null,
      /* Una reunión que ya pasó: la de HubSpot que se hizo, una de Meet con su texto (S) o algo que el
         vendedor sumó a mano (M). Con eso no se propone cómo conectar. */
      ...(modo === "preparar" ? { yaHablaron: (leido.reunionesDeHubspot ?? 0) > 0 || leido.fuentes.some((f) => /^[SM]\d/.test(f.id)) } : {}),
      equipo: await nombresDelEquipo(),
      ...(modo === "leer" ? planDeLaLectura(estado, escala, leido, marcoDe(fila.marco)) : {}),
    };

    /* Al preparar, primero la radiografía. R5, segunda parte (2026-10-26): la investigación es de la EMPRESA. Si tiene una
       vigente (lib/clients/investigacion), la preventa la lee de ahí como su radiografía (W1) y no busca en internet,
       aunque la empresa no esté en HubSpot. Si no, el agente investiga como siempre (W1, y W2 la industria) y lo que
       encuentra queda también en la empresa. Lo que encuentra se propone en su casilla y entra como fuente para la
       hipótesis de valor y el pitch. Si falla, la preparación sigue sin ella. */
    let deLaWeb: ItemPropuesto[] = [];
    // Lo que la investigación sabe de la empresa, para su position statement (K3): de la de la empresa o de la radiografía.
    const investigado: { radiografia: Radiografia | null; contrataciones: ContratacionEncontrada[]; industria: string | null } = {
      radiografia: null,
      contrataciones: [],
      industria: null,
    };
    let posicionamiento: PosicionamientoDelProspecto | null | undefined;
    if (modo === "preparar") {
      const vigente = await ultimaInvestigacion(fila.clientId).catch(() => null);
      const deLaEmpresa = vigente && !vigente.vencida ? radiografiaDesdeLaInvestigacion(vigente, runId) : null;
      if (deLaEmpresa) {
        await fase(runId, "Leyendo la investigación de la empresa…");
        deLaWeb = [deLaEmpresa.item];
        leido.fuentes.push(deLaEmpresa.fuente);
        investigado.radiografia = deLaEmpresa.item.valor as Radiografia;
        investigado.contrataciones = vigente!.contrataciones;
      } else if (fila.client.hubspotCompanyId) {
        await fase(runId, "Investigando la empresa en internet…");
        const r = await investigar(runId, fila, opts).catch((e) => {
          console.error(`[exploraciones/agente] radiografía ${exploracionId}`, e);
          return null;
        });
        if (r?.item) deLaWeb = [r.item];
        if (r?.industria) deLaWeb.push(r.industria.item);
        if (r?.fuente) leido.fuentes.push(r.fuente);
        if (r?.industria) leido.fuentes.push(r.industria.fuente);
        if (r?.item) investigado.radiografia = r.item.valor as Radiografia;
        investigado.contrataciones = r?.contrataciones ?? [];
        investigado.industria = r?.industria?.fuente.texto ?? null;
        const paraLaEmpresa = r?.item ? investigacionDesdeLaRadiografia(r.item.valor as Radiografia, r.contrataciones) : null;
        if (paraLaEmpresa) {
          await guardarInvestigacionDeLaPreventa({ clientId: fila.clientId, exploracionId, agentRunId: runId, ...paraLaEmpresa }).catch((e) =>
            console.error(`[exploraciones/agente] la radiografía no quedó en la empresa ${exploracionId}`, e),
          );
        }
      }
      ctx.fuentes = leido.fuentes;
      /* K3 (2026-10-28): el position statement del prospecto, desde la base de Smarteam y validado contra ella. Solo la
         preventa. Sin investigación de esta corrida, la radiografía que el vendedor ya usó. Si falla, la preparación sigue. */
      if (!fila.projectId) {
        investigado.radiografia ??= estado.contenido.casillas.radiografia ?? null;
        const datos = {
          aQuienVende: fila.client.aQuienVende,
          perfilCierre: estado.perfilCierre,
          perfilDespues: fila.client.perfilDespues ?? estado.perfilDespues,
          trafico: fila.client.trafico,
          baseConsentimiento: fila.client.baseConsentimiento,
        };
        posicionamiento = await armarElPosicionamiento(runId, fila, { ...investigado, datos }, opts).catch((e) => {
          console.error(`[exploraciones/agente] position statement ${exploracionId}`, e);
          return undefined;
        });
      }
    }

    const delTest = propuestasDelTest(leido.tests, ctx, runId);
    let deLaIA: ItemPropuesto[] = [];
    let descartadas = 0;
    let tecnica: Lectura["tecnica"];
    let lecturas: Record<string, LecturaDeReunion> | undefined;
    // «leer» llama al modelo con algo nuevo de una reunión (S/H/M). Ubicar la escala con todo lo demás es «posicionar».
    const hayQueLeer = modo === "preparar" ? leido.fuentes.length > 0 : leido.fuentes.some((f) => /^[SHM]\d/.test(f.id));
    if (hayQueLeer) {
      await fase(runId, "Pensando qué proponer…");
      const respuesta = await conContextoDeIA(
        {
          agentSlug: AGENTE_DE_LA_EXPLORACION,
          agentRunId: runId,
          clientId: fila.clientId,
          triggeredByEmail: opts.triggeredByEmail,
          origen: `exploraciones/agente:${modo}`,
        },
        () => getAnthropic().messages.create(pedidoDeLaExploracion(ctx)),
      );
      const r = leerLaRespuesta(respuesta, ctx, runId);
      deLaIA = r.items;
      descartadas = r.descartadas;
      tecnica = r.tecnica;
      if (modo === "leer") lecturas = lecturasDeLaCorrida(r.reuniones ?? [], { estado, escala, leido, ctx, runId });
    }

    await fase(runId, "Guardando lo propuesto…");
    const propuestos = await guardar(
      exploracionId,
      [...deLaWeb, ...delTest, ...deLaIA],
      {
        leyo: leido.fuentes.map((f) => f.etiqueta),
        leidas: leido.leidas,
        // Lo que viene y lo que ya se hizo en HubSpot: las dos son reuniones de la empresa (lectura.ts).
        foto: { tests: leido.tests, agenda: [...leido.agenda, ...(leido.hechasEnHubspot ?? [])], correosSinPermiso: leido.correosSinPermiso },
        noOcurrieron: leido.noOcurrieron ?? [],
        tecnica,
        lecturas,
        ...(posicionamiento !== undefined ? { posicionamiento } : {}),
      },
      { runId, modo, automatica: opts.automatica === true },
    );
    /* Lo que la preparación propuso para las casillas que tienen campo en la ficha (la radiografía, su CRM, el porqué
       ahora, quién decide…) va a la propuesta de «Información del cliente» desde el primer día, sin IA y con lo interno
       marcado (lib/exploraciones/a-la-ficha.ts; DECISIONS «La memoria de la cuenta y del proyecto»). Solo la preventa:
       la exploración de un proyecto no prepara. Si falla, la preparación sigue igual. */
    if (modo === "preparar" && !fila.projectId) {
      const aportes = aportesDeLaPreparacion([...deLaWeb, ...delTest, ...deLaIA], estado.contenido.descartadas);
      if (aportes.length) {
        const r = await proponerALaFichaSinIA({ clientId: fila.clientId, origen: ORIGEN_DE_LA_PREVENTA, armar: (f) => propuestaParaLaFicha(f, aportes) });
        if (r.status === "error") console.error(`[exploraciones/agente] la preparación no llegó a la ficha ${exploracionId}: ${r.error}`);
      }
    }
    /* Con lo nuevo ya guardado, la guía de la próxima reunión se rearma en la misma corrida (la
       pantalla la sigue sola). Si falla, lo propuesto queda igual: la guía de base sigue ahí. */
    await fase(runId, "Armando la guía de la próxima reunión…");
    await armarGuia(runId, exploracionId, opts, false).catch((e) => console.error(`[exploraciones/agente] guía ${exploracionId}`, e));

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "DONE",
        currentPhase: null,
        sourceSessionIds: leido.sesionesUsadas,
        output: JSON.stringify({
          propuestos,
          descartadas,
          fuentes: leido.fuentes.length,
          correosSinPermiso: leido.correosSinPermiso,
          nadaNuevo: modo === "leer" && !hayQueLeer,
        }),
      },
    });
    if (modo === "preparar") await leerLoQueYaHabia(exploracionId, (leido.reunionesDeHubspot ?? 0) > 0, opts).catch((e) => console.error(`[exploraciones/agente] leer lo que ya había ${exploracionId}`, e));
  } catch (e) {
    console.error(`[exploraciones/agente] ${modo} ${exploracionId}`, e);
    await prisma.agentRun
      .update({
        where: { id: runId },
        data: {
          status: "ERROR",
          currentPhase: null,
          output: JSON.stringify({
            error: e instanceof FalloDeLaExploracion ? e.message : humanizeAgentError(e),
            raw: e instanceof Error ? e.message : String(e),
          }),
        },
      })
      .catch(() => {});
  }
}

/**
 * «Actualizar escala» (2026-10-18): el agente lee TODO lo que Nexus sabe de la cuenta (posicionar-fuentes.ts) y propone
 * SOLO niveles, cada uno con la frase del cliente que lo respalda. No marca nada como leído, no toca la guía y no lee
 * una reunión: lo propuesto queda para usar en La cuenta › La escala (o en La escala de la exploración). Sin nada que el
 * cliente haya dicho o hecho, no llama al modelo: sin una pista del cliente no hay nivel.
 */
async function posicionarLaEscala(
  runId: string,
  exploracionId: string,
  d: { fila: Extract<Awaited<ReturnType<typeof leerExploracion>>, { estado: "ok" }>["fila"]; estado: EstadoDeExploracion; escala: EscalaDelLienzo },
  opts: OpcionesDeLaCorrida,
) {
  const { fila, estado, escala } = d;
  await fase(runId, "Leyendo todo lo que Nexus sabe de la cuenta…");
  const esContenedor = fila.projectId
    ? (await prisma.project.findUnique({ where: { id: fila.projectId }, select: { serviceType: true } }))?.serviceType === SENTINEL_SERVICE_TYPE
    : false;
  // En la cuenta, el proyecto de contexto (si se eligió uno) se lee como si fuera el suyo. Solo uno de esta empresa.
  const contexto = esContenedor ? await proyectoDeContextoDeLaEmpresa(fila.clientId, opts.proyectoDeContexto) : null;
  const leido = await fuentesParaPosicionar({
    clientId: fila.clientId,
    projectId: contexto ?? fila.projectId,
    esContenedor: esContenedor && !contexto,
    companyId: fila.client.hubspotCompanyId,
    ventaId: opts.ventaId ?? null,
    escala,
  });
  const ctx: ContextoDelPedido = {
    modo: "leer",
    marco: marcoDe(fila.marco).clave,
    empresa: fila.client.name,
    industria: fila.client.industry,
    escala,
    areas: estado.areas,
    perfil: estado.perfilCierre && estado.perfilDespues ? `venta ${estado.perfilCierre} · relación ${estado.perfilDespues}` : null,
    contenido: estado.contenido,
    fuentes: leido.fuentes,
    hoy: new Date().toISOString(),
    equipo: await nombresDelEquipo(),
  };
  const hayDelCliente = leido.fuentes.some((f) => esFuenteDelCliente(f.id));
  let items: ItemPropuesto[] = [];
  let descartadas = 0;
  if (hayDelCliente) {
    await fase(runId, "Ubicando cada dimensión…");
    const respuesta = await conContextoDeIA(
      {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        agentRunId: runId,
        clientId: fila.clientId,
        triggeredByEmail: opts.triggeredByEmail,
        origen: "exploraciones/agente:posicionar",
      },
      () =>
        getAnthropic().messages.create(
          pedidoDePosicionar({ ...ctx, objetivo: opts.objetivo ?? (esContenedor ? "la cuenta entera (sin un proyecto en particular)" : fila.projectId ? "el proyecto" : "la preventa") }),
        ),
    );
    const r = leerLaRespuesta(respuesta, ctx, runId);
    // Solo niveles: el pedido no pide otra cosa, y si llega, no se guarda.
    items = r.items.filter((it) => it.destino.tipo === "nivel");
    descartadas = r.descartadas + (r.items.length - items.length);
  }
  await fase(runId, "Guardando lo propuesto…");
  const propuestos = await guardar(
    exploracionId,
    items,
    { leyo: leido.fuentes.map((f) => f.etiqueta), leidas: { sesiones: [], hubspot: [], documentos: [] }, foto: null },
    { runId, modo: "posicionar", automatica: false },
  );
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: "DONE",
      currentPhase: null,
      sourceSessionIds: leido.sesionesUsadas,
      output: JSON.stringify({ propuestos, descartadas, fuentes: leido.fuentes.length, sinPistaDelCliente: !hayDelCliente, nadaNuevo: !hayDelCliente }),
    },
  });
}

/** Los nombres del equipo de Smarteam, de alta o de baja: el agente no los pone como gente del cliente. */
export async function nombresDelEquipo(): Promise<string[]> {
  const filas = await prisma.teamMember.findMany({ select: { name: true } }).catch(() => [] as { name: string }[]);
  return [...new Set(filas.map((f) => f.name.trim()).filter(Boolean))].slice(0, 80);
}

/**
 * Mientras se vende: a un prospecto o a una empresa que ya es cliente (Elías, 2026-10-08: Cicadex y
 * Grupo Servica), dentro de los seis meses del alta y antes de que la venta tenga un proyecto. Solo ahí
 * el agente lee solo: después, cada reunión de implementación dispararía una corrida (HubSpot y Claude)
 * contra el presupuesto automático, para siempre. El botón sigue a mano. En la de un cliente, además,
 * solo la reunión unida a una sesión (etapa A, 2026-10-09; reemplaza al filtro de Ventas:
 * `leerReunionNueva`, reuniones-de-hubspot.ts): las de sus proyectos en curso no la disparan. No se
 * aplica a la exploración de un proyecto: ahí lee sola la reunión que alguien unió a una sesión.
 */
export async function seVendeTodavia(exp: { clientId: string; createdAt: Date; client: { kind: string } }, ahora = new Date()): Promise<boolean> {
  if (exp.client.kind !== "PROSPECTO" && exp.client.kind !== "CLIENTE") return false;
  if (ahora.getTime() - exp.createdAt.getTime() > DIAS_DE_LECTURA_AUTOMATICA * 24 * 60 * 60 * 1000) return false;
  const yaHayProyecto = await prisma.project.count({ where: proyectoClasificableWhere({ clientId: exp.clientId, createdAt: { gte: exp.createdAt } }) });
  return yaHayProyecto === 0;
}

/**
 * La primera preparación lee sola las reuniones que ya estaban grabadas (Elías, 2026-10-07): una
 * preventa que se abría con reuniones ya hechas quedaba con las hipótesis de la preparación y las
 * reuniones «sin leer» hasta que alguien apretara el botón. Solo si el agente nunca leyó, mientras se
 * vende y si quedó algo con conversación sin leer (`hayQueLeerAlPreparar`) o una reunión de HubSpot que
 * ya ocurrió (la preparación la miró, pero solo la lectura la resume). Una sola lectura (las dos
 * reuniones de Meet más recientes): lo demás queda avisado «sin leer».
 */
async function leerLoQueYaHabia(exploracionId: string, huboReunionesEnHubspot: boolean, opts: OpcionesDeLaCorrida) {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok" || lectura.fila.archivadaEn) return;
  const fila = lectura.fila;
  const propuesta = leerPropuesta(fila.propuesta);
  if (propuesta.corridas.some((c) => c.modo === "leer")) return;
  if (!(await seVendeTodavia(fila))) return;
  if (!huboReunionesEnHubspot) {
    /* Solo lo de la exploración (etapa A): lo que sus sesiones (en un prospecto, también las que entraron
       solas) dejaron sin leer. Las de HubSpot no cuentan (las miró la preparación). */
    const contenido = estadoDesdeFila(fila).contenido;
    const sinLeer = await reunionesSinLeer({
      exploracionId,
      clientId: fila.clientId,
      creadaEn: fila.createdAt,
      propuesta,
      leido: leerLoLeido(fila.test),
      sesiones: contenido.sesiones,
      fuera: contenido.fuera,
      elegidas: contenido.reunionesElegidas,
    });
    if (!hayQueLeerAlPreparar(sinLeer.map((r) => ({ origen: r.origen, leida: false })))) return;
  }
  await lanzarCorrida(exploracionId, "leer", { triggeredByEmail: opts.triggeredByEmail, automatica: true });
}

/** Cuántas veces se continúa una respuesta que la búsqueda web dejó en pausa. */
const CONTINUACIONES_DE_LA_BUSQUEDA = 3;

/**
 * La radiografía de la empresa: una llamada con la búsqueda web de Anthropic y nuestra herramienta.
 * Si la búsqueda deja la respuesta en pausa, se continúa con lo que trajo (patrón del SDK).
 */
async function investigar(runId: string, fila: { clientId: string; client: { name: string; industry: string | null; hubspotCompanyId: string | null } }, opts: OpcionesDeLaCorrida) {
  const empresa = fila.client.hubspotCompanyId ? await leerEmpresa(fila.client.hubspotCompanyId) : null;
  const pedido = pedidoDeLaRadiografia({
    empresa: empresa?.nombre ?? fila.client.name,
    dominio: empresa?.dominio ?? null,
    industria: empresa?.industria ?? fila.client.industry,
    pais: empresa?.pais ?? null,
    hoy: hoyEnCostaRica(),
  });
  const contenido: Anthropic.Messages.ContentBlock[] = [];
  const mensajes = [...pedido.messages];
  for (let vuelta = 0; vuelta <= CONTINUACIONES_DE_LA_BUSQUEDA; vuelta++) {
    const respuesta = await conContextoDeIA(
      {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        agentRunId: runId,
        clientId: fila.clientId,
        triggeredByEmail: opts.triggeredByEmail,
        origen: "exploraciones/agente:radiografia",
      },
      () => getAnthropic().messages.create({ ...pedido, messages: mensajes }),
    );
    contenido.push(...respuesta.content);
    if (respuesta.stop_reason !== "pause_turn") break;
    // El servidor de Anthropic pausó las búsquedas: se reenvía lo que trajo y sigue donde quedó.
    mensajes.push({ role: "assistant", content: respuesta.content as unknown as Anthropic.Messages.ContentBlockParam[] });
  }
  return leerLaRadiografia(contenido, runId);
}

/**
 * El position statement del prospecto (K3, 2026-10-28; lib/exploraciones/posicionamiento.ts): la frase de la base, dos o
 * tres hechos de la investigación con su fuente y el frente que calza, validado contra la base. Sin frase en la base o
 * sin hechos, no llama al modelo y devuelve null: el anterior se borra (se armó con una base que ya no es la de hoy).
 */
async function armarElPosicionamiento(
  runId: string,
  fila: { clientId: string; client: { name: string } },
  investigado: { radiografia: Radiografia | null; contrataciones: ContratacionEncontrada[]; industria: string | null; datos: ValoresParaElPosicionamiento },
  opts: OpcionesDeLaCorrida,
): Promise<PosicionamientoDelProspecto | null> {
  const empresa = await empresaQueUsaNexus();
  if (!empresa) return null;
  const perfil = await perfilDe(empresa.id);
  const ctx = { empresa: fila.client.name, base: { frase: perfil.positionStatement, frentes: perfil.frentes }, hechos: hechosDisponibles(investigado) };
  if (!hayQuePedirlo(ctx)) return null;
  await fase(runId, "Armando su position statement…");
  const respuesta = await conContextoDeIA(
    {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      agentRunId: runId,
      clientId: fila.clientId,
      triggeredByEmail: opts.triggeredByEmail,
      origen: "exploraciones/agente:posicionamiento",
    },
    () => getAnthropic().messages.create(pedidoDelPosicionamiento(ctx)),
  );
  return validarElPosicionamiento(entradaDeLaRespuesta(respuesta.content), ctx, { corridaId: runId });
}

/**
 * Los casos de uso: el agente parte del catálogo de Smarteam (lib/casos-de-uso, los que tocan las áreas en juego)
 * y propone uno propio solo si ninguno calza, a partir de dónde parece estar cada equipo, lo que le falta y sus
 * metas. Cada tanda no repite lo que ya está ni lo que el vendedor descartó. No lee HubSpot ni las reuniones.
 */
async function proponerCasos(
  runId: string,
  exploracionId: string,
  ex: {
    fila: { clientId: string; client: { name: string } };
    estado: EstadoDeExploracion;
    escala: EscalaDelLienzo;
    general: Escala;
  },
  opts: OpcionesDeLaCorrida,
) {
  if (ex.estado.areas.length === 0) throw new FalloDeLaExploracion("Elige primero las áreas en juego: los casos de uso se proponen por área.");
  if (!laEscalaTieneBase(ex.estado)) {
    throw new FalloDeLaExploracion("Todavía no hay sobre qué basarlos: los casos de uso se proponen cuando la escala tenga sus primeros niveles (el diagnóstico o la primera reunión).");
  }
  await fase(runId, "Mirando dónde está cada equipo…");
  const pendientes = pendientesVigentes(ex.estado, ex.general, ex.escala);
  const ctx = {
    empresa: ex.fila.client.name,
    edicion: ex.escala.edicion?.nombre ?? "escala general",
    areas: ex.escala.areas
      .filter((a) => ex.estado.areas.includes(a.id))
      .map((a) => ({ id: a.id, nombre: a.nombre, dimensiones: a.dimensiones.filter((d) => d.aplica).map((d) => ({ id: d.id, nombre: d.nombre })) })),
    exploracion: exploracionParaLosCasos(ex.estado, ex.escala, pendientes),
    yaEstan: [
      ...Object.values(ex.estado.contenido.casosDeUso).map((c) => c.titulo),
      ...pendientes.filter((it) => it.destino.tipo === "casoDeUso").map((it) => (it.valor as { titulo: string }).titulo),
    ],
    descartados: ex.estado.contenido.casosDescartados,
    instrucciones: bloqueDeInstrucciones(ex.estado.contenido.notas, "casos"),
    catalogo: casosParaLasAreas(ex.estado.areas),
  };
  await fase(runId, "Pensando casos de uso…");
  const respuesta = await conContextoDeIA(
    {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      agentRunId: runId,
      clientId: ex.fila.clientId,
      triggeredByEmail: opts.triggeredByEmail,
      origen: "exploraciones/agente:casos",
    },
    () => getAnthropic().messages.create(pedidoDeCasos(ctx)),
  );
  const r = leerLosCasos(respuesta, ctx, runId);
  await fase(runId, "Guardando lo propuesto…");
  const propuestos = await guardar(
    exploracionId,
    r.items,
    { leyo: ["Dónde está cada equipo en la escala", "Lo que el cliente contó en las reuniones"], leidas: { sesiones: [], hubspot: [], documentos: [] }, foto: null },
    { runId, modo: "casos", automatica: false },
  );
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "DONE", currentPhase: null, output: JSON.stringify({ propuestos, descartadas: r.descartadas, nadaNuevo: false }) },
  });
}

/** Las fuentes que bastan para saber qué hace la empresa: la ficha, los contactos, los negocios, el test y la actividad reciente, recortadas. */
function fuentesParaLaIndustria(leido: LoQueSeLeyo) {
  const deLaEmpresa = leido.fuentes.filter((f) => /^(E0|W0|C0|D0|T\d+)$/.test(f.id));
  const actividad = leido.fuentes.filter((f) => /^H\d+$/.test(f.id)).slice(0, 6);
  return [...deLaEmpresa, ...actividad].map((f) => ({ ...f, texto: f.texto.slice(0, 1500) }));
}

/**
 * Lo que la preparación deja hecho SOLA, antes de pensar las hipótesis: la industria (la edición de
 * la escala) y su perfil, mientras el vendedor no los haya tocado; el área del test, si no había
 * ninguna; el país y el tamaño de la empresa, si estaban vacíos. Devuelve el estado nuevo, o null si
 * no cambió nada. Una falla al elegir la industria no frena la preparación: sigue con la que había.
 */
async function armarLoQueVaSolo(
  runId: string,
  exploracionId: string,
  ex: { fila: { clientId: string; client: { name: string } }; estado: EstadoDeExploracion; escala: EscalaDelLienzo; general: Escala; leido: LoQueSeLeyo },
  opts: OpcionesDeLaCorrida,
): Promise<EstadoDeExploracion | null> {
  let industria: Awaited<ReturnType<typeof leerLaIndustria>> = null;
  /* Se pregunta mientras el vendedor no la haya elegido, o si la eligió pero todavía no hay una
     sugerida a la que pueda volver con «Restablecer». */
  const sinSugerida = !ex.estado.contenido.edicionElegida?.sugerida;
  if ((!industriaDelVendedor(ex.estado) || sinSugerida) && ex.general.ediciones.length > 0) {
    await fase(runId, "Eligiendo la industria…");
    const pregunta = (p: EscalaDelLienzo["perfil"]["cierre"]) => (p ? `${p.pregunta}: ${p.opciones.map((o) => `${o.nombre} (${o.definicion})`).join("; ")}` : null);
    const ctx = {
      empresa: ex.fila.client.name,
      ediciones: ex.escala.ediciones,
      perfil: { cierre: pregunta(ex.escala.perfil.cierre), despues: pregunta(ex.escala.perfil.despues) },
      fuentes: fuentesParaLaIndustria(ex.leido),
    };
    if (ctx.fuentes.length > 0) {
      try {
        const respuesta = await conContextoDeIA(
          {
            agentSlug: AGENTE_DE_LA_EXPLORACION,
            agentRunId: runId,
            clientId: ex.fila.clientId,
            triggeredByEmail: opts.triggeredByEmail,
            origen: "exploraciones/agente:industria",
          },
          () => getAnthropic().messages.create(pedidoDeLaIndustria(ctx)),
        );
        industria = leerLaIndustria(respuesta, ctx);
      } catch (e) {
        console.error(`[exploraciones/agente] no se pudo elegir la industria de ${exploracionId}`, e);
      }
    }
  }

  const habituales = Object.fromEntries(ex.general.ediciones.map((e) => [e.slug, e.perfilHabitual]));
  const areasDelTest = [...new Set(ex.leido.tests.map((t) => t.resultado.areaId))].filter((id) => ex.general.areas.some((a) => a.id === id));
  const nombreDeArea = (id: string) => ex.escala.areas.find((a) => a.id === id)?.nombre ?? id;

  return escribirLoQueVaSolo(exploracionId, (actual) => {
    let e = actual;
    // Se vuelve a mirar con la fila bloqueada: si el vendedor eligió mientras tanto, manda lo suyo.
    if (industria) {
      const perfil = industria.edicion ? habituales[industria.edicion] : industria.perfil;
      const sugerida = {
        edicion: industria.edicion,
        cierre: perfil?.cierre ?? null,
        despues: perfil?.despues ?? null,
        por: "agente" as const,
        ...(industria.razon ? { razon: industria.razon } : {}),
      };
      e = industriaDelVendedor(e)
        ? // La eligió el vendedor: no se toca, pero queda la sugerida para poder volver a ella.
          { ...e, contenido: { ...e.contenido, edicionElegida: { por: "vendedor", sugerida } } }
        : {
            ...e,
            edicion: industria.edicion,
            ...(perfil ? { perfilCierre: perfil.cierre, perfilDespues: perfil.despues } : {}),
            contenido: { ...e.contenido, edicionElegida: { por: "agente", razon: industria.razon, sugerida } },
          };
    }
    if (e.areas.length === 0 && areasDelTest.length > 0) {
      e = {
        ...e,
        areas: areasDelTest,
        contenido: {
          ...e.contenido,
          razonesDeAreas: { ...Object.fromEntries(areasDelTest.map((id) => [id, `Hizo el test de ${nombreDeArea(id)}`])), ...e.contenido.razonesDeAreas },
        },
      };
    }
    const m = e.contenido.medicion;
    const pais = !m.pais && ex.leido.empresa?.pais ? ex.leido.empresa.pais.slice(0, 80) : null;
    const personas = !m.personasEmpresa && ex.leido.empresa?.empleados ? ex.leido.empresa.empleados.slice(0, 40) : null;
    if (pais || personas) {
      e = { ...e, contenido: { ...e.contenido, medicion: { ...m, ...(pais ? { pais } : {}), ...(personas ? { personasEmpresa: personas } : {}) } } };
    }
    return e;
  }, ex.general);
}

/**
 * Escribe lo que va solo con la fila BLOQUEADA y releída, y sube la versión (es un cambio de lo
 * confirmado: si el vendedor tenía la pantalla abierta, su próximo cambio recarga en vez de pisar).
 * Lo pendiente que quedó sin dónde ir con la industria nueva se cuenta como inválido en la pantalla,
 * como siempre (`destinoValido`).
 */
async function escribirLoQueVaSolo(
  exploracionId: string,
  cambio: (e: EstadoDeExploracion) => EstadoDeExploracion,
  general: Escala,
): Promise<EstadoDeExploracion | null> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({
      where: { id: exploracionId },
      select: {
        contenido: true,
        propuesta: true,
        areas: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        responsableEmail: true,
        archivadaEn: true,
      },
    });
    if (!fila || fila.archivadaEn) return null;
    const antes = estadoDesdeFila(fila);
    const despues = cambio(antes);
    if (!cambioLoConfirmado(antes, despues)) return null;
    // Una edición que la escala publicada ya no trae no se escribe (la lista cerrada del pedido lo evita; esto lo asegura).
    if (despues.edicion !== null && !general.ediciones.some((e) => e.slug === despues.edicion)) return null;
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { ...datosParaGuardar(despues), version: { increment: 1 } } });
    return despues;
  });
}

/**
 * La guía de la PRÓXIMA reunión (lib/exploraciones/guia.ts): el código elige qué cubre (las tarjetas
 * vacías del resumen y hasta 4 dimensiones sin evidencia) y el agente escribe las preguntas, las
 * repreguntas y las objeciones. Lee la exploración de nuevo: corre después de guardar lo propuesto.
 * Devuelve cuántas preguntas armó (0 si el agente no devolvió nada que sirva: queda la de base).
 */
async function armarGuia(runId: string, exploracionId: string, opts: OpcionesDeLaCorrida, registrar: boolean): Promise<number> {
  const armada = await armarLaGuiaSinGuardar(runId, exploracionId, opts);
  if (!armada) return 0;
  // Se guarda como la de su sesión, si la próxima está planeada: así su «antes» queda aunque pase.
  await guardarGuia(exploracionId, armada.guia, registrar ? { runId, automatica: opts.automatica === true } : null, armada.ctx.proxima.sesionId ?? null);
  return armada.guia.preguntas.length;
}

/**
 * Arma la guía de la próxima sesión SIN guardarla: el contexto (con lo que ya sabemos y el plan en la preventa), el
 * pedido al agente y la lectura, con el reintento en tuteo. Lo usan `armarGuia` y el script que mide la guía nueva
 * contra la vieja (scripts/medir-guia-de-preventa.ts). Solo lee la base; la llamada queda en el medidor.
 */
export async function armarLaGuiaSinGuardar(
  runId: string | null,
  exploracionId: string,
  opts: Pick<OpcionesDeLaCorrida, "triggeredByEmail">,
): Promise<{ guia: GuiaDeLaSesion; ctx: ReturnType<typeof contextoDeLaGuia>; preguntas: PreguntaParaMostrar[] } | null> {
  const { fila, estado, escala, posiciones, loLeido, marco, ctx, ahora, automaticas } = await contextoParaLaGuia(exploracionId);
  const pedir = (aviso = "") =>
    conContextoDeIA(
      {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        agentRunId: runId,
        clientId: fila.clientId,
        triggeredByEmail: opts.triggeredByEmail,
        origen: "exploraciones/agente:guia",
      },
      () => {
        const pedido = pedidoDeLaGuia(ctx);
        return getAnthropic().messages.create(aviso ? { ...pedido, system: `${pedido.system as string}${aviso}` } : pedido);
      },
    );
  let guia = leerLaGuiaDelAgente(await pedir(), ctx, runId, ahora);
  if (!guia) return null;
  /* El vendedor lee la guía en voz alta: tiene que estar en tuteo. La de CreditForce (2026-10-01) salió
     en voseo («vivís», «podés») porque las fuentes lo estaban: si pasa, se pide una vez más avisándolo. */
  const voseo = voseoEnLaGuia(guia);
  if (voseo.length) {
    const otra = leerLaGuiaDelAgente(await pedir(avisoDeVoseo(voseo)), ctx, runId, ahora);
    if (otra && voseoEnLaGuia(otra).length < voseo.length) guia = otra;
  }
  // Lo que va a ver el vendedor: las preguntas del plan, con la de respaldo donde el agente repitió lo sabido.
  // La guía recién armada: cuenta todo lo leído (sin `hasta`).
  const plan = ctx.saber ? planDeLaGuiaDeLaSesion(estado, loLeido.tests, escala, posiciones, ctx.proxima.sesionId ?? null, marco, { automaticas }) : null;
  const preguntas = preguntasParaMostrar(guia, guia.huecos, guia.enfoque, escala, undefined, marco, plan ?? undefined);
  return { guia, ctx, preguntas };
}

/**
 * Todo lo que necesita la guía de la PRÓXIMA sesión, leído de la base: la fila, su estado, la escala con su edición, dónde
 * parece estar cada dimensión y el contexto del pedido (con lo que ya sabemos y el plan, en la preventa). Lo usan armar la
 * guía, «Regenerar» una pregunta y el asistente (lib/exploraciones/guia-ajustes-server.ts): tienen que decir lo mismo.
 */
export async function contextoParaLaGuia(exploracionId: string) {
  const escalaVig = await escalaParaExplorar();
  if (escalaVig.estado !== "ok") throw new FalloDeLaExploracion("La escala no está publicada en Nexus.");
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") throw new FalloDeLaExploracion("La preventa ya no existe.");
  const fila = lectura.fila;
  const estado = estadoDesdeFila(fila);
  const escala = escalaDeLaExploracion(escalaVig.general, estado);
  const pendientes = pendientesVigentes(estado, escalaVig.general, escala);
  const loLeido = leerLoLeido(fila.test);
  const ahora = new Date();
  const marco = marcoDe(fila.marco);
  /* En un prospecto, las reuniones que entraron solas como sesión y ya pasaron cuentan para el número de
     la próxima (no son `SesionPlaneada`). En un cliente o un proyecto nada entra solo. */
  const automaticas = !fila.projectId && fila.client.kind === "PROSPECTO";
  const clavesDeLasSesiones = Object.keys(lecturasDeLaExploracion(estado.propuesta.lecturas, estado.contenido.sesiones, { automaticas, fuera: estado.contenido.fuera }));
  /* En un proyecto, la guía pregunta desde lo que ya se sabe: el handoff, los cuestionarios, el kickoff, lo que Nexus sabe
     de la cuenta (la ficha, lo aprendido en la preventa, las notas y los correos de HubSpot) y lo que estimó la preventa.
     El kickoff y la cuenta entraron el 2026-10-20 (caso CEMACO): antes la guía no los leía. */
  const TOPE_DE_LA_FUENTE: Readonly<Record<string, number>> = { V0: 8_000, F0: 6_000 };
  const [delProyecto, loVendido, acuerdos, memoriaProyecto] = await Promise.all([
    fila.projectId
      ? fuentesDelProyecto(fila.projectId, fila.clientId)
          .catch(() => [])
          .then((fs) => fs.filter((f) => ["V0", "Q0", "K0", "F0", "P0"].includes(f.id)).map((f) => ({ ...f, texto: f.texto.slice(0, TOPE_DE_LA_FUENTE[f.id] ?? 4_000) })))
      : Promise.resolve([]),
    fila.projectId ? loVendidoDelProyecto(fila.projectId).catch(() => "") : Promise.resolve(undefined),
    // Lo acordado en la minuta de cada sesión: ahí suele estar lo que alguien pidió explorar en la siguiente.
    acuerdosDeLasReuniones(fila.clientId, clavesDeLasSesiones).catch(() => ({})),
    // Lo del proyecto que no es de las sesiones (las demás reuniones, los compromisos): las sesiones van aparte, con más detalle.
    fila.projectId
      ? memoriaDelProyecto(fila.projectId, {
          lector: "guia-de-la-exploracion",
          yaLeidas: clavesDeLasSesiones.filter((k) => k.startsWith("meet:")).map((k) => k.slice("meet:".length)),
        })
          .then((m) => m.texto)
          .catch(() => "")
      : Promise.resolve(undefined),
  ]);
  const proyecto = fila.projectId ? delProyecto.map((f) => `--- ${f.etiqueta} ---\n${f.texto}`).join("\n\n") : undefined;
  const pasadasSinSesion = automaticas
    ? await reunionesDeLaExploracion({
        exploracionId,
        clientId: fila.clientId,
        projectId: fila.projectId,
        creadaEn: fila.createdAt,
        propuesta: estado.propuesta,
        leido: loLeido,
        sesiones: estado.contenido.sesiones,
        fuera: estado.contenido.fuera,
        elegidas: estado.contenido.reunionesElegidas,
      })
        .then(
          (rs) =>
            pestanasDeSesiones(estado.contenido.sesiones, rs, hoyEnCostaRica(ahora), opcionesDeLasPestanas(true, estado.contenido.fuera)).filter((p) => !p.sesion && p.hecha)
              .length,
        )
        .catch(() => 0)
    : 0;
  const posiciones = posicionesDelMapa(estado, pendientes);
  /* La preventa (K7 y R13, 2026-10-26): las notas recientes de HubSpot con su texto (la del test primero) y lo que
     Smarteam dice de sí mismo, corto. Si no se pueden leer, la guía se arma igual. */
  const [notasDeHubspot, smarteam] =
    marco.clave === "venta"
      ? await Promise.all([
          // 30 (el tope de la puerta): con muchas notas recientes, la del test igual tiene que entrar y va primero.
          comunicacionesDeLaCuenta(fila.clientId, { tope: 30, tipo: "nota" })
            .then((ns) => notasParaLaGuia(ns))
            .catch(() => []),
          /* K3 (2026-10-28): con el position statement del prospecto armado, la apertura lo usa: la frase de Smarteam con
             los hechos de la empresa y el frente que calza (o a medias, dicho). */
          contextoDeSmarteam()
            .then((c) => {
              const ps = estado.propuesta.posicionamiento;
              return [textoParaLaPreventa(c), ps ? textoDelPosicionamientoDelProspecto(ps, fila.client.name) : null].filter(Boolean).join("\n\n") || null;
            })
            .catch(() => null),
        ])
      : [[], null];
  const ctx = contextoDeLaGuia({
    notasDeHubspot,
    smarteam,
    marco,
    proyecto,
    loVendido,
    acuerdos,
    memoriaDelProyecto: memoriaProyecto,
    automaticas,
    pasadasSinSesion,
    empresa: fila.client.name,
    industria: fila.client.industry,
    estado,
    escala,
    posiciones,
    pendientes,
    agenda: loLeido.agenda.filter((a) => Date.parse(a.inicio) > ahora.getTime()),
    conTest: loLeido.tests.length > 0,
    hoy: hoyEnCostaRica(ahora),
    // La preventa parte de lo que el cliente ya respondió y cierra con lo que falta para proponer (iniciativa A).
    tests: loLeido.tests,
    ...(marco.clave === "venta" ? { faltanParaProponer: listaParaProponer(estado, chequeoDe(escala, estado), hoyEnCostaRica(ahora)) } : {}),
  });
  /* `delProyecto` (cada fuente con su id) y `memoriaDelProyecto` también los lee el asistente
     (lib/operaciones/guia-server.ts › `loEstableDeLaGuia`): sin F0, que el chat ya tiene en su contexto. */
  return { fila, estado, escala, general: escalaVig.general, posiciones, pendientes, loLeido, marco, ctx, ahora, delProyecto, memoriaDelProyecto: memoriaProyecto ?? "", automaticas };
}

/**
 * El plan de la guía y lo que ya se sabe, como lo arma la pantalla (piezas-de-la-sesion.tsx): el de la preventa, o el de
 * la estrategia en un proyecto (sin el test, 2026-10-19).
 */
export function planDeLaGuiaDeLaSesion(
  estado: EstadoDeExploracion,
  tests: LoLeidoDeHubspot["tests"],
  escala: EscalaDelLienzo,
  posiciones: ReturnType<typeof posicionesDelMapa>,
  sesionId: string | null,
  marco: Marco = marcoDe("venta"),
  /** `hasta`: la fecha de la guía que se muestra (lo leído después no mueve su plan); `automaticas`: un prospecto. */
  o: { hasta?: string | null; automaticas?: boolean } = {},
): { plan: PreguntaPlaneada[]; saber: SaberDelCliente } | null {
  const delPlan = contextoDelPlan({ estado, tests, escala, posiciones, sesionId, marco: marco.clave, ...o });
  const foco = focoDeLaGuia(estado.contenido.casillas, escala, estado.areas, posiciones, estado.contenido.aExplorar, marco, delPlan);
  return foco.plan ? { plan: foco.plan, saber: delPlan.saber } : null;
}

/**
 * Lo que se planeó preguntar en la reunión más reciente que se lee: la guía de su sesión o la viva,
 * solo si se armó ANTES de la reunión (`guiaDeAntesDeLaReunion`). Con eso el agente dice qué se
 * respondió (rediseño de las sesiones, 2026-10-07). Sin una guía de antes no hay con qué comparar: la
 * lectura trae solo el resumen. Antes se comparaba contra lo que faltaba el día de la lectura, y una
 * reunión leída tarde salía con «no se preguntó» en preguntas que nadie llevó.
 */
function planDeLaLectura(
  estado: EstadoDeExploracion,
  escala: EscalaDelLienzo,
  leido: Pick<LoQueSeLeyo, "reunionesLeidas">,
  marco: Marco,
): Pick<ContextoDelPedido, "reuniones" | "planeado"> {
  const reuniones = leido.reunionesLeidas ?? [];
  if (!reuniones.length) return {};
  const ultima = [...reuniones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const comoReunion = { id: ultima.id, titulo: ultima.titulo, fecha: ultima.fecha, origen: ultima.origen, leida: true };
  const sesion = estado.contenido.sesiones.find((s) => reunionDeLaSesion(s, [comoReunion]) !== null) ?? null;
  const guia = guiaDeAntesDeLaReunion(estado.propuesta, sesion?.id ?? null, ultima.fecha);
  /* Con lo que decidió el vendedor sobre esa guía (sus preguntas, las cambiadas, las quitadas): lo que se llevó a la reunión.
     En el orden en que pensaba hacerlas («En orden», con el que eligió arrastrando: 2026-10-20). */
  const preguntas = ordenDeLaConversacion(
    aplicarAjustes(guia ? preguntasParaMostrar(guia, guia.huecos, guia.enfoque, escala, undefined, marco) : [], sesion?.ajustesDeLaGuia, apuntaDelTema(escala)),
  )
    .filter((p) => p.tipo !== "abierto")
    .slice(0, 16)
    .map((p) => ({ para: p.para, pregunta: (p.tema ? `${p.tema}: ${p.pregunta}` : p.pregunta).slice(0, 400) }));
  // K11: con qué equipo fue cada reunión (el de su sesión, como la liga la pantalla: fuentes.ts › `leerFuentes`).
  return {
    reuniones: reuniones.map((r) => ({ fuente: r.fuente, etiqueta: r.etiqueta, ...(r.equipo ? { equipo: r.equipo } : {}) })),
    planeado: { objetivo: sesion?.objetivo ?? guia?.objetivo ?? null, preguntas },
  };
}

/** Lo que dijo el agente de cada reunión, por su clave. La cobertura es de la más reciente: lo planeado es de ella. */
function lecturasDeLaCorrida(
  dichas: NonNullable<Lectura["reuniones"]>,
  o: {
    estado: EstadoDeExploracion;
    escala: EscalaDelLienzo;
    leido: LoQueSeLeyo;
    ctx: Pick<ContextoDelPedido, "planeado" | "marco" | "reuniones">;
    runId: string;
    /** El resumen de una reunión leída hace tiempo: lo listo de hoy no es lo que había antes de ella. */
    sinListosAntes?: boolean;
  },
): Record<string, LecturaDeReunion> {
  const reuniones = o.leido.reunionesLeidas ?? [];
  const ultima = [...reuniones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  // En un proyecto, lo listo es la estrategia (avance-del-proyecto.ts), no «lista para proponer».
  const listosAntes = o.sinListosAntes
    ? null
    : (o.ctx.marco === "cs" ? avanceDeLaEstrategia(o.estado) : listaParaProponer(o.estado, chequeoDe(o.escala, o.estado)))
        .filter((p) => p.cumplido)
        .map((p) => p.id);
  const en = new Date().toISOString();
  /* La misma reunión puede llegar por Meet y por HubSpot (empiezan a menos de dos horas): la pestaña
     muestra una sola, así que las dos llevan lo respondido de cualquiera de ellas. */
  const deLaUltima = new Set(reuniones.filter((r) => !!ultima && mismaReunion(r.fecha, ultima.fecha)).map((r) => r.fuente));
  const cobertura = juntarCobertura(dichas.filter((d) => deLaUltima.has(d.fuente)).map((d) => d.cobertura));
  const out: Record<string, LecturaDeReunion> = {};
  for (const d of dichas) {
    const r = reuniones.find((x) => x.fuente === d.fuente);
    if (!r) continue;
    const esLaUltima = deLaUltima.has(r.fuente);
    // K11: con qué equipo se leyó; si la sesión cambia de equipo, la pantalla sugiere volver a leerla.
    const equipo = o.ctx.reuniones?.find((x) => x.fuente === r.fuente)?.equipo;
    out[r.clave] = {
      etiqueta: r.etiqueta.slice(0, 300),
      resumen: d.resumen,
      ...(esLaUltima && o.ctx.planeado?.objetivo ? { objetivo: o.ctx.planeado.objetivo } : {}),
      cobertura: esLaUltima ? cobertura : [],
      ...(listosAntes ? { listosAntes } : {}),
      fecha: r.fecha,
      titulo: r.titulo.slice(0, 300),
      ...(equipo ? { equipo } : {}),
      en,
      corridaId: o.runId,
    };
  }
  return out;
}

/**
 * Solo el resumen de reuniones que el agente leyó antes de que resumiera cada una (rediseño del
 * 2026-10-07): sin él, el «Después» de esas sesiones no decía qué se habló. No propone nada, no marca
 * nada como leído y no toca la guía: lo que el vendedor ya usó o descartó no reaparece. De lo que se
 * relee, solo las reuniones van al modelo (una nota de HubSpot no es una reunión).
 */
async function resumirLoYaLeido(
  runId: string,
  exploracionId: string,
  ex: { fila: { clientId: string; marco?: string | null; client: { name: string } }; estado: EstadoDeExploracion; escala: EscalaDelLienzo; leido: LoQueSeLeyo },
  opts: OpcionesDeLaCorrida,
) {
  const reuniones = ex.leido.reunionesLeidas ?? [];
  let lecturas: Record<string, LecturaDeReunion> = {};
  if (reuniones.length) {
    const deReunion = new Set(reuniones.map((r) => r.fuente));
    const ctx: ContextoDeLosResumenes = {
      empresa: ex.fila.client.name,
      fuentes: ex.leido.fuentes.filter((f) => deReunion.has(f.id)),
      hoy: new Date().toISOString(),
      proxima: ex.leido.agenda[0] ?? null,
      equipo: await nombresDelEquipo(),
      ...planDeLaLectura(ex.estado, ex.escala, ex.leido, marcoDe(ex.fila.marco)),
    };
    await fase(runId, "Resumiendo las reuniones…");
    const respuesta = await conContextoDeIA(
      {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        agentRunId: runId,
        clientId: ex.fila.clientId,
        triggeredByEmail: opts.triggeredByEmail,
        origen: "exploraciones/agente:resumen",
      },
      () => getAnthropic().messages.create(pedidoDeLosResumenes(ctx)),
    );
    lecturas = lecturasDeLaCorrida(leerLosResumenes(respuesta, ctx), { ...ex, ctx, runId, sinListosAntes: true });
    await fase(runId, "Guardando los resúmenes…");
    await guardarLecturas(exploracionId, lecturas, { runId, leyo: reuniones.map((r) => r.etiqueta) });
  }
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: "DONE",
      currentPhase: null,
      sourceSessionIds: ex.leido.sesionesUsadas,
      output: JSON.stringify({ propuestos: 0, resumidas: Object.keys(lecturas).length, nadaNuevo: Object.keys(lecturas).length === 0 }),
    },
  });
}

/**
 * Suma lecturas con la fila bloqueada. Lo que ya estaba gana (una lectura completa dice más que un
 * resumen), y lo nuevo va primero: son reuniones viejas, las primeras en salir al pasar el tope.
 */
async function guardarLecturas(exploracionId: string, lecturas: Record<string, LecturaDeReunion>, corrida: { runId: string; leyo: string[] }) {
  if (!Object.keys(lecturas).length) return;
  await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { propuesta: true } });
    if (!fila) return;
    const actual = leerPropuesta(fila.propuesta);
    const propuesta = {
      ...actual,
      lecturas: Object.fromEntries(Object.entries({ ...lecturas, ...actual.lecturas }).slice(-MAX_LECTURAS)),
      corridas: [
        ...actual.corridas,
        {
          id: corrida.runId,
          modo: "leer" as const,
          en: new Date().toISOString(),
          propuestos: 0,
          leyo: corrida.leyo.map((f) => f.slice(0, 200)).slice(0, 40),
          alimento: [],
          automatica: false,
        },
      ].slice(-50),
    };
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { propuesta: propuesta as unknown as Prisma.InputJsonValue } });
  });
}

/** Guarda la guía con la fila bloqueada (solo la mitad del agente: lo confirmado no se toca). */
async function guardarGuia(exploracionId: string, guia: GuiaDeLaSesion, corrida: { runId: string; automatica: boolean } | null, sesionId: string | null) {
  await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { propuesta: true } });
    if (!fila) return;
    const actual = leerPropuesta(fila.propuesta);
    // Las de las últimas sesiones (hasta MAX_SESIONES): una por sesión, la nueva reemplaza a la vieja de la misma.
    const guias = sesionId ? Object.fromEntries(Object.entries({ ...actual.guias, [sesionId]: guia }).slice(-MAX_SESIONES)) : actual.guias;
    const propuesta = {
      ...actual,
      guia,
      guias,
      corridas: corrida
        ? [
            ...actual.corridas,
            { id: corrida.runId, modo: "guia" as const, en: new Date().toISOString(), propuestos: 0, leyo: ["Lo que falta del resumen", "Dónde parece estar cada equipo"], alimento: [], automatica: corrida.automatica },
          ].slice(-50)
        : actual.corridas,
    };
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { propuesta: propuesta as unknown as Prisma.InputJsonValue } });
  });
}

/** Lo pendiente que sigue teniendo dónde ir con la escala de la exploración. */
function pendientesVigentes(estado: EstadoDeExploracion, general: Escala, escala: EscalaDelLienzo): ItemPropuesto[] {
  const validez = validezPara(general, escala);
  return propuestaVigente(estado).filter((it) => destinoValido(it.destino, validez));
}

/** Suma lo propuesto con la fila bloqueada y releída. Devuelve cuántas propuestas nuevas quedaron. */
async function guardar(
  exploracionId: string,
  items: ItemPropuesto[],
  leido: LoQueLeyoLaCorrida,
  corrida: { runId: string; modo: ModoDelAgente; automatica: boolean },
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({
      where: { id: exploracionId },
      select: {
        contenido: true,
        propuesta: true,
        areas: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        responsableEmail: true,
        archivadaEn: true,
        test: true,
      },
    });
    if (!fila) return 0;
    const ahora = new Date();
    const estado = estadoDesdeFila(fila);
    const antes = new Set(propuestaVigente(estado).map((it) => it.id));
    const fusion = fusionarPropuestas(estado, items);
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(-500);
    const leidas = {
      sesiones: union(fusion.leidas.sesiones, leido.leidas.sesiones),
      hubspot: union(fusion.leidas.hubspot, leido.leidas.hubspot),
      documentos: union(fusion.leidas.documentos, leido.leidas.documentos ?? []),
      // Las que se leyeron solo con las notas de Gemini; una que ya se leyó con su transcripción sale de acá.
      soloNotas: union(fusion.leidas.soloNotas ?? [], leido.leidas.soloNotas ?? []).filter((id) => !leido.leidas.sesiones.includes(id)),
    };
    // Lo que esta corrida dejó pendiente y antes no estaba: es lo que la historia cuenta.
    const nuevas = propuestaVigente({ ...estado, propuesta: { ...fusion, leidas } }).filter((it) => !antes.has(it.id));
    const propuesta = {
      ...fusion,
      leidas,
      // Lo dijo esta lectura de la reunión más reciente: reemplaza la alerta anterior (null = no se puso técnica).
      ...(leido.tecnica !== undefined
        ? { alertaTecnica: leido.tecnica ? { ...leido.tecnica, en: ahora.toISOString(), corridaId: corrida.runId } : null }
        : {}),
      // Lo que dijo de cada reunión: la nueva lectura de una reunión reemplaza a la anterior.
      ...(leido.lecturas ? { lecturas: Object.fromEntries(Object.entries({ ...fusion.lecturas, ...leido.lecturas }).slice(-MAX_LECTURAS)) } : {}),
      // El position statement del prospecto (K3): el de esta preparación reemplaza al anterior (null lo borra).
      ...(leido.posicionamiento !== undefined ? { posicionamiento: leido.posicionamiento } : {}),
      corridas: [
        ...fusion.corridas,
        {
          id: corrida.runId,
          modo: corrida.modo,
          en: new Date().toISOString(),
          propuestos: nuevas.length,
          leyo: leido.leyo.map((f) => f.slice(0, 200)).slice(0, 40),
          alimento: [...new Set(nuevas.map((it) => claveDelDestino(it.destino)))].slice(0, 120),
          automatica: corrida.automatica,
        },
      ].slice(-50),
    };
    /* La foto nueva conserva de la anterior las reuniones que ya pasaron, leídas o no (Elías, 2026-10-05):
       la que pasó sin resumen del notetaker se sigue avisando «sin leer» aunque se vuelva a preparar. */
    const foto = leido.foto
      ? {
          ...leido.foto,
          agenda: agendaRenovada({ anterior: leerLoLeido(fila.test).agenda, nueva: leido.foto.agenda, noOcurrieron: leido.noOcurrieron, ahora }),
          leidoEn: ahora.toISOString(),
          reunionesEn: ahora.toISOString(),
          // La última mirada al calendario no es de esta corrida: se conserva (lib/exploraciones/calendario.ts).
          calendarioEn: leerLoLeido(fila.test).calendarioEn ?? null,
        }
      : null;
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: {
        propuesta: propuesta as unknown as Prisma.InputJsonValue,
        ...(foto ? { test: foto as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return nuevas.length;
  });
}

/**
 * Llegó la transcripción de una reunión (lib/sessions/post-process.ts): el agente la lee SOLO en las
 * exploraciones vivas del cliente donde corresponde (lectura.ts › `exploracionesQueLeenLaReunion`):
 *   · la de un PROYECTO, o la preventa de un CLIENTE, solo si la reunión está unida a una de sus sesiones
 *     de forma explícita (elegida, o por su evento del calendario). La ligadura por fecha no cuenta: no se
 *     gasta en una adivinanza. Reemplaza al filtro de Ventas de la preventa de un cliente (etapa A).
 *   · la preventa de un PROSPECTO: la regla de siempre (de después del alta, de hace a lo sumo dos
 *     semanas, sin leer, mientras se vende), sin las que se sacaron, las de puertas adentro ni las de una
 *     serie.
 * Solo DISPARA: cada corrida va en segundo plano y cobra contra el presupuesto automático (sin persona).
 * Si ya hay una corrida en curso, no lanza otra: la reunión queda avisada como «sin leer». Devuelve el
 * resultado de la primera exploración que la lee. En la etapa 2 este llamado se muda a la cola de
 * `LecturaDeReunion`, como un destino del registro.
 */
export async function leerReunionNueva(o: { sesionId: string; fecha: Date; clientId: string }): Promise<"lanzada" | "ya-corre" | "no-corresponde"> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return "no-corresponde";
  // A propósito las dos clases de fila: la preventa (DE_LA_PREVENTA) y la exploración de cada proyecto del cliente.
  const filas = await prisma.exploracionDeVenta.findMany({
    where: { clientId: o.clientId, archivadaEn: null, OR: [DE_LA_PREVENTA, { projectId: { not: null } }] },
    select: { id: true, projectId: true, createdAt: true, contenido: true, propuesta: true, client: { select: { kind: true } } },
  });
  if (!filas.length) return "no-corresponde";
  const ahora = new Date();
  const [sesion, categorias] = await Promise.all([
    prisma.firefliesSession.findUnique({ where: { id: o.sesionId }, select: { googleEventId: true, participants: true, organizerEmail: true } }),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }).catch(() => []),
  ]);
  const exps = await Promise.all(
    filas.map(async (f) => {
      const contenido = leerContenido(f.contenido);
      return {
        id: f.id,
        delProyecto: !!f.projectId,
        esProspecto: f.client.kind === "PROSPECTO",
        creadaEn: f.createdAt,
        sesiones: contenido.sesiones,
        fuera: contenido.fuera,
        leidas: leerPropuesta(f.propuesta).leidas.sesiones,
        // seVendeTodavia solo importa en la preventa (cuesta una consulta): en un proyecto no se mira.
        seVende: f.projectId ? true : await seVendeTodavia({ clientId: o.clientId, createdAt: f.createdAt, client: f.client }, ahora),
      };
    }),
  );
  const ids = exploracionesQueLeenLaReunion(
    exps,
    {
      id: o.sesionId,
      // Sin la fila (no debería pasar: la manda el post-proceso), sin evento ni sala conocidos.
      eventoId: sesion?.googleEventId ?? null,
      fecha: o.fecha,
      participants: sesion ? [...sesion.participants, ...(sesion.organizerEmail ? [sesion.organizerEmail] : [])] : [],
    },
    { ahora, internos: buildInternalDomainsSet(categorias) },
  );
  let primera: "lanzada" | "ya-corre" | "no-corresponde" | null = null;
  for (const id of ids) {
    const r = await lanzarCorrida(id, "leer", { triggeredByEmail: null, sesionId: o.sesionId, automatica: true });
    const resultado = !r.ok ? "no-corresponde" : r.yaCorria ? "ya-corre" : "lanzada";
    primera ??= resultado;
  }
  return primera ?? "no-corresponde";
}
