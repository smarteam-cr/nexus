/**
 * lib/finanzas/excel-vs-odoo-server.ts
 *
 * Lo que /finanzas/excel-vs-odoo lee de la base: el último Excel de cobranza que se subió, la copia de Odoo y
 * cuándo se copió. La comparación es pura y vive en excel-vs-odoo.ts.
 *
 * ⛔ SOLO LECTURA. Ni el lote, ni la copia, ni Odoo. El Excel lo sube Alex en Cobranza › Importar
 * (`crearLoteDelLibro`); esta página solo lee el más reciente, y si no hay ninguno lo dice.
 *
 * ⚠ «El último Excel» es el lote del libro más reciente por fecha de subida. Si Alex sube dos el mismo día,
 * manda el segundo: es el que él dejó.
 */
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { FUENTE_LIBRO_ALEX } from "@/lib/cobranza/libro-alex-lectura";
import { leerLoteDelLibro } from "@/lib/cobranza/libro-alex-server";
import { espejoVencido } from "@/lib/cobranza/odoo/espejo";
import { ultimaCorridaOk } from "@/lib/cobranza/odoo/sync";
import { anioDelExcel, avisosDeFrescura, compararExcelConOdoo, notaAlPie, type DatosExcelVsOdoo } from "./excel-vs-odoo";

/** El día de Costa Rica, no el de UTC: una subida de la noche caería en el día siguiente. */
const diaCR = (d: Date) => crDateParts(d).dateKey;

export async function loadExcelVsOdoo(ahora: Date = new Date()): Promise<DatosExcelVsOdoo> {
  const [ultimo, copiaOk] = await Promise.all([
    prisma.importacionCobranza.findFirst({
      where: { fuente: FUENTE_LIBRO_ALEX },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    ultimaCorridaOk(),
  ]);
  // `espejoVencido`: la misma regla que Cobranza › Odoo e INV31, para que las pantallas no discutan.
  const odoo = { copiadoEl: copiaOk ? diaCR(copiaOk) : null, atrasado: espejoVencido(copiaOk, ahora) };
  if (!ultimo) return { odoo, excel: null };

  const [lote, facturas] = await Promise.all([
    leerLoteDelLibro(ultimo.id),
    // Todas, también las que desaparecieron: «Odoo la tenía y ya no la devuelve» es una de las respuestas.
    // `select` explícito: una columna nueva de la copia no tumba la página si el código llega antes que su SQL.
    prisma.facturaOdoo.findMany({
      select: {
        numero: true,
        moveType: true,
        state: true,
        paymentState: true,
        moneda: true,
        montoTotal: true,
        montoResidual: true,
        odooPartnerId: true,
        odooPartnerNombre: true,
        invoiceDate: true,
        estadoEspejo: true,
      },
    }),
  ]);
  // Lo borraron entre las dos lecturas: para la página es lo mismo que no haber subido ninguno.
  if (!lote) return { odoo, excel: null };

  // `creadoPor` es el correo de quien lo subió; se muestra su nombre si es del equipo.
  const miembro = await prisma.teamMember.findUnique({ where: { email: lote.creadoPor }, select: { name: true } });
  const excelDelDia = diaCR(new Date(lote.createdAt));
  const comparacion = compararExcelConOdoo({
    filas: lote.filas,
    facturas: facturas.map((f) => ({
      ...f,
      montoTotal: Number(f.montoTotal),
      montoResidual: Number(f.montoResidual),
      invoiceDate: f.invoiceDate.toISOString().slice(0, 10),
    })),
    excelDelDia,
    odooDelDia: odoo.copiadoEl,
    anio: anioDelExcel(lote.filas, Number(excelDelDia.slice(0, 4))),
  });

  return {
    odoo,
    excel: {
      subidoEl: excelDelDia,
      subidoPor: miembro?.name ?? lote.creadoPor,
      filasIlegibles: lote.filasIlegibles,
      comparacion,
      notaAlPie: notaAlPie(comparacion.noComparado),
      avisos: avisosDeFrescura({ excelDelDia, odooDelDia: odoo.copiadoEl, odooAtrasado: odoo.atrasado }),
    },
  };
}
