/**
 * lib/cs/watchdog-cuenta.ts — lo que el agente vigía lee de la CUENTA, además del proyecto
 * (2026-10-04). SERVIDOR.
 *
 * Pedido de Elías: que el agente genere alertas importantes cruzando el cronograma, el handoff, la
 * etapa, la facturación, lo que dice HubSpot (Partner Clients, el registro de la empresa y sus
 * contactos) y las reuniones recientes, con el cliente y las internas sobre el cliente.
 * `lib/cs/watchdog-context.ts` ya leía el proyecto, el cronograma, sus reuniones vinculadas y las
 * señales de HubSpot. Esto suma el resto, en bloques que van en el MENSAJE —no en el prompt de la
 * base—, así no hace falta re-sembrar el agente (la misma doctrina que el bloque de límites del
 * handoff). Al final va la guía de cruces: qué buscar con todo junto y cómo tipificarlo.
 *
 * Todo resumido, nunca crudo: el vigía corre todos los días sobre la cartera y cada token cuenta. La
 * única lectura de texto crudo es un EXTRACTO acotado de la transcripción de las reuniones que no
 * tienen minuta (2026-10-05, con topes por reunión y por bloque: lib/cs/transcripcion-del-vigia.ts).
 * ⛔ Lo que se lee acá es interno (facturación, uso, reuniones internas): nada cruza al cliente.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { leerResultadosDelHandoff, porValidar } from "@/lib/handoff/resultados-medibles";
import { lineaDeLaDuracion, lineaDeLaFecha, limitesDeLaFila, revisarLimites } from "@/lib/timeline/limites";
import { SELECT_LIMITES, conSemanaCeroDelPipeline } from "@/lib/timeline/limites-servidor";
import { leerPartner, porcentajeDeTendencia, licenciasSumadas, fraccion } from "./lectura-partner";
import { hayDeudaDelCliente, resumirFacturacion, textoDeVencidas, type CobroDeLaCuenta } from "./facturacion-de-la-cuenta";
import { diasEntre, fmtCambio, fmtDia } from "./formato";
import { TOPE_TRANSCRIPCION_CUENTA, extractosDelBloque } from "./transcripcion-del-vigia";

const DIA_MS = 86_400_000;
/** Reuniones de la cuenta que entran al contexto: las de las últimas 6 semanas, hasta 8. */
const VENTANA_DE_REUNIONES_DIAS = 45;
const TOPE_DE_REUNIONES = 8;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** La guía de cruces: qué mirar con todo junto. Va en el mensaje, después de los datos. */
export const GUIA_DE_CRUCES = [
  "=== CRUCES QUE IMPORTAN (lo que HubSpot solo no ve; usa TODO lo de arriba) ===",
  "- Riesgo doble: el proyecto está atrasado o bloqueado y la cuenta renueva en 90 días o menos → RENEWAL_RISK, HIGH.",
  "- El uso cae después de terminar la implementación (proyecto cerrado hace poco, o en etapa de cierre/adopción) → ADOPTION_RISK: el cliente quedó solo.",
  "- Lo que dice no coincide con lo que hace: en una minuta el cliente se dice conforme o contento y el uso cae → ADOPTION_RISK; cita la reunión y la frase.",
  "- Facturas VENCIDAS del cliente con proyecto activo o renovación cerca → CHURN_RISK (la conversación de plata y de valor es la misma). Lo que está SIN FACTURAR es trabajo de Smarteam: nunca es riesgo del cliente.",
  "- El handoff prometió una fecha límite o una duración y el plan ya se pasa → TIMELINE_OVERDUE si las alarmas de cronograma aplican; si no, PROACTIVE_ACTION.",
  "- Un resultado del handoff sin línea base o sin forma de medirse con el proyecto avanzado → PROACTIVE_ACTION: sin eso no se va a poder mostrar el valor.",
  "- El contacto que lleva el proyecto (o el sponsor) no aparece hace más de 45 días mientras el proyecto sigue → ENGAGEMENT_COLD.",
  "- Una reunión INTERNA habla de un problema con este cliente (queja, pago, escalamiento, cambio de interlocutor) → la categoría que corresponda; cítala como evidencia.",
  "- Un «extracto de la transcripción» es un pedazo de la reunión (el principio y el final): cita la frase que leíste y no supongas lo que no está.",
  "- La relación gestionada vence en 30 días o menos → PROACTIVE_ACTION: alguien de Smarteam tiene que trabajar en el portal o se pierden los datos de uso.",
  "En cada alerta pon en evidence.fuentes las fuentes que cruzaste: cronograma, handoff, etapa, facturacion, hubspot, hubspot_partner, reuniones, reuniones_internas.",
  "No inventes cifras ni fechas: si un dato no está arriba, no existe.",
].join("\n");

/** Los bloques de la cuenta, listos para el mensaje. Nunca tira: un bloque que falla se omite. */
export async function bloquesDeLaCuenta(i: {
  projectId: string;
  clientId: string;
  /** Las reuniones que el bloque del proyecto ya listó (no se repiten). */
  sesionesYaListadas: ReadonlySet<string>;
  ahora: Date;
}): Promise<string> {
  const hoy = ymd(i.ahora);
  const partes = await Promise.all([
    bloqueDelHandoff(i.projectId).catch(() => null),
    bloqueDeFacturacion(i.clientId, hoy).catch(() => null),
    bloqueDePartner(i.clientId, hoy).catch(() => null),
    bloqueDelRegistro(i.clientId, i.ahora).catch(() => null),
    bloqueDeReuniones(i.clientId, i.sesionesYaListadas, i.ahora).catch(() => null),
  ]);
  return [...partes.filter((p): p is string => !!p), GUIA_DE_CRUCES].join("\n\n");
}

async function bloqueDelHandoff(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      handoffResumen: true,
      handoffResultados: true,
      hubspotPipelineId: true,
      timeline: {
        select: {
          anchorStartDate: true,
          ...SELECT_LIMITES,
          phases: { orderBy: { order: "asc" }, select: { name: true, durationWeeks: true, startWeek: true } },
        },
      },
    },
  });
  if (!p) return null;
  const lineas: string[] = [];
  if (p.handoffResumen?.trim()) lineas.push(`- Resumen del handoff: ${p.handoffResumen.trim().slice(0, 700)}`);
  const resultados = leerResultadosDelHandoff(p.handoffResultados)?.resultados ?? [];
  for (const r of resultados.slice(0, 6)) {
    lineas.push(
      `- ${r.id} · ${r.resultado} · se mide: ${r.metrica || "sin definir"} · meta: ${r.meta || "sin definir"} · plazo: ${r.plazo || "sin definir"}${porValidar(r) ? " · LÍNEA BASE POR VALIDAR" : ""}`,
    );
  }
  if (p.timeline) {
    const limites = limitesDeLaFila({ ...p.timeline, conSemanaCero: conSemanaCeroDelPipeline(p.hubspotPipelineId) });
    const r = revisarLimites({ ancla: p.timeline.anchorStartDate?.toISOString() ?? null, fases: p.timeline.phases, limites });
    const d = lineaDeLaDuracion(r, limites.conSemanaCero);
    const f = lineaDeLaFecha(r);
    if (d) lineas.push(`- Lo vendido: ${d}`);
    if (f) lineas.push(`- La fecha límite: ${f}`);
  }
  if (lineas.length === 0) return "=== HANDOFF: LO QUE SE VENDIÓ Y SE PROMETIÓ ===\n(sin handoff generado: no hay promesas escritas que contrastar)";
  return ["=== HANDOFF: LO QUE SE VENDIÓ Y SE PROMETIÓ ===", ...lineas].join("\n");
}

async function bloqueDeFacturacion(clientId: string, hoy: string): Promise<string | null> {
  const cuenta = await prisma.cuentaFinanciera.findUnique({
    where: { clientId },
    select: {
      creditoDias: true,
      cobros: { select: { estado: true, fechaProgramada: true, fechaEmision: true, fechaCobro: true, promesaPago: true, monto: true, moneda: true } },
    },
  });
  const cobros: CobroDeLaCuenta[] = (cuenta?.cobros ?? []).map((c) => ({
    estado: c.estado,
    fechaProgramada: ymd(c.fechaProgramada),
    fechaEmision: c.fechaEmision ? ymd(c.fechaEmision) : null,
    fechaCobro: c.fechaCobro ? ymd(c.fechaCobro) : null,
    promesaPago: c.promesaPago ? ymd(c.promesaPago) : null,
    monto: Number(c.monto),
    moneda: c.moneda,
  }));
  const f = resumirFacturacion(cobros, hoy, cuenta?.creditoDias ?? null);
  if (!f) return "=== FACTURACIÓN DE LA CUENTA (Cobranza) ===\n(la cuenta no está configurada en Cobranza: sin datos de facturación)";
  const lineas = [
    `- Deuda del cliente: ${hayDeudaDelCliente(f) ? (textoDeVencidas(f) ?? "sin facturas vencidas") : "al día (ninguna factura vencida)"}`,
    f.promesasIncumplidas > 0 ? `- Promesas de pago incumplidas: ${f.promesasIncumplidas}` : null,
    f.sinFacturarAtrasadas.cantidad > 0
      ? `- Sin facturar y atrasadas: ${f.sinFacturarAtrasadas.cantidad} (la más vieja hace ${f.sinFacturarAtrasadas.diasMax} días). Es trabajo de Smarteam, NO deuda del cliente.`
      : null,
    `- Último pago registrado: ${f.ultimoPago ? fmtDia(f.ultimoPago, hoy) : "ninguno"}`,
  ].filter(Boolean);
  return ["=== FACTURACIÓN DE LA CUENTA (Cobranza) ===", ...lineas].join("\n");
}

async function bloqueDePartner(clientId: string, hoy: string): Promise<string | null> {
  const s = await prisma.clientPartnerSnapshot.findUnique({ where: { clientId }, select: { properties: true } });
  const l = leerPartner(s?.properties);
  if (!l) return null;
  const lineas: string[] = [];
  if (!l.activa) lineas.push("- HubSpot tiene la cuenta como INACTIVA.");
  if (l.gestionada && l.relacionGestionadaVence) {
    const d = diasEntre(hoy, l.relacionGestionadaVence);
    lineas.push(
      `- Relación gestionada: vence el ${fmtDia(l.relacionGestionadaVence, hoy)} (en ${d} días)${l.ultimaActividadDeSmarteam ? ` · última actividad de Smarteam en el portal: ${fmtDia(l.ultimaActividadDeSmarteam, hoy)}` : ""}`,
    );
  }
  if ((l.partnersQueGestionan ?? 1) >= 2) lineas.push(`- Otro partner también gestiona la cuenta (${l.partnersQueGestionan} en total).`);
  if (l.tendencia !== null) lineas.push(`- Uso de la plataforma: ${l.uso ?? "sin puntaje"} de 100 · ${porcentajeDeTendencia(l.tendencia)} en 4 semanas`);
  for (const h of l.hubs) {
    const partes = [
      h.plan,
      h.uso !== null ? `uso ${h.uso}` : null,
      h.activado === false ? "SIN ACTIVAR" : null,
      h.porActivar.length ? `falta: ${h.porActivar.join(", ")}` : null,
      h.licencias?.limite ? `licencias ${h.licencias.asignadas ?? "?"}/${h.licencias.limite}` : null,
      h.renovacion ? `renueva ${fmtDia(h.renovacion, hoy)}` : null,
    ].filter(Boolean);
    lineas.push(`- ${h.nombre}: ${partes.join(" · ")}`);
  }
  const lic = licenciasSumadas(l);
  if (lic?.libres) lineas.push(`- Licencias pagadas sin asignar (todas): ${lic.libres} de ${lic.limite ?? "?"}`);
  if (l.creditos) lineas.push(`- Créditos de HubSpot: ${Math.round(fraccion(l.creditos) * 100)} % usados${l.creditos.compraAutomatica === false ? " · sin compra automática" : ""}`);
  if (l.correosDelMes) lineas.push(`- Correos del mes: ${Math.round(fraccion(l.correosDelMes) * 100)} % del límite`);
  if (l.cambioAlRenovar !== null) lineas.push(`- Cambio que espera HubSpot al renovar: ${fmtCambio(l.cambioAlRenovar, l.moneda)} al mes`);
  if (lineas.length === 0) return null;
  return ["=== MÁS DE HUBSPOT PARTNER (relación, hubs, consumo) ===", ...lineas].join("\n");
}

interface ItemDelRegistro {
  type?: string;
  title?: string;
  date?: string | null;
  ts?: number;
  resumen?: string;
}
interface ContactoGuardado {
  nombre?: string;
  cargo?: string | null;
  ultimoContacto?: string | null;
}

async function bloqueDelRegistro(clientId: string, ahora: Date): Promise<string | null> {
  const s = await prisma.clientCsSignals.findUnique({ where: { clientId }, select: { engagement: true, fetchedAt: true } });
  const e = (s?.engagement ?? null) as { lastItems?: ItemDelRegistro[]; contactos?: ContactoGuardado[] } | null;
  if (!e) return null;
  const hoy = ymd(ahora);
  const tipo: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };
  const items = (e.lastItems ?? []).slice(0, 6).map((x) => {
    const fecha = x.ts ? fmtDia(new Date(x.ts).toISOString(), hoy) : (x.date ?? "sin fecha");
    const resumen = x.resumen?.replace(/\s+/g, " ").trim();
    return `- [${fecha}] ${tipo[x.type ?? ""] ?? x.type ?? "Actividad"}${x.title ? ` «${x.title}»` : ""}${resumen ? `: ${resumen}` : ""}`;
  });
  const personas = (e.contactos ?? []).slice(0, 10).map((c) => {
    const ultimo = c.ultimoContacto ? `${fmtDia(c.ultimoContacto, hoy)} (hace ${diasEntre(c.ultimoContacto, hoy)} días)` : "nunca registrado";
    return `- ${c.nombre ?? "Sin nombre"}${c.cargo ? ` · ${c.cargo}` : ""} · último contacto: ${ultimo}`;
  });
  const bloques: string[] = [];
  if (items.length) bloques.push(["=== REGISTRO DE LA EMPRESA EN HUBSPOT (notas, llamadas y reuniones) ===", ...items].join("\n"));
  if (personas.length) bloques.push(["=== PERSONAS DEL CLIENTE EN HUBSPOT ===", ...personas].join("\n"));
  if (bloques.length && s?.fetchedAt) bloques.push(`(copia de HubSpot del ${fmtDia(ymd(s.fetchedAt), hoy)})`);
  return bloques.length ? bloques.join("\n\n") : null;
}

async function bloqueDeReuniones(clientId: string, yaListadas: ReadonlySet<string>, ahora: Date): Promise<string | null> {
  const [sesiones, categorias] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { ...whereBelongsToClient(clientId), date: { lte: ahora, gte: new Date(ahora.getTime() - VENTANA_DE_REUNIONES_DIAS * DIA_MS) } },
      orderBy: { date: "desc" },
      take: TOPE_DE_REUNIONES + yaListadas.size,
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
        minute: { select: { summary: true, risks: true } },
      },
    }),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
  ]);
  const propios = buildInternalDomainsSet(categorias);
  const hoy = ymd(ahora);
  const lista = sesiones.filter((s) => !yaListadas.has(s.id)).slice(0, TOPE_DE_REUNIONES);
  /* Las que no tienen minuta se leen por un extracto de su transcripción (2026-10-05: de las internas,
     la mayoría no tiene minuta). Solo se trae la transcripción de ésas, y con el tope del bloque: ver
     lib/cs/transcripcion-del-vigia.ts. */
  const sinMinuta = lista.filter((s) => !s.minute?.summary?.trim()).map((s) => s.id);
  const transcripciones = sinMinuta.length
    ? await prisma.firefliesSession.findMany({
        where: { id: { in: sinMinuta }, transcript: { not: null } },
        select: { id: true, transcript: true },
      })
    : [];
  const transcripcionDe = new Map(transcripciones.map((t) => [t.id, t.transcript]));
  const extractos = extractosDelBloque(
    lista.map((s) => ({ id: s.id, tieneMinuta: !!s.minute?.summary?.trim(), transcript: transcripcionDe.get(s.id) ?? null })),
    TOPE_TRANSCRIPCION_CUENTA,
  );
  const lineas = lista.map((s) => {
    const interna = esReunionDePuertasAdentro({ participants: s.participants, organizerEmail: s.organizerEmail }, propios);
    const riesgos = Array.isArray(s.minute?.risks)
      ? (s.minute!.risks as Array<{ text?: string }>).map((r) => r.text).filter(Boolean).slice(0, 2).join(" · ")
      : "";
    const extracto = extractos.get(s.id);
    return [
      `- [${fmtDia(ymd(s.date), hoy)}] ${interna ? "INTERNA (solo Smarteam)" : "con el cliente"} «${s.title}» sessionId=${s.id}`,
      s.minute?.summary?.trim() ? `  minuta: ${(s.minute?.summary ?? "").replace(/\s+/g, " ").slice(0, 360)}` : null,
      extracto ? `  extracto de la transcripción (no tiene minuta): ${extracto}` : null,
      riesgos ? `  riesgos: ${riesgos}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });
  if (lineas.length === 0) return null;
  return ["=== OTRAS REUNIONES DE LA CUENTA (con el cliente e internas sobre el cliente, últimas 6 semanas) ===", ...lineas].join("\n");
}
