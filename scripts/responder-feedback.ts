/**
 * scripts/responder-feedback.ts — responde y cierra reportes de feedback desde la consola, por la MISMA
 * puerta que la bandeja de Nexus (`decidir`, acción «responder»): el mensaje queda en la conversación del
 * reporte, el reporte pasa a «respondido» y a quien lo mandó le llega el aviso en «Para ti».
 *
 * Sirve para cerrar en tanda lo que se resolvió fuera de la pantalla (por ejemplo, el feedback de la escala
 * que entró en una versión publicada). Solo responde reportes «sin revisar»: uno que ya se decidió no se
 * vuelve a tocar.
 *
 * Las respuestas van en un JSON en UTF-8, para que los acentos no dependan de la consola:
 *   [{ "numero": 5, "respuesta": "…" }, …]
 *
 * Uso (En tu PC):
 *   npx tsx scripts/responder-feedback.ts <respuestas.json> --por tu@smarteamcr.com             ← en seco
 *   $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/responder-feedback.ts <respuestas.json> --por tu@smarteamcr.com --apply
 *
 * `--por` es quien responde: tiene que ser super admin, como en la bandeja.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { decidir } from "@/lib/feedback/mutations";
import { esRevisorDeFeedback, numeroDeReporte } from "@/lib/feedback/reglas";
import { Decidir } from "@/lib/feedback/schema";
import { describirDestino, resolverApply } from "./lib/guard";

const Respuestas = z.array(z.object({ numero: z.number().int().positive(), respuesta: z.string().min(1) })).min(1);

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const archivo = process.argv[2];
  if (!archivo || archivo.startsWith("--")) throw new Error("Falta el archivo de respuestas: npx tsx scripts/responder-feedback.ts <respuestas.json> --por …");
  const respuestas = Respuestas.parse(JSON.parse(fs.readFileSync(archivo, "utf8")));
  const APPLY = resolverApply({ tablas: ["FeedbackReporte", "FeedbackMensaje", "Aviso"] });
  console.log(`[script] destino: ${describirDestino(process.env.DATABASE_URL)}`);

  const candidato = argumento("--por");
  const revisor = candidato
    ? await prisma.teamMember.findFirst({ where: { email: { equals: candidato, mode: "insensitive" } }, select: { email: true, roleEnum: true } })
    : null;
  if (!revisor || !esRevisorDeFeedback(revisor.roleEnum)) {
    throw new Error(`Quien responde tiene que ser super admin, como en la bandeja: usa --por tu@smarteamcr.com${candidato ? ` («${candidato}» no lo es)` : ""}.`);
  }

  const reportes = await prisma.feedbackReporte.findMany({
    where: { numero: { in: respuestas.map((r) => r.numero) } },
    select: { id: true, numero: true, estado: true, autorEmail: true, pantalla: true, escalaAncla: true },
  });
  let listos = 0;
  for (const r of respuestas) {
    const reporte = reportes.find((x) => x.numero === r.numero);
    const cita = numeroDeReporte(r.numero);
    if (!reporte) {
      console.log(`✗ ${cita}: no existe.`);
      continue;
    }
    if (reporte.estado !== "sin_revisar") {
      console.log(`= ${cita}: ya está «${reporte.estado}». No se toca.`);
      continue;
    }
    const decision = Decidir.parse({ accion: "responder", respuesta: r.respuesta });
    console.log(`${APPLY ? "✓" : "→"} ${cita} de ${reporte.autorEmail} (${reporte.pantalla}${reporte.escalaAncla ? ` · ${reporte.escalaAncla}` : ""}): responder y cerrar.`);
    console.log(`    «${r.respuesta}»`);
    if (APPLY) await decidir(reporte.id, decision, revisor.email);
    listos++;
  }
  if (!APPLY) {
    console.log(`\nEN SECO: no se escribió nada. Para responder ${listos} reporte(s):`);
    console.log(`  $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/responder-feedback.ts ${archivo} --por ${revisor.email} --apply`);
  } else {
    console.log(`\n${listos} reporte(s) respondidos y cerrados por ${revisor.email}. A cada autor le llegó el aviso en «Para ti».`);
  }
}

main()
  .catch((e) => {
    console.error(`⛔ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
