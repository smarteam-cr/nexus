/**
 * scripts/validar-agenda.ts — SOLO LECTURA. ¿La agenda de «Para ti» es la de Google Calendar? (pasada de validación del
 * 2026-10-19, docs/validacion-2026-10-19.md › área 3).
 *
 * Para cada persona y la semana de un lunes: lee el calendario CRUDO de Google (paginado, todos los campos, sin los
 * filtros de Nexus) y lo compara con lo que arma la pantalla (`agendaDeLaSemana`: reuniones, eventos propios y los de
 * todo el día). Dice qué evento falta, cuál sobra y, de cada reunión, a qué empresa la asigna Nexus y a cuál apuntan sus
 * invitados (por dominio registrado o contacto de HubSpot).
 *
 * Lo que la pantalla deja fuera a propósito y no cuenta como «falta»: los eventos cancelados, los que la persona rechazó,
 * y la ubicación de trabajo (DECISIONS «La agenda de «Para ti» es la de Google Calendar»).
 *
 *   npx tsx scripts/validar-agenda.ts 2026-10-19 "Andrés Pinzón" "Heiver Gomez" "Caroline Bersot"
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const PERSONALES = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com"]);
const PROPIOS = new Set(["smarteamcr.com", "smarteam.cr", "smarteam.com"]);

async function main() {
  const [lunes, ...nombres] = process.argv.slice(2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lunes ?? "") || nombres.length === 0) throw new Error('Uso: npx tsx scripts/validar-agenda.ts 2026-10-19 "Andrés Pinzón"');
  const { prisma } = await import("@/lib/db/prisma");
  const { agendaDeLaSemana } = await import("@/lib/mi-dia/agenda-server");
  const { calendar } = await import("googleapis/build/src/apis/calendar");
  type Evento = import("googleapis/build/src/apis/calendar").calendar_v3.Schema$Event;
  const { getImpersonatedAuth } = await import("@/lib/google/auth");

  const clientes = await prisma.client.findMany({ select: { id: true, name: true, emailDomains: true } });
  const nombreDe = new Map(clientes.map((c) => [c.id, c.name]));
  const porDominio = new Map<string, Set<string>>();
  for (const c of clientes) for (const d of c.emailDomains) if (!PERSONALES.has(d.toLowerCase())) porDominio.set(d.toLowerCase(), new Set([...(porDominio.get(d.toLowerCase()) ?? []), c.id]));
  const contactos = await prisma.contactoDeHubspot.findMany({ where: { vigente: true, email: { not: null } }, select: { clientId: true, email: true } });
  const porCorreo = new Map<string, Set<string>>();
  for (const c of contactos) porCorreo.set(c.email!.toLowerCase(), new Set([...(porCorreo.get(c.email!.toLowerCase()) ?? []), c.clientId]));

  const desde = new Date(`${lunes}T00:00:00-06:00`);
  const hasta = new Date(desde.getTime() + 5 * 86_400_000);
  const resumen: string[] = [];

  for (const nombre of nombres) {
    const tm = await prisma.teamMember.findFirst({ where: { name: { contains: nombre, mode: "insensitive" }, deactivatedAt: null } });
    if (!tm) continue;
    const correo = tm.email.toLowerCase();
    const cal = calendar({ version: "v3", auth: getImpersonatedAuth(correo) });
    const crudos: Evento[] = [];
    let pageToken: string | undefined;
    do {
      const r = await cal.events.list({ calendarId: "primary", timeMin: desde.toISOString(), timeMax: hasta.toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 250, pageToken });
      crudos.push(...(r.data.items ?? []));
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    const nexus = await agendaDeLaSemana(correo, lunes, { fresco: true });
    const idsNexus = new Map<string, string>();
    for (const r of nexus.reuniones) idsNexus.set(r.id, `reunión → ${r.empresas.map((id) => nombreDe.get(id) ?? id).join(" / ") || "sin empresa"}`);
    for (const p of nexus.propios) idsNexus.set(p.id, `propio${p.empresas?.length ? ` → ${p.empresas.map((id) => nombreDe.get(id) ?? id).join(" / ")}` : ""}`);
    const todoElDia = new Set(nexus.todoElDia.map((t) => t.id));

    console.log(`\n── ${tm.name} · semana del ${lunes} · Google: ${crudos.length} eventos · Nexus: ${nexus.reuniones.length} reuniones, ${nexus.propios.length} propios, ${nexus.todoElDia.length} de todo el día (${nexus.estado})`);
    let faltan = 0;
    let bien = 0;
    let fueraAProposito = 0;
    for (const e of crudos) {
      const id = e.id ?? "";
      const propio = (e.attendees ?? []).find((a) => a.self || a.email?.toLowerCase() === correo);
      const rechazado = propio?.responseStatus === "declined";
      // «Fuera de la oficina» sí se pinta: ocupa el tiempo, como en Google Calendar.
      const fuera = e.status === "cancelled" || rechazado || e.eventType === "workingLocation";
      const todoDia = !!e.start?.date && !e.start?.dateTime;
      const enNexus = idsNexus.get(id) ?? (todoElDia.has(id) ? "todo el día" : null);
      const hora = e.start?.dateTime?.slice(5, 16).replace("T", " ") ?? e.start?.date ?? "";
      // A qué empresas apuntan los invitados de afuera (lectura independiente).
      const empresas = new Set<string>();
      for (const a of e.attendees ?? []) {
        const c = a.email?.toLowerCase() ?? "";
        const d = c.split("@")[1] ?? "";
        if (!c || PROPIOS.has(d) || a.resource) continue;
        for (const x of porCorreo.get(c) ?? porDominio.get(d) ?? []) empresas.add(x);
      }
      const segunInvitados = [...empresas].map((x) => nombreDe.get(x) ?? x).join(" / ");
      if (fuera) {
        fueraAProposito++;
        if (enNexus) {
          console.log(`   ✗ SOBRA ${hora} «${e.summary}» (${rechazado ? "rechazado" : e.eventType ?? e.status}) → ${enNexus}`);
          resumen.push(`${tm.name}: sobra «${e.summary}» ${hora}`);
        }
        continue;
      }
      if (!enNexus) {
        faltan++;
        console.log(`   ✗ FALTA ${hora} «${e.summary}» (${todoDia ? "todo el día" : "con hora"}, ${e.eventType ?? "default"})`);
        resumen.push(`${tm.name}: falta «${e.summary}» ${hora}`);
        continue;
      }
      bien++;
      const marca = enNexus.startsWith("reunión") && segunInvitados && !enNexus.includes(segunInvitados.split(" / ")[0]) ? " ⚠ los invitados apuntan a otra" : "";
      console.log(`   ✓ ${hora} «${(e.summary ?? "").slice(0, 60)}» · ${enNexus}${segunInvitados ? ` · invitados: ${segunInvitados}` : ""}${marca}`);
      if (marca) resumen.push(`${tm.name}: «${e.summary}» ${hora} — Nexus: ${enNexus}; invitados: ${segunInvitados}`);
    }
    console.log(`   → ${bien} bien · ${faltan} faltan · ${fueraAProposito} fuera a propósito (cancelados, rechazados, ubicación de trabajo)`);
  }
  console.log(`\n══ Diferencias (${resumen.length})`);
  for (const r of resumen) console.log(`   · ${r}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
