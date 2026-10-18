/**
 * scripts/fotografiar-meses-del-margen.ts — la foto del margen de los meses que ya cerraron (Rentabilidad, E6 de
 * docs/rentabilidad-y-carga-plan.md, 2026-10-17).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Desde el deploy, el job `rentabilidad-foto-mensual` toma la foto del mes que cerró, el día 3 de cada mes. Los meses
 * anteriores del año no la tienen: Rentabilidad los sigue calculando en vivo y lo dice. Este script la toma para los
 * meses cerrados del año que no la tienen, con el MISMO cálculo de la pantalla (lib/rentabilidad/foto-server.ts, el único
 * escritor). Un mes que ya tiene foto no se toca, salvo con `--rehacer --motivo "…"`.
 *
 * ⚠ La foto de un mes viejo es lo que el cálculo dice HOY de ese mes (los cobros, la planilla y los supuestos de hoy),
 * no lo que decía cuando cerró: ese dato no existe. La fila lo dice con `tomadaPor` y la fecha.
 *
 * Uso (después del SQL scripts/sql/2026-10-17-foto-del-margen.sql y del deploy):
 *   npx tsx scripts/fotografiar-meses-del-margen.ts                       (simulacro: arma las fotos sin escribir)
 *   npx tsx scripts/fotografiar-meses-del-margen.ts --mes 2026-08         (un mes solo)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/fotografiar-meses-del-margen.ts --apply --por tu@smarteamcr.com
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/fotografiar-meses-del-margen.ts --apply --mes 2026-08 --rehacer --motivo "Se cargó tarde la planilla de agosto" --por tu@smarteamcr.com
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { esMesCerrado, mesesCerradosDelAnio } from "@/lib/rentabilidad/foto";
import { fotosDisponibles, leerFotos } from "@/lib/rentabilidad/foto-lectura-server";
import { tomarFotoDelMes } from "@/lib/rentabilidad/foto-server";

const APPLY = resolverApply({ tablas: ["FotoMargenMes", "FotoMargenCuenta"] });

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const usd = (n: number) => `US$${Math.round(n).toLocaleString("es-CR")}`;

async function main() {
  const ahora = new Date();
  const soloMes = argumento("--mes");
  const rehacer = process.argv.includes("--rehacer");
  const motivo = argumento("--motivo");
  const por = argumento("--por") ?? "sistema";
  if (soloMes && !esMesCerrado(soloMes, ahora)) throw new Error(`${soloMes} no es un mes cerrado (va como AAAA-MM).`);
  if (rehacer && !motivo) throw new Error("--rehacer pide --motivo \"…\": queda escrito en la foto.");
  if (rehacer && !soloMes) throw new Error("--rehacer va con --mes: se vuelve a tomar de a un mes.");
  if (!(await fotosDisponibles())) throw new Error("Falta el SQL scripts/sql/2026-10-17-foto-del-margen.sql (o el cliente de Prisma no tiene las tablas).");

  const meses = soloMes ? [soloMes] : mesesCerradosDelAnio(ahora);
  const conFoto = await leerFotos(meses);
  let tomadas = 0;
  for (const mes of meses) {
    const ya = conFoto.get(mes);
    if (ya && !rehacer) {
      console.log(`${mes} · ya tiene foto (${ya.tomadaPor}, ${ya.tomadaAt.toISOString().slice(0, 10)}): no se toca`);
      continue;
    }
    const r = await tomarFotoDelMes(mes, { por, reemplazar: rehacer, motivo, ahora, enSeco: !APPLY });
    if (r.estado === "ya-estaba") {
      console.log(`${mes} · ya tiene foto: no se toca`);
      continue;
    }
    const m = r.foto.mes;
    console.log(
      `${mes} · ${APPLY ? (r.estado === "reemplazada" ? "foto reemplazada" : "foto tomada") : "se tomaría"}: ${r.cuentas} cuenta(s) · ` +
        `cobrado ${usd(m.ingreso)} · planilla ${usd(m.planilla)} · ${Math.round(m.horasConClientes)} h con clientes ` +
        `(${Math.round(m.horasCalendario)} del calendario, ${Math.round(m.horasRespondidas)} respondidas, ${Math.round(m.horasEstimadas)} estimadas)` +
        (m.tasa ? ` · tipo de cambio ${m.tasa.crcPorUsd} (${m.tasa.fuente})` : " · ⚠ sin tipo de cambio del mes") +
        (m.avisos.length ? `\n   avisos: ${m.avisos.join(" · ")}` : ""),
    );
    tomadas++;
  }
  console.log(
    APPLY
      ? `\nListo: ${tomadas} foto(s) escrita(s).`
      : `\nSimulacro: no se escribió nada. ${tomadas} foto(s) se escribirían con --apply.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
