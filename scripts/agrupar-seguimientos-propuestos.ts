import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { esSeguimientoSueltoDelCliente, lineaDelSeguimientoAgrupado, pendienteDesdeLaTarea, seguimientoAgrupado, type FuenteDelCompromiso } from "@/lib/tareas/seguimiento";
import { agruparSeguimientosPropuestos } from "@/lib/tareas/mutaciones";
import { unaComunicacion } from "@/lib/comunicaciones/lectura-server";

/**
 * scripts/agrupar-seguimientos-propuestos.ts — un seguimiento por reunión y cuenta, para lo que YA estaba propuesto
 * (Elías, 2026-10-19; DECISIONS «Tareas internas…» › «Un seguimiento por reunión y cuenta»).
 *
 * Desde ese día la lectura de cada reunión deja UNA tarea de seguimiento con lo que prometió el cliente
 * (lib/tareas/seguimiento.ts). Lo propuesto antes quedó suelto: tres «Recordarle / Verificar con Randall…» de la misma
 * reunión. Este script junta, por reunión (o correo), cuenta y persona, las propuestas sueltas de seguimiento que nadie
 * decidió, cuando son dos o más: crea la que las junta y deja las sueltas «Era otra tarea» en ella, firmadas por el
 * sistema. Lo que una persona decidió no se toca. Lo que se comprometió Smarteam sigue una por una.
 *
 *   npx tsx scripts/agrupar-seguimientos-propuestos.ts                               (simulacro: solo lee)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/agrupar-seguimientos-propuestos.ts --apply    (escribe, con respaldo de Tarea y TareaEvento)
 */
const APPLY = resolverApply({ tablas: ["Tarea", "TareaEvento"] });

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");
  const filas = await prisma.tarea.findMany({
    where: { estado: "propuesta", decididaAt: null, archivadaAt: null, origenId: { contains: ":seg-c-" } },
    select: { id: true, numero: true, titulo: true, contexto: true, cita: true, venceEl: true, origenId: true, responsableEmail: true, equipo: true, clientId: true, sessionId: true, client: { select: { name: true } } },
    orderBy: { numero: "asc" },
  });
  const sueltas = filas.filter((f) => esSeguimientoSueltoDelCliente(f.origenId));
  const grupos = new Map<string, typeof sueltas>();
  for (const f of sueltas) {
    const prefijo = f.origenId!.slice(0, f.origenId!.indexOf(":seg-"));
    const destino = f.responsableEmail ?? `asignar:${f.equipo}`;
    const clave = `${prefijo}|${destino}|${f.clientId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  const aJuntar = [...grupos.entries()].filter(([, g]) => g.length >= 2);
  console.log(`Propuestas de seguimiento sueltas sin decidir: ${sueltas.length}, en ${grupos.size} reuniones o correos por persona.`);
  console.log(`Se juntan ${aJuntar.reduce((n, [, g]) => n + g.length, 0)} en ${aJuntar.length} tareas; quedan ${sueltas.length - aJuntar.reduce((n, [, g]) => n + g.length, 0)} solas.\n`);

  let hechas = 0;
  let saltadas = 0;
  for (const [clave, g] of aJuntar) {
    const [prefijo, destino] = clave.split("|") as [string, string, string];
    const base = g[0]!;
    let inicio: Date | null = null;
    let fuente: FuenteDelCompromiso = { tipo: "reunion" };
    if (prefijo.startsWith("cor:")) {
      // Por la puerta de lectura de lib/comunicaciones (solo ella lee la tabla).
      const c = base.clientId ? await unaComunicacion(base.clientId, prefijo.slice(4)) : null;
      inicio = c ? new Date(c.ocurrioAt) : null;
      fuente = { tipo: "correo", asunto: c?.asunto ?? null, autorEmail: null };
    } else if (base.sessionId) {
      inicio = (await prisma.firefliesSession.findUnique({ where: { id: base.sessionId }, select: { date: true } }))?.date ?? null;
    }
    if (!inicio) {
      saltadas++;
      console.log(`  ⚠ Sin la fecha de su reunión o correo: no se junta (T-${g.map((x) => x.numero).join(", T-")}).`);
      continue;
    }
    const items = g.map((x) => pendienteDesdeLaTarea({ titulo: x.titulo, contexto: x.contexto, venceEl: x.venceEl ? x.venceEl.toISOString().slice(0, 10) : null, cita: x.cita }));
    const a = seguimientoAgrupado(items, { empresa: base.client?.name ?? null, inicio, fuente });
    console.log(`· ${base.client?.name ?? "(sin cliente)"} · ${destino} · T-${g.map((x) => x.numero).join(", T-")}`);
    console.log(`  → ${a.titulo}`);
    for (const l of a.contexto.split("\n")) console.log(`    ${l}`);
    if (!APPLY) continue;
    const r = await agruparSeguimientosPropuestos({ tareaIds: g.map((x) => x.id), origenId: `${prefijo}:${lineaDelSeguimientoAgrupado(destino)}`, titulo: a.titulo, contexto: a.contexto, cita: a.cita, venceEl: a.venceEl }).catch((e: Error) => {
      console.log(`  ⚠ No se juntó: ${e.message}`);
      return null;
    });
    if (r) hechas++;
    else saltadas++;
  }
  if (APPLY) console.log(`\n✓ Juntadas: ${hechas}. Sin tocar: ${saltadas}. Correrlo de nuevo no cambia nada.`);
  else console.log(`\nSimulacro: no se escribió nada.${saltadas ? ` ${saltadas} grupo(s) sin fecha.` : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
