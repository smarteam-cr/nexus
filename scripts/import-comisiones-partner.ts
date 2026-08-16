/**
 * scripts/import-comisiones-partner.ts — carga las comisiones de partner del
 * Excel «Comisiones 2026» (hoja visible).
 *
 * DRY-RUN por default; escribe solo con `--apply` + ALLOW_PROD_WRITE=1.
 *
 * ⚠ SON 5 PAGOS, NO 10. La hoja trae una fila de ACUMULADO (`=B11+C11`) que
 * repite cada total en dos columnas: sumarla da $198.961,05, que es exactamente
 * el doble de lo que entró. El total REAL es $91.262,55. Por eso los montos
 * están escritos acá a mano, leídos celda por celda, y no salen de un parser
 * que volvería a caer en la misma fila.
 *
 * ⚠ Las 3 hojas OCULTAS del archivo son de un año anterior (otro roster, otras
 * tarjetas, HubSpot a $300) y NO se cargan.
 *
 * `clientId` queda null en los 5: ninguno de los 4 partners existe como Client
 * (el único ALIADO de la cartera es 4am Saatchi). El partner vive como string —
 * es exactamente para eso que la FK es opcional.
 *
 * Idempotente por (partner, fecha, monto): re-correrlo no duplica.
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const REGISTRADO_POR = "import:comisiones-2026";

interface Fila {
  partner: string;
  concepto: string;
  monto: number;
  fecha: string; // ISO
}

// Leídas celda por celda de la hoja visible. USD las cinco.
const FILAS: Fila[] = [
  { partner: "HubSpot", concepto: "Comisión quincena 15-feb", monto: 38756.61, fecha: "2026-02-15" },
  { partner: "HubSpot", concepto: "Comisión quincena 15-may", monto: 45921.72, fecha: "2026-05-15" },
  { partner: "Atom Chat", concepto: "Comisión quincena 15-feb", monto: 2796.75, fecha: "2026-02-15" },
  { partner: "Atom Chat", concepto: "Comisión quincena 15-may", monto: 2849.25, fecha: "2026-05-15" },
  { partner: "Cooby", concepto: "Comisión quincena 30-jul", monto: 938.22, fecha: "2026-07-30" },
];

// Nua talk aparece en la hoja con TODO en cero: no se carga una fila de $0 —
// no es una comisión, es una columna que quedó vacía.

async function main() {
  const apply = resolverApply();
  const { prisma, close } = createScriptDb();

  const total = FILAS.reduce((s, f) => s + f.monto, 0);
  console.log(`\nComisiones de partner · ${FILAS.length} pagos · USD ${total.toFixed(2)}\n`);

  let altas = 0;
  let yaEstaban = 0;

  for (const f of FILAS) {
    const existente = await prisma.comisionPartner.findFirst({
      where: { partner: f.partner, fecha: new Date(`${f.fecha}T00:00:00Z`), monto: f.monto },
      select: { id: true },
    });
    if (existente) {
      yaEstaban++;
      console.log(`  =  ${f.partner.padEnd(12)} ${f.fecha}  USD ${f.monto.toFixed(2)}  (ya estaba)`);
      continue;
    }
    altas++;
    console.log(`  +  ${f.partner.padEnd(12)} ${f.fecha}  USD ${f.monto.toFixed(2)}`);
    if (apply) {
      await prisma.comisionPartner.create({
        data: {
          partner: f.partner,
          concepto: f.concepto,
          monto: f.monto,
          moneda: "USD",
          fecha: new Date(`${f.fecha}T00:00:00Z`),
          notas: "Cargado del Excel «Comisiones 2026» (hoja visible). La fecha es la quincena del documento, no dato bancario.",
          registradoPor: REGISTRADO_POR,
        },
      });
    }
  }

  console.log(`\n${altas} alta(s) · ${yaEstaban} ya estaban`);
  console.log(apply ? "APLICADO.\n" : "DRY-RUN. Volvé a correr con --apply para escribir.\n");
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
