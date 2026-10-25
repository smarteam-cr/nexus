/**
 * lib/cobranza/odoo/banco-copia.ts — la copia de las líneas del banco de Odoo sin conciliar (U15, 2026-10-26).
 *
 * La corre la copia de Odoo (`sincronizarOdoo`, lib/cobranza/odoo/sync.ts) al final de cada corrida buena, con el
 * mismo transporte: una sesión con el ERP, no dos. ⛔ Solo lectura hacia Odoo. ⛔ No toca ningún `Cobro`.
 *
 * ⚠ NUNCA lanza: un fallo del banco no puede tumbar la copia de las facturas, que es la que alimenta el cobro de lo
 * pagado. El resultado (bueno o malo) queda en `CronJobState` «odoo-banco-copia»; INV60 avisa si la copia del banco se
 * queda atrás de la de las facturas.
 *
 * Sin `server-only`, por lo mismo que sync.ts: la corre el scheduler y se tiene que poder correr desde un script.
 */
import { prisma } from "@/lib/db/prisma";
import type { OdooTransport } from "./transporte";
import { esBorradoMasivo } from "./espejo";
import {
  cierreDeLasQueSeFueron,
  dominioBancoSinConciliar,
  dominioLineasPorId,
  mapearLineaDelBanco,
  ODOO_CAMPOS_BANCO,
  ODOO_MODELO_BANCO,
  type LineaDelBanco,
} from "./banco";

/** La fila de `CronJobState` con el resultado de la última copia del banco. */
export const CLAVE_COPIA_DEL_BANCO = "odoo-banco-copia";

export interface ResultadoDelBanco {
  ok: boolean;
  /** ISO de esta corrida. */
  at: string;
  /** ISO de la última corrida que terminó bien (sobrevive a los fallos). */
  ultimaBuena: string | null;
  sinConciliar: number;
  nuevas: number;
  conciliadas: number;
  desaparecidas: number;
  /** Líneas en cero que Odoo trae sin conciliar: no son plata que se movió y no se copian. */
  enCero: number;
  rechazadas: string[];
  error: string | null;
}

/** La última corrida buena de la copia del banco, del `lastResult` guardado. null = nunca terminó bien. */
export function ultimaCopiaBuenaDelBanco(lastResult: unknown): Date | null {
  const r = lastResult as Partial<ResultadoDelBanco> | null;
  const iso = r?.ultimaBuena ?? (r?.ok ? r.at : null);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

function datosDe(l: LineaDelBanco, ahora: Date) {
  return {
    fecha: dia(l.fecha),
    monto: l.monto,
    moneda: l.moneda,
    montoOtraMoneda: l.montoOtraMoneda,
    otraMoneda: l.otraMoneda,
    referencia: l.referencia,
    odooPartnerId: l.odooPartnerId,
    odooPartnerNombre: l.odooPartnerNombre,
    odooJournalId: l.odooJournalId,
    diario: l.diario,
    extracto: l.extracto,
    asiento: l.asiento,
    sincronizadoEn: ahora,
  };
}

/** Los números de una línea: si no cambiaron, la fila no se reescribe. */
function huellaDeLaLinea(d: {
  fecha: Date; monto: unknown; moneda: string; montoOtraMoneda: unknown; otraMoneda: string | null; referencia: string | null;
  odooPartnerId: number | null; odooPartnerNombre: string | null; odooJournalId: number; diario: string; extracto: string | null; asiento: string | null;
}): string {
  const num = (v: unknown) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
  return [
    d.fecha.toISOString().slice(0, 10), num(d.monto), d.moneda, num(d.montoOtraMoneda), d.otraMoneda ?? "", d.referencia ?? "",
    d.odooPartnerId ?? "", d.odooPartnerNombre ?? "", d.odooJournalId, d.diario, d.extracto ?? "", d.asiento ?? "",
  ].join("|");
}

/** Copia las líneas sin conciliar y cierra las que Odoo ya concilió. Nunca lanza. */
export async function copiarBancoSinConciliar(t: OdooTransport, ahora: Date): Promise<ResultadoDelBanco> {
  const previo = await prisma.cronJobState
    .findUnique({ where: { id: CLAVE_COPIA_DEL_BANCO }, select: { lastResult: true } })
    .catch(() => null);
  const res: ResultadoDelBanco = {
    ok: false,
    at: ahora.toISOString(),
    ultimaBuena: ultimaCopiaBuenaDelBanco(previo?.lastResult)?.toISOString() ?? null,
    sinConciliar: 0,
    nuevas: 0,
    conciliadas: 0,
    desaparecidas: 0,
    enCero: 0,
    rechazadas: [],
    error: null,
  };
  try {
    const crudas = await t.buscarYLeer(ODOO_MODELO_BANCO, dominioBancoSinConciliar(), ODOO_CAMPOS_BANCO, { order: "id asc" });
    const lineas: LineaDelBanco[] = [];
    for (const c of crudas) {
      const r = mapearLineaDelBanco(c);
      if ("rechazo" in r) res.rechazadas.push(r.rechazo);
      else if (r.linea.monto === 0) res.enCero++;
      else lineas.push(r.linea);
    }
    res.sinConciliar = lineas.length;

    const abiertas = await prisma.movimientoBancoOdoo.findMany({
      where: { estadoEspejo: "SIN_CONCILIAR" },
      select: { odooLineId: true },
    });
    const previas = new Map(
      (await prisma.movimientoBancoOdoo.findMany({
        where: { odooLineId: { in: lineas.map((l) => l.odooLineId) } },
        select: {
          id: true, odooLineId: true, estadoEspejo: true, fecha: true, monto: true, moneda: true, montoOtraMoneda: true,
          otraMoneda: true, referencia: true, odooPartnerId: true, odooPartnerNombre: true, odooJournalId: true, diario: true,
          extracto: true, asiento: true,
        },
      })).map((m) => [m.odooLineId, m]),
    );

    /* ⚠ Como la copia de las facturas: se escribe solo lo nuevo y lo que cambió, y lo demás se estampa de una vez. Con
       una escritura por línea, 98 líneas eran unos 18 segundos más en cada copia (y suben: en septiembre eran 14). */
    const nuevas: Array<ReturnType<typeof datosDe> & { odooLineId: number; estadoEspejo: string }> = [];
    const sinCambio: string[] = [];
    for (const l of lineas) {
      const datos = datosDe(l, ahora);
      const previa = previas.get(l.odooLineId);
      if (!previa) {
        nuevas.push({ odooLineId: l.odooLineId, ...datos, estadoEspejo: "SIN_CONCILIAR" });
        continue;
      }
      if (previa.estadoEspejo === "SIN_CONCILIAR" && huellaDeLaLinea(previa) === huellaDeLaLinea(datos)) {
        sinCambio.push(previa.id);
        continue;
      }
      // Cambió algo, o alguien la desconcilió en Odoo y vuelve a la lista: se le limpia el cierre.
      await prisma.movimientoBancoOdoo.update({
        where: { id: previa.id },
        data: { ...datos, estadoEspejo: "SIN_CONCILIAR", cerradaEn: null },
      });
    }
    if (nuevas.length) res.nuevas = (await prisma.movimientoBancoOdoo.createMany({ data: nuevas, skipDuplicates: true })).count;
    if (sinCambio.length) {
      await prisma.movimientoBancoOdoo.updateMany({ where: { id: { in: sinCambio } }, data: { sincronizadoEn: ahora } });
    }

    /* Las que estaban sin conciliar y ya no vienen: Odoo las concilió o las borró. Se piden por id para saber cuál de
       las dos (las crudas, no las mapeadas: una que Odoo devuelve y no se sabe leer no se fue). */
    const vistas = new Set(crudas.map((c) => Number(c.id)));
    const seFueron = abiertas.map((a) => a.odooLineId).filter((id) => !vistas.has(id));
    if (seFueron.length) {
      const releidas = await t.buscarYLeer(ODOO_MODELO_BANCO, dominioLineasPorId(seFueron), ["id", "is_reconciled"], {});
      const cierre = cierreDeLasQueSeFueron(
        seFueron,
        releidas.map((r) => ({ odooLineId: Number(r.id), conciliada: r.is_reconciled === true })),
      );
      /* El freno de la copia de las facturas: si de golpe «desaparecen» muchas (un permiso que cambió, una lectura que
         vino vacía), no se marca ninguna y la corrida no cuenta como buena: INV60 avisa. Las que Odoo confirma
         conciliadas sí se cierran: eso lo dijo Odoo, no un silencio. */
      const desaparecidas = [...cierre].filter(([, e]) => e === "DESAPARECIDA").length;
      const masivo = esBorradoMasivo(desaparecidas, abiertas.length);
      for (const [odooLineId, estado] of cierre) {
        if (estado === "DESAPARECIDA" && masivo) continue;
        await prisma.movimientoBancoOdoo.update({
          where: { odooLineId },
          data: { estadoEspejo: estado, cerradaEn: ahora, sincronizadoEn: ahora },
        });
        if (estado === "CONCILIADA") res.conciliadas++;
        else res.desaparecidas++;
      }
      if (masivo) {
        throw new Error(
          `${desaparecidas} líneas del banco dejaron de venir de golpe (de ${abiertas.length} sin conciliar) y Odoo no las da conciliadas: no se marcó ninguna como desaparecida.`,
        );
      }
    }
    res.ok = true;
    res.ultimaBuena = res.at;
  } catch (e) {
    res.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[odoo/banco] la copia del banco falló:", res.error);
  }
  const lastResult = { ...res, rechazadas: res.rechazadas.slice(0, 20) };
  await prisma.cronJobState
    .upsert({ where: { id: CLAVE_COPIA_DEL_BANCO }, create: { id: CLAVE_COPIA_DEL_BANCO, lastResult }, update: { lastResult } })
    .catch((e) => console.error("[odoo/banco] no se pudo guardar el resultado:", e instanceof Error ? e.message : e));
  return res;
}
