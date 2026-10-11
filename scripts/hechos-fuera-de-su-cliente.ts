import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { NOTA_POR_MOTIVO, faltaLaTablaDeLosHechos, hechosFueraDeSuCliente, type MotivoFueraDeSuCliente } from "@/lib/invariantes/hechos";
import { retirarHechos } from "@/lib/seguimiento/hechos-server";

/**
 * scripts/hechos-fuera-de-su-cliente.ts — el remedio de INV45 (memoria de la cuenta, etapa 6).
 *
 * Lista los hechos VIVOS (pendientes o delegados) que no son del cliente de su reunión: la reunión es de otro cliente,
 * la empresa es de Smarteam o un aliado, o el proyecto es de otro cliente. Con `--apply` los retira igual que un cambio
 * de dueño (lib/seguimiento/hechos-server.ts › `retirarHechos`): cierra la alerta de queja que sostenían (firmada por el
 * sistema), saca de la propuesta de la ficha los campos que vinieron de esa reunión, borra la etapa sugerida que salió
 * de ella y los desestima con la nota de por qué. Lo usado no se toca: ya lo decidió una persona.
 *
 * Antes de correrlo, revisar el dueño de cada reunión en /sessions: si está mal, corregirlo ahí (al cambiar de dueño
 * los hechos se retiran solos) y este script ya no los lista.
 *
 *   npx tsx scripts/hechos-fuera-de-su-cliente.ts                              (simulacro: solo lee)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/hechos-fuera-de-su-cliente.ts --apply   (escribe)
 */
const APPLY = resolverApply({ tablas: ["HechoDeReunion", "CsAlert", "Client", "Project"] });

const ROTULO: Record<MotivoFueraDeSuCliente, string> = {
  otro_cliente: "De una reunión que es de otro cliente",
  interno: "De una empresa de Smarteam",
  aliado: "De una empresa aliada",
  proyecto_de_otro_cliente: "De un proyecto de otro cliente",
};

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");
  let r: Awaited<ReturnType<typeof hechosFueraDeSuCliente>>;
  try {
    r = await hechosFueraDeSuCliente(prisma);
  } catch (e) {
    if (faltaLaTablaDeLosHechos(e)) {
      console.log("Esta base todavía no tiene la tabla de los hechos: no hay nada que revisar.");
      return;
    }
    throw e;
  }
  console.log(`Hechos vivos: ${r.vivos} · fuera de su cliente: ${r.fuera.length}`);
  if (!r.fuera.length) {
    console.log("✓ Nada que retirar.");
    return;
  }
  const porMotivo = new Map<MotivoFueraDeSuCliente, typeof r.fuera>();
  for (const h of r.fuera) porMotivo.set(h.motivo, [...(porMotivo.get(h.motivo) ?? []), h]);
  for (const [motivo, hechos] of porMotivo) {
    console.log(`\n${ROTULO[motivo]} (${hechos.length}) — nota: «${NOTA_POR_MOTIVO[motivo]}»`);
    for (const h of hechos) console.log(`  · ${h.linea}`);
  }
  if (!APPLY) {
    console.log("\nPara retirarlos: ALLOW_PROD_WRITE=1 npx tsx scripts/hechos-fuera-de-su-cliente.ts --apply");
    return;
  }
  let total = 0;
  for (const [motivo, hechos] of porMotivo) {
    const n = await retirarHechos(
      hechos.map((h) => h.id),
      NOTA_POR_MOTIVO[motivo],
    );
    total += n;
    console.log(`${ROTULO[motivo]}: ${n} de ${hechos.length} retirado(s).`);
  }
  const despues = await hechosFueraDeSuCliente(prisma);
  console.log(`\n${total} hecho(s) retirados. Quedan fuera de su cliente: ${despues.fuera.length}${despues.fuera.length ? " (lo que no se pudo retirar sigue delegado: ver el log de arriba)" : ""}.`);
}

main()
  .catch((e) => {
    console.error("hechos-fuera-de-su-cliente:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
