/**
 * scripts/validar-para-ti.ts — SOLO LECTURA. ¿Lo que ve cada persona en «Para ti» es correcto? (pasada de validación del
 * 2026-10-19, docs/validacion-2026-10-19.md › área 2).
 *
 * Arma «Para ti» con las MISMAS funciones de la pantalla (`alcanceDe`, `medirParaTi`, `cuentasDelInicio`,
 * `vistaDeVentas`) y lo contrasta con una lectura independiente:
 *   · una cuenta «sin siguiente paso» de verdad no tiene una tarea abierta con fecha en la semana (consulta directa a
 *     `Tarea`) ni una reunión en 8 días (los eventos CRUDOS del calendario de quien la lleva, con invitados del dominio
 *     de la empresa o de sus contactos de HubSpot);
 *   · una cuenta con la reunión como siguiente paso tiene ese evento en el calendario y alguien de la empresa invitado;
 *   · quien lleva cada cuenta es de Customer Success (no Desarrollo ni Ventas) y sigue en el equipo;
 *   · ninguna línea de los bloques se repite en otro bloque y ninguna nombra una cuenta fuera de su alcance;
 *   · Ventas: la meta que ve contra los tramos de HubSpot (`MetaComercial`), y sus negocios abiertos contra la copia.
 *
 * La base se abre en solo lectura. Lee el calendario de cada persona con la cuenta de servicio (solo lectura).
 *
 *   npx tsx scripts/validar-para-ti.ts
 *   npx tsx scripts/validar-para-ti.ts "Heiver Gomez" "Andrés Pinzón"
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "3";

const CS = ["Juan Carlos Armijos", "Heiver Gomez", "Caroline Bersot", "Liliana Moreno", "Valentina Sandoval", "Alexander Vanegas"];
const VENTAS = ["Andrés Pinzón", "Liz Navarro", "Marco Salas"];
const PERSONALES = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com"]);
const PROPIOS = new Set(["smarteamcr.com", "smarteam.cr", "smarteam.com"]);

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { alcanceDe } = await import("@/lib/para-ti/alcance-server");
  const { medirParaTi } = await import("@/lib/para-ti/medir-server");
  const { varianteDelInicio } = await import("@/lib/mi-dia/inicio");
  const { cuentasDelInicio } = await import("@/lib/mi-dia/inicio-server");
  const { ventanaDeLaSemana } = await import("@/lib/mi-dia/servicio");
  const { eventosProximos } = await import("@/lib/google/agenda-de-la-empresa");
  const { vistaDeVentas } = await import("@/lib/ventas/cartera-server");
  const { metasPorPersona } = await import("@/lib/ventas/metas");
  const { crDateParts } = await import("@/lib/jobs/time");

  const ahora = new Date();
  const hoyISO = crDateParts(ahora).dateKey;
  const semana = ventanaDeLaSemana(hoyISO);
  const nombres = process.argv.slice(2).length ? process.argv.slice(2) : [...CS, ...VENTAS];
  const equipo = await prisma.teamMember.findMany({ select: { id: true, email: true, name: true, roleEnum: true, deactivatedAt: true } });
  const porCorreo = new Map(equipo.map((m) => [m.email.toLowerCase(), m]));
  const problemas: string[] = [];

  // Las empresas: dominios propios de cada cliente y los correos de sus contactos de HubSpot.
  const clientes = await prisma.client.findMany({ select: { id: true, name: true, emailDomains: true, kind: true } });
  const nombreDe = new Map(clientes.map((c) => [c.id, c.name]));
  const contactos = await prisma.contactoDeHubspot.findMany({ where: { vigente: true, email: { not: null } }, select: { clientId: true, email: true } });
  const clientesDelCorreo = new Map<string, Set<string>>();
  for (const c of contactos) {
    const k = c.email!.toLowerCase();
    clientesDelCorreo.set(k, new Set([...(clientesDelCorreo.get(k) ?? []), c.clientId]));
  }
  const clientesDelDominio = new Map<string, Set<string>>();
  for (const c of clientes) for (const d of c.emailDomains) {
    const k = d.toLowerCase();
    if (PERSONALES.has(k)) continue;
    clientesDelDominio.set(k, new Set([...(clientesDelDominio.get(k) ?? []), c.id]));
  }
  const clientesDelInvitado = (correo: string) => {
    const c = correo.toLowerCase();
    const d = c.split("@")[1] ?? "";
    if (PROPIOS.has(d)) return new Set<string>();
    return clientesDelCorreo.get(c) ?? clientesDelDominio.get(d) ?? new Set<string>();
  };

  const calendarios = new Map<string, Awaited<ReturnType<typeof eventosProximos>>>();
  const calendarioDe = async (correo: string) => {
    if (!calendarios.has(correo)) calendarios.set(correo, await eventosProximos(correo, { semanas: 8 / 7, ahora }));
    return calendarios.get(correo)!;
  };
  /** ¿Hay un evento en 8 días con alguien de esa empresa? Lectura independiente de la de Nexus. */
  const reunionCrudaCon = async (correo: string, clientId: string) => {
    const cal = await calendarDeSeguro(correo);
    if (!cal) return null;
    // Un evento que la persona rechazó no es su reunión (Nexus tampoco lo cuenta).
    const loRechazo = (e: (typeof cal)[number]) => (e.attendees ?? []).some((a) => a.email?.toLowerCase() === correo && a.responseStatus === "declined");
    return cal.find((e) => !loRechazo(e) && (e.attendees ?? []).some((a) => a.email && a.responseStatus !== "declined" && clientesDelInvitado(a.email).has(clientId))) ?? null;
  };
  const calendarDeSeguro = async (correo: string) => {
    const r = await calendarioDe(correo);
    return r.ok ? r.datos : null;
  };

  for (const nombre of nombres) {
    const tm = await prisma.teamMember.findFirst({ where: { name: { contains: nombre, mode: "insensitive" }, deactivatedAt: null } });
    if (!tm) {
      console.log(`\n── ${nombre}: no está en el equipo`);
      continue;
    }
    const a = await alcanceDe(tm);
    const esVentas = VENTAS.includes(nombre);
    const variante = varianteDelInicio({ rol: a.rol, frentes: a.frentes, tieneVentas: esVentas });
    const m = await medirParaTi(a, ahora);
    console.log(`\n── ${tm.name} (${a.rol}, inicio «${variante}») · arriba ${m.importa.length} · también ${m.tambien.length} · semana ${m.semana.length}`);

    // Repetidos entre bloques y entre «Lo que importa hoy», «También» y «Esta semana».
    const vistos = new Map<string, string>();
    type Linea = { titulo: string; href: string; clientId?: string | null };
    const listas: [string, Linea[]][] = [
      ...(m.foco?.bloques ?? []).map((b) => [b.titulo, b.items] as [string, Linea[]]),
      ["Lo que importa hoy", m.foco ? [] : m.importa],
      ["También para hoy", m.tambien],
      ["Esta semana", m.semana],
    ];
    for (const [donde, items] of listas) {
      for (const it of items) {
        const k = it.titulo.trim().toLowerCase();
        const antes = vistos.get(k);
        if (antes && antes !== donde) problemas.push(`${tm.name}: «${it.titulo}» está en «${antes}» y en «${donde}»`);
        vistos.set(k, donde);
      }
    }
    for (const b of m.foco?.bloques ?? []) console.log(`   ${b.titulo}: ${b.items.length} de ${b.total}`);

    if (variante === "cse" || variante === "csl") {
      const cuentas = await cuentasDelInicio(variante, a, { ahora, hoyISO });
      const ids = new Set(cuentas.map((c) => c.clientId));
      // Ninguna línea de los bloques nombra una cuenta que no es de quien mira (el CSE; la CSL ve toda la cartera).
      if (variante === "cse") {
        for (const b of m.foco?.bloques ?? []) for (const it of b.items) {
          const id = it.clientId ?? /\/clients\/([^/?#]+)/.exec(it.href ?? "")?.[1];
          if (id && !ids.has(id) && !a.proyectos.some((p) => p.clientId === id)) problemas.push(`${tm.name}: «${it.titulo}» enlaza a ${nombreDe.get(id) ?? id}, fuera de sus cuentas`);
        }
      }
      let sinPaso = 0;
      let conReunion = 0;
      let verificadas = 0;
      for (const c of cuentas) {
        const lleva = cuentas.length && variante === "cse" ? tm.email : null;
        const correoQueLleva = (lleva ?? equipo.find((p) => p.name === c.lleva)?.email ?? "").toLowerCase();
        const quien = porCorreo.get(correoQueLleva);
        if (c.lleva && quien && !["CSE", "CSL"].includes(quien.roleEnum)) problemas.push(`${c.empresa}: la lleva ${quien.name}, que es ${quien.roleEnum}, no de Customer Success`);
        if (c.lleva && quien?.deactivatedAt) problemas.push(`${c.empresa}: la lleva ${quien.name}, que está de baja`);
        const s = c.servicio;
        if (!s) continue;
        if (!s.paso) {
          sinPaso++;
          const tareas = await prisma.tarea.findMany({
            where: {
              clientId: c.clientId, estado: { in: ["pendiente", "en_curso"] }, privada: false, archivadaAt: null,
              OR: [
                { venceEl: { gte: new Date(semana.desde), lte: new Date(semana.hasta) } },
                { semana: { gte: new Date(semana.desde), lte: new Date(semana.hasta) } },
                { reunionInicio: { gte: new Date(`${semana.desde}T06:00:00Z`), lte: new Date(`${semana.hasta}T23:59:59-06:00`) } },
              ],
            },
            select: { numero: true, titulo: true },
          });
          if (tareas.length) problemas.push(`${c.empresa}: dice «sin siguiente paso» y tiene T-${tareas[0].numero} con fecha esta semana`);
          if (correoQueLleva) {
            const ev = await reunionCrudaCon(correoQueLleva, c.clientId);
            if (ev) problemas.push(`${c.empresa}: dice «sin siguiente paso» y el calendario de ${quien?.name ?? correoQueLleva} tiene «${ev.summary}» (${ev.start?.dateTime ?? ev.start?.date}) con alguien de la empresa`);
          }
          verificadas++;
        } else if (s.paso.tipo === "reunion") {
          conReunion++;
          if (correoQueLleva) {
            const ev = await reunionCrudaCon(correoQueLleva, c.clientId);
            if (!ev && (await calendarDeSeguro(correoQueLleva))) {
              // Puede ser una reunión planeada en Tareas, que no está en el calendario.
              const planeada = await prisma.tarea.count({ where: { clientId: c.clientId, clase: "reunion", estado: { in: ["pendiente", "en_curso"] } } });
              if (!planeada) problemas.push(`${c.empresa}: dice que tiene reunión y el calendario de ${quien?.name ?? correoQueLleva} no tiene ninguna con alguien de la empresa`);
            }
          }
        }
      }
      console.log(`   cuentas ${cuentas.length} · sin siguiente paso ${sinPaso} (verificadas ${verificadas}) · con la reunión como paso ${conReunion}`);
    }

    if (esVentas) {
      const v = await vistaDeVentas({ id: tm.id, email: tm.email }, ahora, hoyISO);
      const negociosCopia = await prisma.negocioAbierto.count({ where: { abierto: true, vendedorId: tm.id } });
      const metas = await metasPorPersona(Number(hoyISO.slice(0, 4)));
      const meta = metas.find((x) => x.teamMemberId === tm.id) ?? null;
      const tramos = await prisma.metaComercial.findMany({
        where: { vigente: true, teamMemberId: tm.id, tipo: "sales_quota", desde: { gte: new Date("2025-12-31T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z") } },
        select: { monto: true, avance: true },
      });
      const montoTramos = tramos.reduce((s, t) => s + Number(t.monto), 0);
      const avanceTramos = tramos.reduce((s, t) => s + Number(t.avance ?? 0), 0);
      const vista = v.estado === "ok" ? v.vista : null;
      console.log(`   Ventas: «${v.estado}» · negocios en la vista ${vista?.negocios.length ?? 0} · abiertos en la copia ${negociosCopia} · empresas ${vista?.empresas.length ?? 0} (${vista?.propias ?? 0} propias) · meta que ve: ${vista?.meta ? JSON.stringify(vista.meta).slice(0, 160) : "ninguna"}`);
      if (vista && vista.negocios.length !== negociosCopia) problemas.push(`${tm.name}: la vista tiene ${vista.negocios.length} negocios y la copia ${negociosCopia}`);
      if (meta) {
        console.log(`   Meta: ${Math.round(meta.avance ?? 0)} de ${Math.round(meta.monto)} (${meta.moneda}) · tramos de HubSpot: ${Math.round(avanceTramos)} de ${Math.round(montoTramos)} en ${tramos.length} tramos · vendido según Nexus ${Math.round(meta.vendidoNexus)}`);
        if (Math.abs(meta.monto - montoTramos) > 1) problemas.push(`${tm.name}: la meta dice ${meta.monto} y los tramos suman ${montoTramos}`);
      } else console.log(`   Meta: ninguna (tramos de ventas en HubSpot: ${tramos.length})`);
    }
  }

  console.log(`\n══ Problemas (${problemas.length})`);
  for (const p of problemas) console.log(`   ✗ ${p}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
