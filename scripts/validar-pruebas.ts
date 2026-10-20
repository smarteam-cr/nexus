/**
 * scripts/validar-pruebas.ts — SOLO LECTURA. Las pruebas del roadmap que se pueden comprobar con los datos y las mismas
 * funciones de la pantalla, sin sesión (pasada de validación del 2026-10-19, docs/validacion-2026-10-19.md › área 8).
 *
 * Cada bloque dice el número de la prueba, lo que espera el roadmap y lo que hay hoy en producción:
 *   115/206/207 Librería Internacional (un encargado, una sola fila «HubSpot Refresh» activa)
 *   165/166/200 en qué proyecto abre la ficha de Cemaco para cada persona (`elegirProyectoParaQuienMira`)
 *   168 Cemaco y Total Finco en una sola ficha, con su cuenta de cobro
 *   209 el CSE de Cemaco (la regla única de quién lleva la cuenta)
 *   135/136 «Por asignar · Customer Success»
 *   140/141 las propuestas de salud del vigía (`cargarPropuestasDelVigia`)
 *   225/226 lo que ve la CSL y Heiver en «Esta semana» y «También para hoy» sobre HubSpot
 *   30 la recomendación de SmartLoop en «Para ti» de Juan Carlos
 *   37/38 la foto del margen de cada mes · 83 la meta del año
 *
 *   npx tsx scripts/validar-pruebas.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { proyectoNavegableWhere } = await import("@/lib/projects/scope");
  const { elegirProyectoParaQuienMira, SELECT_PARA_ELEGIR_PROYECTO } = await import("@/lib/clients/proyecto-inicial-server");
  const { encargadoDe } = await import("@/lib/cuentas/encargado-server");
  const { cargarPropuestasDelVigia } = await import("@/lib/cs/propuestas-del-vigia-server");
  const { alcanceDe } = await import("@/lib/para-ti/alcance-server");
  const { medirParaTi } = await import("@/lib/para-ti/medir-server");

  const persona = (nombre: string) => prisma.teamMember.findFirst({ where: { name: { contains: nombre, mode: "insensitive" } } });

  console.log("── 115/206 · Librería Internacional");
  const libreria = await prisma.client.findMany({ where: { name: { contains: "Librer", mode: "insensitive" } }, select: { id: true, name: true, projects: { select: { name: true, status: true, hubspotOwnerEmail: true, hubspotServiceId: true } } } });
  for (const c of libreria) {
    const e = await encargadoDe(c.id);
    console.log(`   ${c.name}: encargado ${e.nombre ?? "—"}${e.otros.length ? ` (+${e.otros.length}: ${e.otros.map((o) => o.nombre).join(", ")})` : ""}`);
    for (const p of c.projects) console.log(`     · «${p.name}» ${p.status} · ${p.hubspotOwnerEmail ?? "—"} · ${p.hubspotServiceId ?? "sin HubSpot"}`);
  }

  console.log("\n── 168 · Cemaco y Total Finco");
  for (const n of ["Cemaco", "Total Finco"]) {
    const cs = await prisma.client.findMany({ where: { name: { contains: n, mode: "insensitive" } }, select: { id: true, name: true, kind: true, cuentaFinanciera: { select: { id: true, _count: { select: { servicios: true, cobros: true } } } } } });
    for (const c of cs) console.log(`   ${c.name} (${c.kind}) · cuenta de cobro ${c.cuentaFinanciera ? `sí, ${c.cuentaFinanciera._count.servicios} servicios y ${c.cuentaFinanciera._count.cobros} cobros` : "no"}`);
  }

  console.log("\n── 165/166/200/209 · Cemaco: en qué proyecto abre la ficha y quién la lleva");
  const cemaco = await prisma.client.findFirst({ where: { name: { equals: "Cemaco Internacional", mode: "insensitive" } }, select: { id: true } });
  if (cemaco) {
    const proyectos = await prisma.project.findMany({ where: proyectoNavegableWhere({ clientId: cemaco.id }), select: { ...SELECT_PARA_ELEGIR_PROYECTO, name: true }, orderBy: { createdAt: "asc" } });
    const nombre = new Map(proyectos.map((p) => [p.id, p.name]));
    for (const n of ["Liliana Moreno", "Heiver Gomez", "Breiner", "Alejandro Salas", "Alexander Vanegas", "Elías González", "Andrés Pinzón"]) {
      const tm = await persona(n);
      if (!tm) continue;
      const r = await elegirProyectoParaQuienMira(proyectos, { email: tm.email, rol: tm.roleEnum });
      console.log(`   ${tm.name} (${tm.roleEnum}): ${r.id ? `«${nombre.get(r.id)}» (${r.motivo})` : "la cuenta"}`);
    }
    const e = await encargadoDe(cemaco.id);
    console.log(`   Lleva la cuenta: ${e.nombre ?? "—"}${e.otros.length ? ` · también: ${e.otros.map((o) => o.nombre).join(", ")}` : ""}`);
  }

  console.log("\n── 135/136 · «Por asignar · Customer Success»");
  const porAsignar = await prisma.tarea.count({ where: { equipo: "cs", responsableEmail: null, estado: { in: ["pendiente", "en_curso", "propuesta"] }, archivadaAt: null } });
  console.log(`   Abiertas o por decidir sin responsable en el sprint de CS: ${porAsignar}`);

  console.log("\n── 140/141 · Propuestas de salud del vigía");
  const props = await cargarPropuestasDelVigia();
  console.log(`   ${props.length} propuestas vigentes`);
  for (const p of props) console.log(`     · ${p.cuenta} · ${p.proyecto}: ${p.actual} → ${p.propuesta} · ${p.razon.slice(0, 90)}`);

  console.log("\n── 225/226/30 · Lo que dicen «Esta semana» y «También para hoy»");
  for (const n of ["Alexander Vanegas", "Heiver Gomez", "Juan Carlos Armijos"]) {
    const tm = await persona(n);
    if (!tm) continue;
    const m = await medirParaTi(await alcanceDe(tm), new Date());
    const hs = [...m.tambien, ...m.semana].filter((x) => /hubspot|encargado|smartloop|recurrente/i.test(`${x.titulo} ${x.detalle}`));
    console.log(`   ${tm.name}:`);
    for (const x of hs) console.log(`     · [${m.tambien.includes(x) ? "también" : "semana"}] ${x.titulo} — ${x.detalle.slice(0, 100)}`);
    if (!hs.length) console.log("     (nada de HubSpot, encargado ni SmartLoop)");
  }

  console.log("\n── 37/38 · La foto del margen");
  const fotos = await prisma.fotoMargenMes.findMany({ orderBy: { mes: "asc" }, select: { mes: true, version: true, tomadaPor: true, tomadaAt: true, motivo: true } });
  for (const f of fotos) console.log(`   ${f.mes} · v${f.version} · ${f.tomadaPor} · ${f.tomadaAt.toISOString().slice(0, 16)}${f.motivo ? ` · motivo: ${f.motivo}` : ""}`);

  console.log("\n── 83 · La meta del año");
  const metas = await prisma.metaDeFacturacion.findMany({ orderBy: { definidaAt: "asc" }, select: { anio: true, montoUsd: true, definidaPor: true, definidaAt: true } });
  for (const m of metas) console.log(`   ${m.anio}: US$${Number(m.montoUsd).toLocaleString("es-CR")} · ${m.definidaPor} · ${m.definidaAt.toISOString().slice(0, 10)}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
