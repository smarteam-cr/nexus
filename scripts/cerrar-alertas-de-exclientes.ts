import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { CIERRE_DEL_SISTEMA } from "@/lib/cs/alertas-reglas";
import { aplicarOperacionesDeClasificacion } from "@/lib/cs/clasificacion-server";
import { cuentasExcliente } from "@/lib/cs/exclientes-server";
import { EXCLIENTE } from "@/lib/cs/exclientes";

/**
 * scripts/cerrar-alertas-de-exclientes.ts — las alertas abiertas de las cuentas marcadas «excliente» (2026-10-17).
 *
 * Desde ese deploy, una cuenta con la relación CONFIRMADA «excliente» no recibe alertas ni las muestra
 * (lib/cs/exclientes.ts). Las que ya estaban abiertas quedan en la base, escondidas; este script las cierra, firmadas
 * por el sistema y con su nota. Si la cuenta vuelve a ser cliente, el vigía levanta lo que vea (un cierre del sistema
 * no suprime la reaparición, lib/cs/alertas-reglas.ts).
 *
 * Con `--marcar <clientId> --por <correo>` también confirma la relación «excliente» de esa cuenta, como si la CSL la
 * eligiera en Éxito del cliente › Cartera (mismo escritor: aplicarOperacionesDeClasificacion). Lo normal es que la
 * marque la CSL en la pantalla; esto es para no esperar.
 *
 *   npx tsx scripts/cerrar-alertas-de-exclientes.ts                                                   (simulacro)
 *   npx tsx scripts/cerrar-alertas-de-exclientes.ts --marcar cmpc0en9000l2xgijykm0086f --por avanegas@smarteamcr.com
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-alertas-de-exclientes.ts [--marcar … --por …] --apply
 *     (escribe, con respaldo de CsAlert y ClasificacionDeCuenta)
 */
const APPLY = resolverApply({ tablas: ["CsAlert", "ClasificacionDeCuenta"] });

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");
  const marcar = argumento("--marcar");
  const por = argumento("--por")?.toLowerCase() ?? null;

  if (marcar) {
    if (!por) throw new Error("--marcar pide --por <correo de quien lo confirma>");
    const [cliente, quien, ya] = await Promise.all([
      prisma.client.findUnique({ where: { id: marcar }, select: { name: true } }),
      prisma.teamMember.findFirst({ where: { email: { equals: por, mode: "insensitive" }, deactivatedAt: null }, select: { name: true } }),
      prisma.clasificacionDeCuenta.findUnique({ where: { clientId: marcar }, select: { relacion: true } }),
    ]);
    if (!cliente) throw new Error(`No existe el cliente ${marcar}`);
    if (!quien) throw new Error(`${por} no es alguien activo del equipo`);
    if (ya?.relacion === EXCLIENTE) console.log(`«${cliente.name}» ya está confirmado como excliente.`);
    else {
      console.log(`Confirmar «${cliente.name}» como excliente, a nombre de ${quien.name} (hoy: ${ya?.relacion ?? "sin confirmar"}).`);
      if (APPLY) await aplicarOperacionesDeClasificacion(marcar, [{ accion: "confirmar", dato: "relacion", valor: EXCLIENTE }], por);
    }
  }

  const exclientes = await cuentasExcliente();
  if (marcar && !APPLY) exclientes.add(marcar);
  if (exclientes.size === 0) {
    console.log("\n✓ Ninguna cuenta está confirmada como excliente.");
    return;
  }
  const abiertas = await prisma.csAlert.findMany({
    where: { clientId: { in: [...exclientes] }, status: { in: ["OPEN", "SEEN"] } },
    select: { id: true, category: true, title: true, client: { select: { name: true } } },
    orderBy: { lastDetectedAt: "desc" },
  });
  console.log(`\nCuentas excliente: ${exclientes.size}. Alertas abiertas en ellas: ${abiertas.length}`);
  for (const a of abiertas) console.log(`  · ${a.client.name} · ${a.category} · ${a.title}`);
  if (abiertas.length === 0) {
    console.log("\n✓ Nada que cerrar.");
    return;
  }
  if (!APPLY) {
    const marcarArgs = marcar ? ` --marcar ${marcar} --por ${por}` : "";
    console.log(`\nPara aplicarlo: ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-alertas-de-exclientes.ts${marcarArgs} --apply`);

    return;
  }
  const r = await prisma.csAlert.updateMany({
    where: { id: { in: abiertas.map((a) => a.id) }, status: { in: ["OPEN", "SEEN"] } },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedByEmail: CIERRE_DEL_SISTEMA,
      resolutionNote: "Se cerró porque la cuenta está marcada excliente (2026-10-17). Si vuelve a ser cliente, cambia su relación en la Cartera.",
    },
  });
  console.log(`\n✓ ${r.count} alerta(s) cerradas.`);
}

main()
  .catch((e) => {
    console.error("cerrar-alertas-de-exclientes:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
