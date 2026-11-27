/**
 * scripts/medir-reuniones-fuera-de-meet.ts — CUÁNTAS reuniones del calendario que no son de Meet entrarían a Nexus con la
 * regla del 27 nov (lib/google/plataforma-del-evento.ts) y CUÁNTAS quedarían con un cliente. SOLO LEE.
 *
 * Lee el calendario de cada persona del dominio (lo mismo que la sync, de solo lectura) y la base con una conexión de
 * solo lectura (`default_transaction_read_only`). No escribe en Google ni en la base, ni llama a la IA. El cliente sale
 * del resolver único (`resolveSessionClientId`), el mismo que usaría la sync.
 *
 *   npx tsx scripts/medir-reuniones-fuera-de-meet.ts              # los últimos 30 días (la ventana de la sync)
 *   npx tsx scripts/medir-reuniones-fuera-de-meet.ts --dias 14
 */
import "dotenv/config";
import "./lib/permitir-server-only";
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const DIAS = (() => {
  const i = process.argv.indexOf("--dias");
  const n = i >= 0 ? Number(process.argv[i + 1]) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
})();

async function main() {
  const { calendar: apiCalendar } = await import("googleapis/build/src/apis/calendar");
  const { getImpersonatedAuth, listDomainUsers } = await import("@/lib/google/auth");
  const { prisma } = await import("@/lib/db/prisma");
  const { buildCategorizeCtx, resolveSessionClientId } = await import("@/lib/sessions/resolve-client");
  const { DOMINIO_PROPIO } = await import("@/lib/sessions/dominio-propio");
  const { dominiosDelEquipoDe, esBloqueDeTarea, idDeSesion, invitadosDelEvento } = await import("@/lib/google/meet-sync-cambios");
  const { esDeMeet, plataformaDelEvento, puedeSerReunionFueraDeMeet, tieneInvitadoDeAfuera } = await import("@/lib/google/plataforma-del-evento");

  const usuarios = await listDomainUsers();
  const timeMin = new Date(Date.now() - DIAS * 86_400_000);
  const timeMax = new Date(Date.now() + 86_400_000);

  type Candidata = { eventId: string; titulo: string; fecha: Date; plataforma: string; invitados: string[]; organizador: string };
  const candidatas = new Map<string, Candidata>();
  let meet = 0;
  let sinAfueraCandidatas = 0;
  const vistosMeet = new Set<string>();
  const vistosSinAfuera = new Set<string>();
  let fallaron = 0;

  const ctx = await buildCategorizeCtx();
  const equipo = dominiosDelEquipoDe(ctx.internalDomains, DOMINIO_PROPIO);

  for (let i = 0; i < usuarios.length; i += 5) {
    await Promise.all(
      usuarios.slice(i, i + 5).map(async (u) => {
        try {
          const cal = apiCalendar({ version: "v3", auth: getImpersonatedAuth(u.email) });
          let pageToken: string | undefined;
          let paginas = 0;
          do {
            const res = await cal.events.list({
              calendarId: "primary",
              timeMin: timeMin.toISOString(),
              timeMax: timeMax.toISOString(),
              maxResults: 250,
              singleEvents: true,
              orderBy: "startTime",
              pageToken,
              fields: "nextPageToken,items(id,status,summary,description,location,hangoutLink,eventType,extendedProperties,start,end,attendees,organizer,conferenceData)",
            });
            for (const e of res.data.items ?? []) {
              if (!e.id || e.status === "cancelled") continue;
              if (esDeMeet(e)) {
                if (!vistosMeet.has(e.id)) meet++;
                vistosMeet.add(e.id);
                continue;
              }
              if (esBloqueDeTarea(e) || !puedeSerReunionFueraDeMeet(e)) continue;
              const organizador = e.organizer?.email ?? u.email;
              const invitados = invitadosDelEvento(e.attendees, organizador);
              if (!tieneInvitadoDeAfuera(invitados, equipo)) {
                if (!vistosSinAfuera.has(e.id)) sinAfueraCandidatas++;
                vistosSinAfuera.add(e.id);
                continue;
              }
              if (candidatas.has(e.id)) continue;
              candidatas.set(e.id, {
                eventId: e.id,
                titulo: e.summary ?? "(Sin título)",
                fecha: new Date(e.start?.dateTime ?? ""),
                plataforma: plataformaDelEvento(e),
                invitados: invitados.map((x) => x.correo),
                organizador,
              });
            }
            pageToken = res.data.nextPageToken ?? undefined;
            paginas++;
          } while (pageToken && paginas < 20);
        } catch {
          fallaron++;
        }
      }),
    );
  }

  const ids = [...candidatas.keys()].map(idDeSesion);
  const yaEstan = new Set(
    (await prisma.firefliesSession.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((f) => f.id),
  );
  const nombres = new Map((await prisma.client.findMany({ select: { id: true, name: true, kind: true } })).map((c) => [c.id, c]));

  const filas = [...candidatas.values()]
    .filter((c) => !yaEstan.has(idDeSesion(c.eventId)))
    .map((c) => {
      const participantes = [...new Set([...c.invitados, c.organizador.toLowerCase()])];
      const clientId = resolveSessionClientId({ title: c.titulo, participants: participantes, manualClientId: null }, ctx);
      return { ...c, clientId, cliente: clientId ? nombres.get(clientId) : undefined };
    })
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  const porPlataforma = new Map<string, { total: number; conCliente: number }>();
  for (const f of filas) {
    const p = porPlataforma.get(f.plataforma) ?? { total: 0, conCliente: 0 };
    p.total++;
    if (f.clientId) p.conCliente++;
    porPlataforma.set(f.plataforma, p);
  }
  const conCliente = filas.filter((f) => f.clientId);

  console.log(`\nVentana: ${DIAS} días hacia atrás hasta mañana · ${usuarios.length} calendarios (${fallaron} fallaron)`);
  console.log(`Reuniones de Meet (ya entran hoy): ${meet}`);
  console.log(`Eventos con hora sin Meet y SOLO del equipo (siguen fuera): ${sinAfueraCandidatas}`);
  console.log(`Ya en la base con su id (no serían nuevas): ${yaEstan.size}`);
  console.log(`\nNUEVAS que entrarían: ${filas.length} · con un cliente resuelto: ${conCliente.length}`);
  for (const [p, n] of [...porPlataforma.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${p.padEnd(11)} ${String(n.total).padStart(4)} · con cliente ${n.conCliente}`);
  }
  const porTipo = new Map<string, number>();
  for (const f of conCliente) porTipo.set(f.cliente?.kind ?? "?", (porTipo.get(f.cliente?.kind ?? "?") ?? 0) + 1);
  console.log(`  Con cliente, por tipo de ficha: ${[...porTipo.entries()].map(([k, n]) => `${k} ${n}`).join(" · ")}`);

  console.log(`\nCinco ejemplos con cliente:`);
  for (const f of conCliente.slice(0, 5)) {
    const afuera = f.invitados.filter((c) => !equipo.has(c.slice(c.lastIndexOf("@") + 1)));
    console.log(`  ${f.fecha.toISOString().slice(0, 16)} · ${f.plataforma} · «${f.titulo}» → ${f.cliente?.name} (${f.cliente?.kind}) · de afuera: ${afuera.slice(0, 3).join(", ")}`);
  }
  console.log(`\nCinco ejemplos SIN cliente:`);
  for (const f of filas.filter((x) => !x.clientId).slice(0, 5)) {
    const afuera = f.invitados.filter((c) => !equipo.has(c.slice(c.lastIndexOf("@") + 1)));
    console.log(`  ${f.fecha.toISOString().slice(0, 16)} · ${f.plataforma} · «${f.titulo}» · de afuera: ${afuera.slice(0, 3).join(", ")}`);
  }
  // Pieza 2: ¿el notetaker de HubSpot ya trae el resumen de alguna? (ComunicacionDeHubspot tipo «reunion», U7). Se liga
  // por el evento del calendario (el `eid` del enlace) o, sin él, por la misma hora (±10 min) y el mismo título.
  const { reunionesDeHubspotDeLaVentana } = await import("@/lib/comunicaciones/lectura-server");
  const comunicaciones = await reunionesDeHubspotDeLaVentana(timeMin, timeMax);
  const normal = (t: string | null | undefined) => (t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const ligadas = filas.map((f) => {
    const base = f.eventId.split("_")[0];
    const porEvento = comunicaciones.find((c) => c.googleEventId && (c.googleEventId === f.eventId || c.googleEventId === base));
    const porHora = porEvento
      ? null
      : comunicaciones.find((c) => Math.abs(c.ocurrioAt.getTime() - f.fecha.getTime()) <= 10 * 60_000 && normal(c.asunto) === normal(f.titulo));
    return { f, c: porEvento ?? porHora, como: porEvento ? "evento" : porHora ? "hora y título" : null };
  });
  const conResumen = ligadas.filter((l) => l.c);
  console.log(
    `\nPieza 2 · resúmenes del notetaker de HubSpot en la ventana: ${comunicaciones.length} reuniones de HubSpot con resumen; ` +
      `de las ${filas.length} nuevas, ${conResumen.length} tienen uno (${conResumen.filter((l) => l.como === "evento").length} por el evento, ` +
      `${conResumen.filter((l) => l.como === "hora y título").length} por hora y título), ${conResumen.filter((l) => l.c?.clientId === l.f.clientId).length} del mismo cliente.`,
  );
  for (const l of conResumen.slice(0, 5)) {
    console.log(`  ${l.f.fecha.toISOString().slice(0, 16)} · ${l.f.plataforma} · «${l.f.titulo}» · ${l.como} · ${l.c?.texto?.length ?? 0} letras de resumen · vigente ${l.c?.vigente}`);
  }

  const lineas = filas.filter((f) => /lineas|líneas/i.test(f.titulo) || f.invitados.some((c) => c.endsWith("@lineashospitalarias.com")));
  if (lineas.length) {
    console.log(`\nLíneas Hospitalarias:`);
    for (const f of lineas) console.log(`  ${f.fecha.toISOString().slice(0, 16)} · ${f.plataforma} · «${f.titulo}» → ${f.cliente?.name ?? "sin cliente"}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
