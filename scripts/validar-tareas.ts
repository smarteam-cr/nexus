/**
 * scripts/validar-tareas.ts — SOLO LECTURA. ¿Salen bien las tareas de las reuniones, por equipo? (pasada de validación
 * del 2026-10-19, docs/validacion-2026-10-19.md › área 1).
 *
 * Para cada reunión de los últimos N días que dejó tareas (Tarea.sessionId) o que es de una serie del sprint:
 *   · de qué equipo es (sprint de una FuenteDeTareas, reunión con un cliente o un prospecto, interna);
 *   · las líneas de «Próximos pasos» de las notas de Gemini (lo que se dijo) contra las tareas que quedaron;
 *   · por persona: cuántas, el tope (3 en una reunión con cliente desde el deploy del 19-oct a las 22:18; 5 en el sprint
 *     y antes de ese deploy), títulos largos, con voseo o que no empiezan con un verbo, «Recordarle a…» de Smarteam,
 *     coordinación interna, duplicados (misma huella abierta dos veces para la misma persona) y la tarea con un cliente
 *     que no es el dueño de la reunión (invariante 1).
 *
 * La base se abre en solo lectura (default_transaction_read_only): aunque algo intentara escribir, la base lo rechaza.
 * ⚠ Imprime títulos de tareas y líneas de notas de clientes: el resultado no sale de la PC.
 *
 *   npx tsx scripts/validar-tareas.ts                 # 10 días
 *   npx tsx scripts/validar-tareas.ts --dias 14 --detalle
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const DETALLE = process.argv.includes("--detalle");
const iDias = process.argv.indexOf("--dias");
const DIAS = iDias > -1 ? Number(process.argv[iDias + 1]) || 10 : 10;

/** El deploy que trajo el tope de 3 y lo esencial (38be4315, 2026-10-19 22:18 CR). Antes regía el tope de 5. */
const DESDE_TOPE_3 = new Date("2026-10-19T22:18:54-06:00");
const COORDINACION = /reuni[oó]n interna|estar disponible|confirmar internamente|coordinar internamente|alinear(se)? internamente/i;
/** Un título que empieza con un verbo en infinitivo (o «Seguimiento con…», el agrupado). */
const EMPIEZA_CON_VERBO = /^(¿)?[A-Za-zÁÉÍÓÚáéíóúñÑ]+(ar|er|ir|arle|erle|irle|arla|arlo|arles|arse|erse|irse)\b|^Seguimiento con /i;

interface Hallazgo {
  reunion: string;
  que: string;
}

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { itemsDeProximosPasos, itemsDeActionItems } = await import("@/lib/tareas/proximos-pasos");
  const { voseoEnProsa } = await import("@/lib/ui/voseo-formas");
  const { duenoDeLaSesion } = await import("@/lib/sessions/project-sources");

  const desde = new Date(Date.now() - DIAS * 86_400_000);
  const equipo = await prisma.teamMember.findMany({ select: { email: true, name: true, area: true, roleEnum: true, deactivatedAt: true } });
  const porCorreo = new Map(equipo.map((m) => [m.email.toLowerCase(), m]));
  const dominiosPropios = new Set(["smarteamcr.com", "smarteam.cr", "smarteam.com"]);
  const esDeLaCasa = (correo: string) => {
    const d = correo.toLowerCase().split("@")[1] ?? "";
    return dominiosPropios.has(d) || porCorreo.has(correo.toLowerCase()) || /calendar\.google\.com|resource\./.test(d);
  };

  const fuentes = await prisma.fuenteDeTareas.findMany({ select: { id: true, equipo: true, titulo: true, serie: true, duenoEmail: true, activa: true, personas: true, rol: true } });

  const tareas = await prisma.tarea.findMany({
    where: { sessionId: { not: null }, createdAt: { gte: desde } },
    select: {
      id: true, numero: true, titulo: true, huella: true, estado: true, origen: true, origenId: true, lado: true, equipo: true,
      responsableEmail: true, clientId: true, sessionId: true, createdAt: true, decision: true, motivo: true, archivadaAt: true,
      lectura: { select: { fuenteId: true, modo: true } },
    },
    orderBy: { numero: "asc" },
  });
  const sesionIds = [...new Set(tareas.map((t) => t.sessionId!))];
  // Las reuniones del sprint de la ventana también, aunque no hayan dejado tareas.
  const lecturasSprint = await prisma.lecturaDeReunion.findMany({
    where: { fuenteId: { not: null }, createdAt: { gte: desde } },
    select: { sessionId: true, fuenteId: true, estado: true, modo: true, resumen: true },
  });
  for (const l of lecturasSprint) if (l.sessionId && !sesionIds.includes(l.sessionId)) sesionIds.push(l.sessionId);

  const sesiones = await prisma.firefliesSession.findMany({
    where: { id: { in: sesionIds } },
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true, summary: true, resolvedClientId: true, manualClientId: true },
  });
  const clientes = await prisma.client.findMany({ where: { id: { in: [...new Set([...sesiones.map((s) => duenoDeLaSesion(s)), ...tareas.map((t) => t.clientId)].filter((x): x is string => !!x))] } }, select: { id: true, name: true, kind: true } });
  const nombreCliente = new Map(clientes.map((c) => [c.id, c]));
  const lecturaPorSesion = new Map(lecturasSprint.map((l) => [l.sessionId, l]));

  const hallazgos: Hallazgo[] = [];
  const totales = { reuniones: 0, tareas: 0, porTipo: new Map<string, { reuniones: number; tareas: number }>() };

  const ordenadas = sesiones.sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const s of ordenadas) {
    const dueno = duenoDeLaSesion(s);
    const gente = [...s.participants, s.organizerEmail ?? ""].filter(Boolean);
    const puertasAdentro = gente.length > 0 && gente.every(esDeLaCasa);
    const lectura = lecturaPorSesion.get(s.id);
    const fuente = lectura?.fuenteId ? fuentes.find((f) => f.id === lectura.fuenteId) : null;
    const tipo = fuente ? `sprint ${fuente.equipo}` : puertasAdentro ? "interna" : dueno ? `con ${nombreCliente.get(dueno)?.kind ?? "?"}` : "sin dueño";
    const deLaReunion = tareas.filter((t) => t.sessionId === s.id);
    const t0 = totales.porTipo.get(tipo) ?? { reuniones: 0, tareas: 0 };
    t0.reuniones++;
    t0.tareas += deLaReunion.length;
    totales.porTipo.set(tipo, t0);
    totales.reuniones++;
    totales.tareas += deLaReunion.length;

    const sm = (s.summary ?? {}) as Record<string, unknown>;
    const notas = typeof sm.overview === "string" ? sm.overview : "";
    const actionItems = Array.isArray(sm.action_items) ? (sm.action_items as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const lineas = actionItems.length ? itemsDeActionItems(actionItems) : itemsDeProximosPasos(notas);
    const etiqueta = `${s.date.toISOString().slice(0, 10)} «${s.title.slice(0, 70)}» (${tipo}${dueno ? `, ${nombreCliente.get(dueno)?.name ?? dueno}` : ""})`;

    // Por persona.
    const porPersona = new Map<string, typeof deLaReunion>();
    for (const t of deLaReunion) {
      const k = t.responsableEmail ?? `(por asignar · ${t.equipo})`;
      porPersona.set(k, [...(porPersona.get(k) ?? []), t]);
    }
    const conCliente = !!dueno && !puertasAdentro && !fuente;
    for (const [persona, lista] of porPersona) {
      const vivas = lista.filter((t) => !(t.estado === "vencida" && /retirad/i.test(t.motivo ?? "")) && !t.origenId?.includes(":retirada:"));
      const tope = conCliente && s.date >= DESDE_TOPE_3 ? 3 : 5;
      if (!persona.startsWith("(") && vivas.length > tope) hallazgos.push({ reunion: etiqueta, que: `${persona}: ${vivas.length} tareas de la reunión (tope ${tope})` });
    }
    // Chequeos por tarea.
    for (const t of deLaReunion) {
      if (t.titulo.length > 90) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: título de ${t.titulo.length} caracteres` });
      const vos = voseoEnProsa(t.titulo);
      if (vos.length) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: voseo en el título (${vos.join(", ")})` });
      if (!EMPIEZA_CON_VERBO.test(t.titulo.trim())) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: no empieza con un verbo: «${t.titulo.slice(0, 60)}»` });
      if (COORDINACION.test(t.titulo)) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: coordinación interna: «${t.titulo.slice(0, 70)}»` });
      if (dueno && t.clientId && t.clientId !== dueno && !puertasAdentro) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: cliente ${nombreCliente.get(t.clientId)?.name ?? t.clientId} ≠ dueño de la reunión` });
      if (t.responsableEmail) {
        const m = porCorreo.get(t.responsableEmail.toLowerCase());
        if (!m) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: responsable ${t.responsableEmail} no está en el equipo` });
        else if (m.deactivatedAt) hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: responsable dado de baja (${m.name})` });
        else if (!gente.map((g) => g.toLowerCase()).includes(t.responsableEmail.toLowerCase()) && t.lado !== "cliente")
          hallazgos.push({ reunion: etiqueta, que: `T-${t.numero}: ${m.name} no estuvo en la reunión` });
      }
    }
    // Duplicados: la misma huella dos veces para la misma persona en la reunión.
    const huellas = new Map<string, number>();
    for (const t of deLaReunion) {
      const k = `${t.responsableEmail ?? t.equipo}|${t.huella}`;
      huellas.set(k, (huellas.get(k) ?? 0) + 1);
    }
    for (const [k, n] of huellas) if (n > 1) hallazgos.push({ reunion: etiqueta, que: `misma tarea ${n} veces para ${k.split("|")[0]}` });

    if (DETALLE || deLaReunion.length > 0) {
      console.log(`\n── ${etiqueta}`);
      console.log(`   Próximos pasos en las notas: ${lineas.length}${lectura ? ` · lectura ${lectura.estado}${lectura.modo ? ` (${lectura.modo})` : ""}` : ""}`);
      if (DETALLE) for (const l of lineas) console.log(`     ◦ [${l.personas.join(", ")}] ${l.titulo}`);
      for (const [persona, lista] of porPersona) {
        const nombre = porCorreo.get(persona.toLowerCase())?.name ?? persona;
        console.log(`   ${nombre}: ${lista.length}`);
        for (const t of lista) console.log(`     · T-${t.numero} [${t.estado}${t.lado === "cliente" ? " · lado cliente" : ""} · ${t.origen}] ${t.titulo}`);
      }
    }
  }

  console.log(`\n══ ${totales.reuniones} reuniones de ${DIAS} días, ${totales.tareas} tareas`);
  for (const [tipo, v] of totales.porTipo) console.log(`   ${tipo}: ${v.reuniones} reuniones, ${v.tareas} tareas (${(v.tareas / Math.max(1, v.reuniones)).toFixed(1)} por reunión)`);
  const estados = new Map<string, number>();
  for (const t of tareas) estados.set(t.estado, (estados.get(t.estado) ?? 0) + 1);
  console.log(`   Estados: ${[...estados].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`\n══ Hallazgos (${hallazgos.length})`);
  for (const h of hallazgos) console.log(`   · ${h.reunion}: ${h.que}`);
  console.log(`\n══ Series del sprint`);
  for (const f of fuentes) console.log(`   ${f.equipo ?? "personal"} · «${f.titulo}» · lee como ${f.duenoEmail} · ${f.activa ? "activa" : "pausada"} · ${f.rol} · personas: ${f.personas.length || "(las del área)"}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
