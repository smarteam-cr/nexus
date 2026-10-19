/**
 * scripts/medir-tareas-por-persona.ts — cuántas tareas tiene cada persona de Customer Success y de Ventas, y cuántas se
 * pueden quitar de la vista sin perder nada (2026-10-19; DECISIONS «Tareas internas…» › «Menos tareas a la vista»).
 *
 * Por persona: abiertas de esta semana, atrasadas (de una semana pasada o vencidas), «Más adelante», por decidir; de
 * dónde vienen; cuántas son rápidas o de seguimiento (`claseDeTrabajo`); cuántas repiten el mismo tema en la misma cuenta
 * (`temasRepetidos`); y cuántas Nexus propondría cerrar porque ya pasaron (`sugerenciaDeCierre`). Más «Por asignar» de
 * Customer Success y de Ventas.
 *
 * ⛔ SOLO LECTURA: la base se abre en solo lectura. Imprime correos del equipo (es interno) y ningún título de un cliente.
 *
 *   npx tsx scripts/medir-tareas-por-persona.ts
 *   npx tsx scripts/medir-tareas-por-persona.ts --detalle     (lista las tareas que se propondría cerrar, con su número)
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const DETALLE = process.argv.includes("--detalle");

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const { claseDeTrabajo, sugerenciaDeCierre, temasRepetidos, agruparRapidas } = await import("@/lib/tareas/aligerar");
  const { esSeguimientoSueltoDelCliente } = await import("@/lib/tareas/seguimiento");
  const { hoyEnCostaRica, lunesDeHoy, comoFecha } = await import("@/lib/tareas/semana");
  const { ultimosToquesDePersonas } = await import("@/lib/tareas/toques");

  const hoy = hoyEnCostaRica();
  const lunes = lunesDeHoy();
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · hoy ${hoy} (semana del ${lunes})\n`);

  const gente = await prisma.teamMember.findMany({
    where: { roleEnum: { in: ["CSE", "CSL", "VENTAS"] }, deactivatedAt: null, NOT: { email: "info@smarteamcr.com" } },
    select: { email: true, name: true, roleEnum: true },
    orderBy: [{ roleEnum: "asc" }, { name: "asc" }],
  });
  const emails = gente.map((g) => g.email.toLowerCase());
  const filas = await prisma.tarea.findMany({
    where: { archivadaAt: null, estado: { in: ["propuesta", "pendiente", "en_curso"] }, OR: [{ responsableEmail: { in: emails } }, { responsableEmail: null, equipo: { in: ["cs", "ventas"] } }] },
    select: {
      id: true,
      numero: true,
      titulo: true,
      estado: true,
      origen: true,
      origenId: true,
      semana: true,
      venceEl: true,
      minutosEstimados: true,
      responsableEmail: true,
      equipo: true,
      clientId: true,
      createdAt: true,
      session: { select: { participants: true } },
    },
  });
  const toques = await ultimosToquesDePersonas(filas.map((f) => f.id));

  const fuente = (f: (typeof filas)[number]) => {
    if (f.origen === "hubspot") return "HubSpot";
    if (f.origen === "paso") return "Siguiente paso";
    if (f.origen === "chat") return "Chat";
    if (f.origen === "correo") return "Correo";
    if (f.origen === "reunion" || f.origen === "notas") {
      if (f.origenId?.includes(":seg-c-")) return "Seguimiento (lo prometió el cliente)";
      if (f.origenId?.includes(":seg-s-")) return "Reunión con el cliente";
      const p = f.session?.participants ?? [];
      return p.length && p.every((x) => x.toLowerCase().endsWith("@smarteamcr.com")) ? "Sprint" : "Reunión con el cliente";
    }
    return "A mano";
  };

  const tot = { personas: 0, todas: 0, ligeras: 0, cerrar: 0, repetidas: 0, sueltas: 0, renglones: 0 };
  const cerrarDetalle: string[] = [];
  const bloque = (titulo: string, lista: typeof filas) => {
    const sem = (f: (typeof filas)[number]) => comoFecha(f.semana);
    const vence = (f: (typeof filas)[number]) => comoFecha(f.venceEl);
    const propuestas = lista.filter((f) => f.estado === "propuesta");
    const abiertas = lista.filter((f) => f.estado !== "propuesta");
    const atrasadas = abiertas.filter((f) => (sem(f) && sem(f)! < lunes) || (vence(f) && vence(f)! < hoy));
    const estaSemana = abiertas.filter((f) => sem(f) === lunes && !atrasadas.includes(f));
    const masAdelante = abiertas.filter((f) => (!sem(f) || sem(f)! > lunes) && !atrasadas.includes(f));
    const porFuente = new Map<string, number>();
    for (const f of lista) porFuente.set(fuente(f), (porFuente.get(fuente(f)) ?? 0) + 1);
    const clases = { trabajo: 0, rapida: 0, seguimiento: 0 };
    for (const f of lista) clases[claseDeTrabajo(f)]++;
    const repetidas = temasRepetidos(lista);
    const sueltas = lista.filter((f) => f.estado === "propuesta" && esSeguimientoSueltoDelCliente(f.origenId));
    const cerrar = lista
      .map((f) => ({ f, s: sugerenciaDeCierre({ titulo: f.titulo, minutosEstimados: f.minutosEstimados, estado: f.estado, origen: f.origen, venceEl: vence(f), semana: sem(f), creadaAt: f.createdAt.toISOString(), ultimoToque: toques.get(f.id)?.toISOString() ?? null }, hoy) }))
      .filter((x) => x.s);
    const viejas = abiertas.filter((f) => {
      const t = (toques.get(f.id) ?? f.createdAt).toISOString().slice(0, 10);
      return vence(f) && vence(f)! < hoy && t < vence(f)!;
    });
    // Lo que queda a la vista: cerrar lo que ya pasó y plegar lo rápido por cuenta (un renglón por cuenta).
    const quedan = lista.filter((f) => !cerrar.some((c) => c.f === f));
    const vista = agruparRapidas(quedan.map((f) => ({ ...f, cliente: f.clientId ? { id: f.clientId, nombre: f.clientId } : null })));
    const renglones = vista.trabajo.length + vista.ligeras.length;

    console.log(`${titulo}: ${lista.length} (${abiertas.length} abiertas · ${propuestas.length} por decidir)`);
    console.log(`  esta semana ${estaSemana.length} · atrasadas ${atrasadas.length} · más adelante ${masAdelante.length} · por decidir ${propuestas.length}`);
    console.log(`  de dónde: ${[...porFuente].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
    console.log(`  rápidas ${clases.rapida} · seguimientos ${clases.seguimiento} · trabajo ${clases.trabajo}`);
    console.log(`  mismo tema en la misma cuenta: ${repetidas.reduce((n, g) => n + g.length, 0)} en ${repetidas.length} grupo(s) · seguimientos sueltos por juntar: ${sueltas.length}`);
    console.log(`  ya pasaron (se propone cerrar): ${cerrar.length} · vencidas sin tocar desde que vencieron: ${viejas.length}`);
    console.log(`  a la vista después: ${renglones} renglones (de ${lista.length})\n`);
    for (const c of cerrar) cerrarDetalle.push(`  T-${c.f.numero} · ${c.f.responsableEmail ?? `Por asignar ${c.f.equipo}`} · ${c.s!.accion === "descartar" ? "Descartar" : "Ya no se hará"} · ${c.s!.motivo}`);
    return { todas: lista.length, ligeras: clases.rapida + clases.seguimiento, cerrar: cerrar.length, repetidas: repetidas.reduce((n, g) => n + g.length, 0), sueltas: sueltas.length, renglones };
  };

  const porAsignar = (eq: string) => filas.filter((f) => !f.responsableEmail && f.equipo === eq).length;
  for (const g of gente) {
    const lista = filas.filter((f) => f.responsableEmail?.toLowerCase() === g.email.toLowerCase());
    if (!lista.length) continue;
    // «Mis tareas» le suma «Por asignar» de su equipo (Ventas o Customer Success).
    const eq = g.roleEnum === "VENTAS" ? "ventas" : "cs";
    const r = bloque(`${g.name} (${g.roleEnum}, ${g.email}) · en «Mis tareas» ve ${lista.length + porAsignar(eq)} contando «Por asignar · ${eq}» (${porAsignar(eq)})`, lista);
    tot.personas++;
    tot.todas += r.todas;
    tot.ligeras += r.ligeras;
    tot.cerrar += r.cerrar;
    tot.repetidas += r.repetidas;
    tot.sueltas += r.sueltas;
    tot.renglones += r.renglones;
  }
  for (const eq of ["cs", "ventas"]) {
    const lista = filas.filter((f) => !f.responsableEmail && f.equipo === eq);
    if (lista.length) bloque(`Por asignar · ${eq}`, lista);
  }
  console.log(`TOTAL (${tot.personas} personas con tareas): ${tot.todas} tareas · ${tot.ligeras} rápidas o de seguimiento · ${tot.cerrar} se propone cerrar · ${tot.repetidas} repiten tema · ${tot.sueltas} seguimientos sueltos`);
  console.log(`  a la vista después: ${tot.renglones} renglones (de ${tot.todas})`);
  if (DETALLE && cerrarDetalle.length) console.log(`\nSe propondría cerrar:\n${cerrarDetalle.join("\n")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
