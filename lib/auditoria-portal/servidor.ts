/**
 * lib/auditoria-portal/servidor.ts — CREAR, CAPTURAR Y ANALIZAR UNA AUDITORÍA. SERVIDOR.
 *
 * La auditoría se captura EN SEGUNDO PLANO: leer un portal toma un minuto o más (ciclo de vida,
 * propietarios, detalle, inventario) y el análisis con IA otro tanto, más de lo que una request
 * puede esperar detrás de un proxy. `crearAuditoria` deja la fila en `capturando` y vuelve; el
 * trabajo sigue en este proceso (instancia única: RUNBOOK, invariante #1) y la pantalla se refresca
 * hasta verla `lista`. Si el proceso muere a mitad, la fila queda en `capturando` y la pantalla lo
 * dice después de un rato: se vuelve a correr.
 *
 * Toda escritura sobre la foto pasa por `actualizarFoto`, con la fila bloqueada: confirmar un
 * hallazgo mientras termina un análisis no puede perder ninguna de las dos cosas.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import {
  capturarCicloYPropietarios,
  fetchAuditEnrichment,
  getFreshToken,
  leerCuentaDelPortal,
} from "@/lib/hubspot/portal-analyzer";
import { crearLector, nuevoRegistro, VERSION_DEL_REGISTRO } from "./lecturas";
import { leerInventario } from "./inventario";
import { leerContextoDelCliente } from "./contexto-del-cliente";
import { reportesDeLaFoto } from "./reportes";
import { leerFoto, VERSION_DE_LA_FOTO, type AnalisisGuardado, type FotoDeAuditoria } from "./foto";
import { armarHechos } from "./analisis/hechos";
import { MODELO_DEL_ANALISIS, pedidoDelAnalisis, SLUG_DEL_ANALISIS } from "./analisis/prompt";
import { leerAnalisis, unirConLoConfirmado } from "./analisis/validar";

/** Aplica `cambiar` a la foto con la fila bloqueada. Devuelve la foto guardada, o `null` si no existe. */
export async function actualizarFoto(
  auditId: string,
  cambiar: (foto: FotoDeAuditoria) => FotoDeAuditoria,
): Promise<FotoDeAuditoria | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Audit" WHERE id = ${auditId} FOR UPDATE`;
    const fila = await tx.audit.findUnique({ where: { id: auditId }, select: { data: true } });
    const foto = leerFoto(fila?.data);
    if (!foto) return null;
    const nueva = cambiar(foto);
    await tx.audit.update({ where: { id: auditId }, data: { data: nueva as object } });
    return nueva;
  });
}

const nombreDeLaAuditoria = (d = new Date()) =>
  `Auditoría ${d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;

/** Crea la fila y arranca la captura en segundo plano. Devuelve el id enseguida. */
export async function crearAuditoria(opts: {
  accountId: string;
  clientId: string | null;
  creadaPor: { nombre: string; email: string };
  nombre?: string;
}): Promise<string> {
  const foto: FotoDeAuditoria = {
    version: VERSION_DE_LA_FOTO,
    estado: "capturando",
    creadaPor: opts.creadaPor,
    iniciadaEn: new Date().toISOString(),
  };
  const audit = await prisma.audit.create({
    data: {
      accountId: opts.accountId,
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      name: opts.nombre?.trim() || nombreDeLaAuditoria(),
      data: foto as object,
    },
    select: { id: true },
  });
  void capturarAuditoria(audit.id, opts.accountId, opts.creadaPor.email).catch((e) =>
    console.error("[auditoria] la captura reventó fuera de su try:", e instanceof Error ? e.message : String(e)),
  );
  return audit.id;
}

/** Lee el portal y deja la foto lista para el análisis; después lo corre. Nunca tira. */
export async function capturarAuditoria(auditId: string, accountId: string, quien: string | null): Promise<void> {
  const t0 = Date.now();
  try {
    const token = await getFreshToken(accountId);
    const registro = nuevoRegistro();
    const cuenta = await leerCuentaDelPortal(token, registro);
    const { lifecycleStats, ownerStats } = await capturarCicloYPropietarios(token, registro);
    const enriquecimiento = await fetchAuditEnrichment(token, registro);
    const inventario = await leerInventario(crearLector(token, registro));
    // Lo que Nexus sabe del cliente (solo de SUS proyectos). Sin cliente —el portal de Smarteam— no hay.
    const fila = await prisma.audit.findUnique({ where: { id: auditId }, select: { clientId: true } });
    const contextoDelCliente = fila?.clientId
      ? await leerContextoDelCliente(fila.clientId).catch((e) => {
          console.error("[auditoria] no se pudo leer el contexto del cliente:", e instanceof Error ? e.message : String(e));
          return null;
        })
      : null;

    await actualizarFoto(auditId, (f) => ({
      ...f,
      estado: "analizando",
      capturedAt: new Date().toISOString(),
      duracionMs: Date.now() - t0,
      cuenta: {
        portalId: cuenta.portalId,
        hubDomain: cuenta.hubDomain,
        uiDomain: cuenta.uiDomain,
        timeZone: cuenta.timeZone,
        companyCurrency: cuenta.companyCurrency,
        dataHostingLocation: cuenta.dataHostingLocation,
        accountType: cuenta.accountType,
        scopes: cuenta.scopes,
      },
      lifecycleStats,
      ownerStats,
      enriquecimiento,
      inventario,
      contextoDelCliente,
      lecturas: { version: VERSION_DEL_REGISTRO, intentos: registro.intentos, fallidas: registro.fallidas },
    }));
  } catch (e) {
    console.error("[auditoria] no se pudo capturar:", e instanceof Error ? e.message : String(e));
    await actualizarFoto(auditId, (f) => ({
      ...f,
      estado: "fallo",
      error: "No se pudo leer el portal de HubSpot. Revisa que la conexión siga activa y vuelve a correr la auditoría.",
    })).catch(() => {});
    return;
  }
  await analizarAuditoria(auditId, quien);
}

/**
 * Corre el análisis con IA sobre la foto guardada y lo guarda. Al regenerar, lo CONFIRMADO por una
 * persona se queda (con quién y cuándo); lo sugerido y lo descartado se reemplaza por el análisis
 * nuevo (`unirConLoConfirmado`). Nunca tira.
 */
export async function analizarAuditoria(auditId: string, quien: string | null): Promise<void> {
  const audit = await prisma.audit.findUnique({ where: { id: auditId }, select: { accountId: true, clientId: true, data: true } });
  const foto = leerFoto(audit?.data);
  if (!audit || !foto?.lifecycleStats) return;

  // La marca de cuándo arrancó: «analizando» se mide desde acá, no desde la lectura del portal.
  await actualizarFoto(auditId, (f) => ({ ...f, estado: "analizando", analisisIniciadoEn: new Date().toISOString(), analisisError: undefined }));

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: SLUG_DEL_ANALISIS,
      status: "RUNNING",
      clientId: audit.clientId,
      triggeredByEmail: quien,
      stepLabel: "Análisis de la auditoría del portal",
      currentPhase: "Analizando el portal",
    },
    select: { id: true },
  });

  let error: string | null = null;
  let crudo = "";
  try {
    const hechos = armarHechos(foto, new Date());
    const criterios = audit.accountId
      ? (await prisma.knowledge.findMany({ where: { accountId: audit.accountId }, select: { title: true, content: true }, orderBy: { category: "asc" } })).map(
          (k) => ({ titulo: k.title, contenido: k.content }),
        )
      : [];
    const reportes = reportesDeLaFoto(foto);
    const msg = await anthropic.messages.stream(pedidoDelAnalisis({ hechos, reportes, criterios })).finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("El modelo no quiso analizar este portal.");
    if (msg.stop_reason === "max_tokens") throw new Error("La respuesta del análisis se cortó.");
    crudo = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const leido = leerAnalisis(crudo, hechos, reportes.map((r) => r.id));
    if (!leido) throw new Error("El análisis no devolvió hallazgos que se puedan usar.");

    const etiquetas = Object.fromEntries(hechos.hechos.map((h) => [h.clave, h.etiqueta]));
    // Se une DENTRO del candado de la fila: lo confirmado se lee fresco, no de la foto del arranque.
    await actualizarFoto(auditId, (f) => {
      const analisis: AnalisisGuardado = {
        generadoEn: new Date().toISOString(),
        modelo: MODELO_DEL_ANALISIS,
        agentRunId: run.id,
        resumen: leido.resumen,
        ...(leido.estado ? { estado: leido.estado } : {}),
        lecturasDeSeccion: leido.lecturasDeSeccion,
        lecturasDeReporte: leido.lecturasDeReporte,
        hallazgos: unirConLoConfirmado(f.analisis?.hallazgos, leido.hallazgos),
        preguntas: leido.preguntas,
        descartadosPorCifras: leido.descartadosPorCifras,
        // Las etiquetas de los hechos de antes siguen sirviendo a los hallazgos confirmados que las citan.
        etiquetas: { ...(f.analisis?.etiquetas ?? {}), ...etiquetas },
      };
      return { ...f, estado: "lista", analisis, analisisError: undefined };
    });
  } catch (e) {
    console.error("[auditoria] el análisis falló:", e instanceof Error ? e.message : String(e));
    error = e instanceof Error ? e.message : "El análisis falló.";
    await actualizarFoto(auditId, (f) => ({ ...f, estado: "lista", analisisError: error ?? undefined })).catch(() => {});
  }

  await prisma.agentRun
    .update({
      where: { id: run.id },
      data: { status: error ? "ERROR" : "DONE", currentPhase: null, output: error ? JSON.stringify({ error, crudo: crudo.slice(0, 4000) }) : crudo },
    })
    .catch(() => {});
}
