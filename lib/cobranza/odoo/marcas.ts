/**
 * lib/cobranza/odoo/marcas.ts
 *
 * Lo ÚNICO que escribe las marcas de Cobranza › Odoo › «Lo que no cuadra» (`DiferenciaOdooMarca`, 2026-09-25):
 * «Está bien así» fila por fila, su «Deshacer», y el cierre a mano «Ya está anulada» de una factura soltada con el
 * suyo.
 *
 * ── POR QUÉ ES UN ARCHIVO APARTE ─────────────────────────────────────────────────
 * Lo usa la pantalla (servicio.ts, `server-only`) y lo usan dos scripts de una sola vez, que escriben con estas mismas
 * funciones: el traspaso de la marca de grupo de las notas de crédito a marcas por fila
 * (scripts/odoo-traspasar-marcas-de-notas.ts) y la reapertura de las facturas soltadas que se cerraron sin motivo
 * (scripts/odoo-reabrir-liberadas-sin-motivo.ts), decisión de Elías del 2026-09-25. El mismo caso que atribucion.ts.
 *
 * ⛔ Nada se borra de `DiferenciaOdooMarca`: «Deshacer» firma `deshechaPor/En` y la historia de quién marcó y quién
 * deshizo queda. ⛔ Nunca toca un cobro ni el espejo de Odoo. Las dos cosas las vigila guardas.test.ts.
 * ⚠ Recibe la transacción y la hora: lo que se marca en un clic lleva la misma hora, y se escribe todo junto o nada.
 */
import type { Prisma } from "@prisma/client";
import { PREFIJO_DEL_CIERRE, huellaDeLiberacion, textoDeLiberacion, type LiberacionParaCruzar } from "./diferencias";
import type { DocumentoDeFila } from "@/lib/finanzas/inconsistencias";

/** «Está bien así». */
export const MARCA_BIEN_ASI = "BIEN_ASI";
/** «Ya está anulada» de una factura soltada. Lo que la cierra es `FacturaLiberada.resueltaEn`; la marca es su porqué. */
export const MARCA_ANULADA = "ANULADA";

/**
 * El motivo que queda en la historia de una factura soltada que se cerró antes de que «Ya está anulada» pidiera uno.
 * No se inventa otro: se dice que no lo hubo.
 */
export const SIN_MOTIVO_GUARDADO = "Ya está anulada (sin motivo: se cerró antes de que la pantalla lo pidiera)";

/**
 * «Está bien así» sobre una o varias filas de UNA línea, con el mismo motivo: una marca por documento, con los números
 * que se validaron contra lo que la persona vio (`decidirMarcas`, diferencias.ts). Devuelve cuántas marcas escribió.
 */
export async function marcarFilasTx(
  tx: Prisma.TransactionClient,
  input: {
    linea: string;
    motivo: string;
    actor: string;
    en: Date;
    filas: ReadonlyArray<{ fila: string; texto: string; documentos: readonly DocumentoDeFila[] }>;
  },
): Promise<number> {
  const data = input.filas.flatMap((f) =>
    f.documentos.map((d) => ({
      tipo: MARCA_BIEN_ASI,
      linea: input.linea,
      fila: f.fila,
      documento: d.clave,
      huella: d.huella,
      texto: f.texto,
      motivo: input.motivo,
      marcadaPor: input.actor,
      marcadaEn: input.en,
    })),
  );
  if (!data.length) return 0;
  return (await tx.diferenciaOdooMarca.createMany({ data })).count;
}

/**
 * «Deshacer» de «Está bien así»: la fila vuelve a la lista en la próxima carga. No borra: firma quién y cuándo.
 * Devuelve cuántas deshizo (0 = ya estaban deshechas).
 *
 * ⚠ Deshace TODAS las marcas abiertas de los documentos de esa fila en su línea, también las que ya habían vencido
 * porque cambió un número (la fila volvió y alguien la volvió a marcar con los números nuevos). Hasta la revisión del
 * 2026-09-25 solo deshacía las pedidas: la vencida seguía abierta y la fila volvía a su línea diciendo «volvió porque
 * cambió un número», cuando volvió porque alguien la deshizo.
 */
export async function deshacerMarcasTx(
  tx: Prisma.TransactionClient,
  input: { ids: readonly string[]; actor: string; en: Date },
): Promise<number> {
  const pedidas = await tx.diferenciaOdooMarca.findMany({
    where: { id: { in: [...input.ids] }, tipo: MARCA_BIEN_ASI, deshechaEn: null },
    select: { linea: true, documento: true },
  });
  if (!pedidas.length) return 0;
  const r = await tx.diferenciaOdooMarca.updateMany({
    where: { tipo: MARCA_BIEN_ASI, deshechaEn: null, OR: pedidas.map((m) => ({ linea: m.linea, documento: m.documento })) },
    data: { deshechaPor: input.actor, deshechaEn: input.en },
  });
  return r.count;
}

type SoltadaParaMarcar = Pick<
  LiberacionParaCruzar,
  "id" | "clienteNombre" | "monto" | "moneda" | "referenciaExterna" | "plataforma" | "decision" | "numCuota"
> & { motivo: string | null };

/**
 * «Ya está anulada»: cierra la factura soltada con quién y cuándo, y deja su marca con el motivo y lo que decía la fila.
 *
 * ⚠ Cierra solo si seguía abierta (`resueltaEn` vacío) en el mismo paso en que escribe: dos clics a la vez no la cierran
 * dos veces. false = alguien la cerró antes.
 */
export async function anularLiberacionTx(
  tx: Prisma.TransactionClient,
  input: { liberacion: SoltadaParaMarcar; linea: string; nota: string; actor: string; en: Date },
): Promise<boolean> {
  const l = input.liberacion;
  /* El motivo de la factura soltada ACUMULA: por qué se soltó y por qué se dio por cerrada son dos cosas distintas y
     las dos importan después. */
  const motivo = [l.motivo, `${PREFIJO_DEL_CIERRE}${input.nota}`].filter(Boolean).join(" · ");
  const cerrada = await tx.facturaLiberada.updateMany({
    where: { id: l.id, resueltaEn: null },
    data: { resueltaEn: input.en, resueltaPor: input.actor, motivo },
  });
  if (cerrada.count === 0) return false;
  await tx.diferenciaOdooMarca.create({
    data: {
      tipo: MARCA_ANULADA,
      linea: input.linea,
      fila: `l:${l.id}`,
      documento: `l:${l.id}`,
      huella: huellaDeLiberacion(l),
      texto: textoDeLiberacion(l),
      motivo: input.nota,
      marcadaPor: input.actor,
      marcadaEn: input.en,
    },
    select: { id: true },
  });
  return true;
}

/**
 * «Deshacer» de «Ya está anulada»: la factura soltada vuelve a la lista de lo que alguien tiene que anular.
 *
 * ⭐ Antes de abrirla se guarda quién y cuándo la había cerrado: su marca queda deshecha con la firma de quien la
 * reabre. Si se cerró antes de que existieran estas marcas (sin motivo), se escribe esa historia ahora, ya deshecha,
 * con el quién y el cuándo del cierre: no se pierde el rastro (decisión de Elías, 2026-09-25).
 *
 * `motivo` (opcional) = por qué se reabre, dicho entero. Lo pasa la reapertura de las facturas cerradas sin motivo
 * (scripts/odoo-reabrir-liberadas-sin-motivo.ts): es el motivo de la historia que se escribe ahora —la marca no tenía
 * ninguno— y lo que se suma al motivo de la factura soltada. Sin él, «Reabierta por <quién>», como en la pantalla.
 * ⚠ A una marca que ya existía no se le cambia el motivo (solo se firma su «Deshacer»: lo vigila guardas.test.ts).
 */
export async function reabrirLiberacionTx(
  tx: Prisma.TransactionClient,
  input: { liberacionId: string; actor: string; en: Date; motivo?: string },
): Promise<"REABIERTA" | "YA_ESTABA_ABIERTA" | "NO_EXISTE"> {
  const l = await tx.facturaLiberada.findUnique({
    where: { id: input.liberacionId },
    select: {
      id: true,
      clienteNombre: true,
      monto: true,
      moneda: true,
      referenciaExterna: true,
      plataforma: true,
      decision: true,
      numCuota: true,
      motivo: true,
      resueltaEn: true,
      resueltaPor: true,
    },
  });
  if (!l) return "NO_EXISTE";
  if (!l.resueltaEn) return "YA_ESTABA_ABIERTA";
  /* ⚠ Abre solo si sigue cerrada con el MISMO cierre que se leyó, en el mismo paso en que escribe, como
     `anularLiberacionTx`, y ANTES de tocar su historia. Dos «Deshacer» a la vez —dos pestañas, o la pantalla y el script
     de reapertura— la reabrían dos veces: el segundo ya no encontraba la marca que el primero había deshecho y escribía
     una historia «sin motivo» inventada, con un cierre que ya no existía, y volvía a sumar «Reabierta por…» al motivo.
     Ahora el segundo espera al primero, ve que ya está abierta y no escribe nada (revisión del 2026-09-25). */
  const motivo = [l.motivo, input.motivo ?? `Reabierta por ${input.actor}`].filter(Boolean).join(" · ");
  const abierta = await tx.facturaLiberada.updateMany({
    where: { id: l.id, resueltaEn: l.resueltaEn },
    data: { resueltaEn: null, resueltaPor: null, motivo },
  });
  if (abierta.count === 0) return "YA_ESTABA_ABIERTA";
  const documento = `l:${l.id}`;
  const deshechas = await tx.diferenciaOdooMarca.updateMany({
    where: { tipo: MARCA_ANULADA, documento, deshechaEn: null },
    data: { deshechaPor: input.actor, deshechaEn: input.en },
  });
  if (deshechas.count === 0) {
    const soltada = { ...l, monto: Number(l.monto) };
    await tx.diferenciaOdooMarca.create({
      data: {
        tipo: MARCA_ANULADA,
        /* A mano solo se cierran las que no tienen un número que la copia de Odoo pueda seguir: las de Odoo sin número y
           las de otra plataforma (`resolverLiberacion`). */
        linea: l.plataforma === "ODOO" ? "ODOO-LIBERADAS-SIN-NUMERO" : "LIBERADAS-FUERA-DE-ODOO",
        fila: documento,
        documento,
        huella: huellaDeLiberacion(soltada),
        texto: textoDeLiberacion(soltada),
        motivo: input.motivo ?? SIN_MOTIVO_GUARDADO,
        marcadaPor: l.resueltaPor ?? "(sin firma)",
        marcadaEn: l.resueltaEn,
        deshechaPor: input.actor,
        deshechaEn: input.en,
      },
      select: { id: true },
    });
  }
  return "REABIERTA";
}
