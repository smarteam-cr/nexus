/**
 * scripts/medir-proyecto-por-titulo.ts — ¿la regla «el título manda el proyecto» contradice lo que ya está? SOLO LEE.
 *
 * La regla (etapa U6, lib/sessions/proyecto-por-titulo.ts) corre sola en todo cliente con dos o más proyectos cada vez
 * que llega una reunión. Antes del deploy se mide contra lo que ya está vinculado: en cada cliente con dos o más
 * proyectos a los que se les puede colgar una reunión, para cada reunión con proyecto principal, qué diría el título.
 * Una contradicción con un vínculo que puso o revisó una persona es un error de la regla; con uno de la IA, puede ser
 * de cualquiera de los dos, y se lee.
 *
 *   npx tsx scripts/medir-proyecto-por-titulo.ts             (resumen por cliente y las contradicciones)
 *
 * Criterio para desplegar: cero contradicciones con lo que puso una persona.
 */
import "dotenv/config";
import "./lib/permitir-server-only";

/* ⛔ Solo lee: la conexión nace de solo lectura (pg lee PGOPTIONS al abrir cada conexión). */
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");

import { imprimirDestino } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { PROYECTO_CLASIFICABLE_WHERE } from "@/lib/projects/scope";
import { proyectoQueNombraElTitulo } from "@/lib/sessions/proyecto-por-titulo";

async function main() {
  imprimirDestino();
  const proyectos = await prisma.project.findMany({ where: PROYECTO_CLASIFICABLE_WHERE, select: { id: true, name: true, clientId: true } });
  const porCliente = new Map<string, { id: string; name: string }[]>();
  for (const p of proyectos) porCliente.set(p.clientId, [...(porCliente.get(p.clientId) ?? []), p]);
  const conVarios = [...porCliente].filter(([, ps]) => ps.length >= 2);
  const clientes = await prisma.client.findMany({ where: { id: { in: conVarios.map(([id]) => id) } }, select: { id: true, name: true, company: true, siglas: true } });
  const nombreDelProyecto = new Map(proyectos.map((p) => [p.id, p.name.trim()]));

  let total = 0;
  let decide = 0;
  let coincide = 0;
  const contraPersona: string[] = [];
  const contraIa: string[] = [];
  console.log(`Clientes con dos o más proyectos: ${clientes.length}\n`);
  console.log("| Cliente | Reuniones con principal | Decide el título | Coincide | Contra una persona | Contra la IA |");
  console.log("|---|---|---|---|---|---|");
  for (const c of clientes) {
    const ps = porCliente.get(c.id)!;
    const vinculos = await prisma.sessionProject.findMany({
      where: { projectId: { in: ps.map((p) => p.id) }, isPrimary: true, included: true, session: { resolvedClientId: c.id } },
      select: { projectId: true, source: true, reviewedAt: true, session: { select: { id: true, title: true } } },
    });
    let d = 0;
    let ok = 0;
    let cp = 0;
    let ci = 0;
    for (const v of vinculos) {
      const r = proyectoQueNombraElTitulo(v.session.title, ps, c);
      if (!r.proyectoId) continue;
      d++;
      if (r.proyectoId === v.projectId) {
        ok++;
        continue;
      }
      const persona = v.source === "manual" || !!v.reviewedAt;
      const linea = `- ${c.name} · «${v.session.title.trim()}»: hoy «${nombreDelProyecto.get(v.projectId)}», el título dice «${nombreDelProyecto.get(r.proyectoId)}» (${r.nombrados[0]!.palabra}) · \`${v.session.id}\``;
      (persona ? contraPersona : contraIa).push(linea);
      if (persona) cp++;
      else ci++;
    }
    total += vinculos.length;
    decide += d;
    coincide += ok;
    if (d) console.log(`| ${c.name} | ${vinculos.length} | ${d} | ${ok} | ${cp} | ${ci} |`);
  }
  console.log(`| **Total** | ${total} | ${decide} | ${coincide} | ${contraPersona.length} | ${contraIa.length} |`);
  console.log(`\n## Contra lo que puso o revisó una persona: ${contraPersona.length}\n`);
  for (const l of contraPersona) console.log(l);
  console.log(`\n## Contra lo que puso la IA: ${contraIa.length}\n`);
  for (const l of contraIa) console.log(l);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
