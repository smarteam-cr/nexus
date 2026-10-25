/**
 * scripts/revisar-conferencias-de-meet.ts — la revisión de las conferencias de Meet a mano (U3, 2026-10-25): la misma
 * que corre el job `google-meet-conferencias` cada 10 minutos (lib/google/conferencias.ts).
 *
 * Sirve para la primera carga después del deploy (las reuniones de los últimos 28 días, antes de que Google borre sus
 * frases a los 30) y para ponerse al día si el job estuvo parado (INV53 en rojo).
 *
 *   npx tsx scripts/revisar-conferencias-de-meet.ts                      # simulacro: pregunta a Google, no escribe
 *   npx tsx scripts/revisar-conferencias-de-meet.ts --limite 20          # de a cuántas (por defecto 40)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/revisar-conferencias-de-meet.ts --apply --limite 200
 *
 * Con --apply escribe la asistencia, las frases y el estado de cada conferencia, y devuelve a la cola de lectura las
 * reuniones sin transcripción (o con la de otra reunión) que recibieron sus frases: las lee después la copia de Meet de
 * cada 10 minutos, con su resumen y su lectura con Claude. ⚠ Va DESPUÉS del deploy y del SQL 2026-10-25-google-meet-api.sql.
 *
 * El respaldo: las dos tablas que escribe enteras (nacen vacías con el SQL). De `FirefliesSession` no se respalda nada a
 * propósito: el script solo llena columnas que el SQL acaba de crear y pone `enrichedAt` en null en las que vuelven a la
 * cola (la línea «a la cola» del resultado dice cuántas); los textos los cambia después la lectura de siempre, que avisa
 * cuando el texto de una reunión ya leída cambia (lib/sessions/reanalizar.ts).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { revisarConferencias } from "@/lib/google/conferencias";

const APPLY = resolverApply({ tablas: ["FraseDeReunion", "ParticipanteDeReunion"] });
const i = process.argv.indexOf("--limite");
const LIMITE = i > 0 ? Number(process.argv[i + 1]) : 40;

async function main() {
  console.log(`${APPLY ? "APLICANDO" : "SIMULACRO (sin --apply no se escribe nada)"} · hasta ${LIMITE} reuniones\n`);
  const r = await revisarConferencias({ limite: LIMITE, escribir: APPLY });
  if (r.sinTabla) {
    console.log("Falta el SQL scripts/sql/2026-10-25-google-meet-api.sql en esta base (o el cliente Prisma sin regenerar).");
    return;
  }
  for (const linea of r.detalle ?? []) console.log(`  ${linea}`);
  console.log(
    `\n${r.miradas} reuniones miradas: ${r.ocurrieron} ocurrieron, ${r.noOcurrieron} no ocurrieron, ${r.sinAcceso} sin acceso; ` +
      `${r.cerradas} ya sin nada que esperar · ${r.asistentes} personas · ${r.frases} frases${APPLY ? ` · ${r.aLeer} a la cola de lectura` : ""}` +
      (r.sinCuenta ? ` · ${r.sinCuenta} sin una cuenta del equipo que pueda leer la API` : ""),
  );
  if (r.cortada) console.log(`Google pidió esperar: ${r.cortada}. Volver a correrlo en unos minutos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
