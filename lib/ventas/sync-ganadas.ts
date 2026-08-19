/**
 * lib/ventas/sync-ganadas.ts
 *
 * Trae los tratos GANADOS de HubSpot y los espeja en `VentaGanada`. Es el dato que Nexus
 * no tenía: cuánto se vendió y —sobre todo— CUÁNDO. La fecha de venta no existe en
 * ninguna otra parte del sistema (`fechaInicioFacturacion` es la fecha del primer cobro
 * importado, no la del contrato).
 *
 * ── REGLAS DE ROBUSTEZ, todas por un motivo MEDIDO ──────────────────────────────
 *
 *  · LOCK EN DB (patrón `lib/cs/partner-sync.ts`): el cron, un botón y un script comparten
 *    UNA corrida a la vez entre las DOS máquinas que comparten esta base.
 *
 *  · GUARDA DE SANIDAD: si la búsqueda trae menos del 50% de lo que ya conocíamos, la
 *    corrida se marca parcial y NO reclasifica nada. Un 429 de HubSpot no puede vaciar el
 *    año de ventas.
 *
 *  · NUNCA se borra una fila. Un trato que dejó de volver se marca DESAPARECIDA; uno que
 *    volvió a una etapa abierta, REABIERTA. Borrar haría que el vendido de un año cerrado
 *    cambiara sin dejar rastro.
 *
 *  · BITÁCORA DE MONTO, que es el riesgo REAL: se midió que 0 de 121 tratos con cierre en
 *    2026 fueron reabiertos, pero 27 de 49 tienen el `amount` editado después de ganarse
 *    (DISTELSA pasó por 7 versiones, de $7.600 a $3.600). El vendido del año es un número
 *    vivo: sin bitácora se mueve solo.
 *
 *  · MONEDA NATIVA. Se guarda el monto tal como está en HubSpot más el convertido que
 *    HubSpot calcula, este último SOLO como control. Convertir es trabajo del reporte, con
 *    `TipoCambioMes`, como todo el resto del módulo.
 *
 *  · EL CLIENTE SE RESUELVE POR EMPRESA, y si falla, por el NOMBRE del trato — pero eso
 *    queda registrado en `clienteVia` porque es un HALLAZGO, no un éxito: significa que la
 *    venta cuelga de otra empresa que la que factura. Pasa por dos motivos reales: hay
 *    empresas duplicadas en HubSpot (el trato de AMVAC apunta a una company distinta de la
 *    que Nexus guarda) y hay grupos donde la venta se registra en la madre y la
 *    facturación en la hija (Analisalab bajo Grupo Inve, Corrugando bajo ACCCSA, y el TEC
 *    con sus sub-escuelas).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { huelaAPrueba } from "./clasificar-huecos";
import { ETAPAS_GANADAS, ETAPAS_PERDIDAS, labelDePipeline } from "./pipelines";

// Se re-exportan para no romper a quien ya las importaba de acá; viven en ./pipelines.
export { ETAPAS_GANADAS, ETAPAS_PERDIDAS, PIPELINES_VENTA_PROPIA } from "./pipelines";

const LOCK_KEY = "ventas-ganadas-sync-lock";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const PROPIEDADES = [
  "dealname",
  "amount",
  "amount_in_home_currency",
  "deal_currency_code",
  "closedate",
  "pipeline",
  "dealstage",
  "hs_date_entered_closedwon",
];

export interface SyncVentasResult {
  /** true = otra corrida (esta u otra máquina) tiene el lock; no se hizo nada. */
  locked?: boolean;
  /** true = la búsqueda trajo sospechosamente poco; no se reclasificó nada. */
  parcial?: boolean;
  traidas: number;
  altas: number;
  actualizadas: number;
  sinCambio: number;
  cambios: number;
  /** Ventas espejadas SIN monto en HubSpot: existen, pero no se sabe cuánto valen. */
  sinMonto: number;
  reclasificadas: number;
  errores: string[];
}

async function tomarLock(now: Date): Promise<boolean> {
  await prisma.cronJobState
    .upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } })
    .catch((e) => {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    });
  const claimed = await prisma.cronJobState.updateMany({
    where: {
      id: LOCK_KEY,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }],
    },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}

async function soltarLock(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } }).catch(() => {});
}

const norm = (x: string) =>
  x
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

const numOrNull = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fechaOrNull = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const t = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
};

/** Solo el DÍA, en UTC: la fecha de cierre es una fecha de calendario, no un instante. */
const soloDia = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);

/**
 * Sincroniza los tratos ganados con cierre en el rango pedido.
 *
 * `desde`/`hasta` en "YYYY-MM-DD". Por defecto, el año en curso — pero el backfill
 * histórico pasa un rango largo.
 */
export async function syncVentasGanadas(opciones: {
  desde: string;
  hasta: string;
  /** Solo mira y reporta: no escribe una fila. */
  dryRun?: boolean;
}): Promise<SyncVentasResult> {
  const now = new Date();
  const res: SyncVentasResult = {
    traidas: 0,
    altas: 0,
    actualizadas: 0,
    sinCambio: 0,
    cambios: 0,
    sinMonto: 0,
    reclasificadas: 0,
    errores: [],
  };

  if (!opciones.dryRun && !(await tomarLock(now))) return { ...res, locked: true };

  try {
    const hs = await getSystemHubspotClient();

    // ── 1. Traer los ganados del rango ────────────────────────────────────────
    const crudos: Array<{ id: string; p: Record<string, string | null> }> = [];
    let after: string | undefined;
    do {
      const r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/deals/search",
        body: {
          filterGroups: [
            {
              filters: [
                { propertyName: "dealstage", operator: "IN", values: [...ETAPAS_GANADAS] },
                {
                  propertyName: "closedate",
                  operator: "BETWEEN",
                  // ⚠ EN MILIS, NO EN "YYYY-MM-DD". `closedate` es un instante, y con la
                  // fecha pelada HubSpot lee la medianoche: "2026-12-31" dejaba fuera TODO
                  // el 31 de diciembre. No es teórico — así se perdió un trato real de 2023
                  // (Seléctrica, cerrado el 31-dic a las 20:17), que al no volver en la
                  // búsqueda se marcaba REABIERTA y salía del vendido del año.
                  value: String(Date.parse(`${opciones.desde}T00:00:00.000Z`)),
                  highValue: String(Date.parse(`${opciones.hasta}T23:59:59.999Z`)),
                },
              ],
            },
          ],
          properties: PROPIEDADES,
          limit: 100,
          after,
        },
      });
      if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = (await r.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
        paging?: { next?: { after?: string } };
      };
      for (const d of data.results ?? []) crudos.push({ id: d.id, p: d.properties });
      after = data.paging?.next?.after;
    } while (after);
    res.traidas = crudos.length;

    // ── 2. La empresa de cada trato ───────────────────────────────────────────
    const companyDe = new Map<string, string>();
    for (let i = 0; i < crudos.length; i += 100) {
      const lote = crudos.slice(i, i + 100);
      const r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v4/associations/deals/companies/batch/read",
        body: { inputs: lote.map((d) => ({ id: d.id })) },
      });
      if (!r.ok) {
        res.errores.push(`asociaciones lote ${i / 100 + 1}: HTTP ${r.status}`);
        continue;
      }
      const data = (await r.json()) as {
        results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string }> }>;
      };
      for (const x of data.results ?? []) if (x.to?.[0]) companyDe.set(x.from.id, String(x.to[0].toObjectId));
    }

    // ── 3. Los clientes de Nexus, para resolver ───────────────────────────────
    const clientes = await prisma.client.findMany({
      select: { id: true, name: true, hubspotCompanyId: true },
    });
    const porCompany = new Map(clientes.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, c]));
    const porNombre = new Map<string, typeof clientes>();
    for (const c of clientes) {
      const k = norm(c.name);
      if (k.length >= 6) porNombre.set(k, [...(porNombre.get(k) ?? []), c]);
    }
    const resolverCliente = (dealId: string, dealName: string) => {
      const comp = companyDe.get(dealId);
      const directo = comp ? porCompany.get(comp) : undefined;
      if (directo) return { id: directo.id, via: "company", comp: comp ?? null };
      // El cliente nombrado dentro del trato: la venta de la madre que factura la hija.
      const completo = norm(dealName);
      for (const [k, arr] of porNombre) {
        if (completo.includes(k)) return { id: arr[0]!.id, via: "nombre", comp: comp ?? null };
      }
      return { id: null, via: null, comp: comp ?? null };
    };

    // ── 4. Guarda de sanidad ──────────────────────────────────────────────────
    // Las CONOCIDAS del rango: solo para la guarda y para saber cuáles dejaron de venir.
    const conocidas = await prisma.ventaGanada.findMany({
      where: { fechaCierre: { gte: new Date(`${opciones.desde}T00:00:00.000Z`), lte: new Date(`${opciones.hasta}T00:00:00.000Z`) } },
      select: { id: true, hubspotDealId: true, nombre: true, monto: true, fechaCierre: true, estado: true, clientId: true },
    });
    // ⚠ Y las que ya existen de los tratos que ACABAN de llegar, sin filtrar por fecha.
    // Sin esto, un trato al que le editaron la fecha de cierre y cruzó de año no se
    // encuentra entre las del rango, el sync intenta crearlo de nuevo y choca contra el
    // índice único de `hubspotDealId` — la corrida entera se cae. No es hipotético: ya se
    // midió que a cuatro tratos de 2026 les movieron el cierre mientras estaban abiertos.
    const yaExistentes = await prisma.ventaGanada.findMany({
      where: { hubspotDealId: { in: crudos.map((d) => d.id) } },
      select: { id: true, hubspotDealId: true, nombre: true, monto: true, fechaCierre: true, estado: true, clientId: true },
    });
    const parcial = conocidas.length > 0 && crudos.length < conocidas.length * 0.5;
    if (parcial) {
      res.errores.push(
        `La búsqueda trajo ${crudos.length} tratos contra ${conocidas.length} conocidos (menos del 50%): no se reclasifica nada.`,
      );
    }

    // ── 5. Upsert + bitácora ──────────────────────────────────────────────────
    const previas = new Map(yaExistentes.map((v) => [v.hubspotDealId, v]));
    for (const d of crudos) {
      const nombre = (d.p.dealname ?? "").trim() || `(trato ${d.id})`;
      const fecha = fechaOrNull(d.p.closedate);
      const monto = numOrNull(d.p.amount);
      // Sin FECHA no se puede espejar: sin ella la venta no cae en ningún año y el
      // reporte no sabría dónde ponerla. Sin MONTO sí se espeja, con el monto en null:
      // la venta existe, lo que falta es el número, y decirlo es mejor que esconderla.
      if (!fecha) {
        res.errores.push(`${nombre}: sin fecha de cierre legible — no se espeja.`);
        continue;
      }
      if (monto === null) res.sinMonto++;
      const cli = resolverCliente(d.id, nombre);
      const datos = {
        nombre,
        fechaCierre: soloDia(fecha),
        ganadaEn: fechaOrNull(d.p.hs_date_entered_closedwon),
        monto: monto === null ? null : new Prisma.Decimal(monto),
        moneda: (d.p.deal_currency_code ?? "USD").trim() || "USD",
        montoConvertidoHubspot:
          numOrNull(d.p.amount_in_home_currency) !== null
            ? new Prisma.Decimal(numOrNull(d.p.amount_in_home_currency)!)
            : null,
        pipelineId: d.p.pipeline ?? "",
        pipelineLabel: labelDePipeline(d.p.pipeline ?? ""),
        etapaId: d.p.dealstage ?? "",
        estado: "GANADA" as const,
        clientId: cli.id,
        clienteVia: cli.via,
        hubspotCompanyId: cli.comp,
        sospechaPrueba: huelaAPrueba(nombre),
        sincronizadoEn: now,
      };

      const previa = previas.get(d.id);
      if (!previa) {
        res.altas++;
        if (!opciones.dryRun) {
          const creada = await prisma.ventaGanada.create({ data: { hubspotDealId: d.id, ...datos } });
          // Entra al mapa apenas se crea: la búsqueda paginada de HubSpot puede devolver
          // el mismo trato dos veces si algo cambia entre páginas, y sin esto el segundo
          // pasaje intentaría crearlo de nuevo contra el índice único.
          previas.set(d.id, {
            id: creada.id,
            hubspotDealId: d.id,
            nombre,
            monto: datos.monto,
            fechaCierre: datos.fechaCierre,
            estado: "GANADA",
            clientId: cli.id,
          });
          await prisma.ventaGanadaCambio.create({
            data: { ventaId: creada.id, hubspotDealId: d.id, nombre, tipo: "ALTA", nuevo: String(monto ?? "(sin monto)") },
          });
        }
        continue;
      }

      // Qué se movió desde la última corrida. Es lo que hace que el vendido del año
      // deje de cambiar en silencio.
      const deltas: Array<{ tipo: "MONTO" | "FECHA_CIERRE" | "ESTADO" | "CLIENTE"; anterior: string; nuevo: string }> = [];
      const montoPrev = previa.monto === null ? null : Number(previa.monto);
      if (montoPrev !== monto) {
        deltas.push({ tipo: "MONTO", anterior: String(montoPrev ?? "(sin monto)"), nuevo: String(monto ?? "(sin monto)") });
      }
      const fechaPrev = previa.fechaCierre.toISOString().slice(0, 10);
      const fechaNueva = datos.fechaCierre.toISOString().slice(0, 10);
      if (fechaPrev !== fechaNueva) {
        deltas.push({ tipo: "FECHA_CIERRE", anterior: fechaPrev, nuevo: fechaNueva });
      }
      if (previa.estado !== "GANADA") {
        deltas.push({ tipo: "ESTADO", anterior: previa.estado, nuevo: "GANADA" });
      }
      if ((previa.clientId ?? "") !== (cli.id ?? "")) {
        deltas.push({ tipo: "CLIENTE", anterior: previa.clientId ?? "(ninguno)", nuevo: cli.id ?? "(ninguno)" });
      }

      if (deltas.length === 0) {
        res.sinCambio++;
        if (!opciones.dryRun) {
          await prisma.ventaGanada.update({ where: { id: previa.id }, data: { sincronizadoEn: now } });
        }
        continue;
      }
      res.actualizadas++;
      res.cambios += deltas.length;
      if (!opciones.dryRun) {
        await prisma.ventaGanada.update({ where: { id: previa.id }, data: datos });
        for (const x of deltas) {
          await prisma.ventaGanadaCambio.create({
            data: { ventaId: previa.id, hubspotDealId: d.id, nombre, tipo: x.tipo, anterior: x.anterior, nuevo: x.nuevo },
          });
        }
      }
    }

    // ── 6. Los que ya no volvieron ────────────────────────────────────────────
    // Segunda pasada: preguntar por los que conocíamos y no vinieron. Un trato puede
    // haberse reabierto, perdido, o desaparecido — y en los tres casos la fila se
    // MARCA, nunca se borra.
    let huboFalloAlReclasificar = false;
    if (!parcial) {
      const vistos = new Set(crudos.map((d) => d.id));
      const ausentes = conocidas.filter((v) => !vistos.has(v.hubspotDealId) && v.estado === "GANADA");
      for (let i = 0; i < ausentes.length; i += 100) {
        const lote = ausentes.slice(i, i + 100);
        const r = await hs.apiRequest({
          method: "POST",
          path: "/crm/v3/objects/deals/batch/read",
          body: { properties: ["dealstage", "dealname"], inputs: lote.map((v) => ({ id: v.hubspotDealId })) },
        });
        // ⚠ Un lote que falla NO significa "esos tratos ya no existen". Antes el catch
        // era `{ results: [] }`, así que un 429 o un 502 marcaba las 100 ventas del lote
        // como DESAPARECIDA —borrándolas del vendido del año— sin registrar un error.
        // Ahora el lote se saltea, se anota y la corrida queda parcial.
        if (!r.ok) {
          res.errores.push(`reclasificación lote ${i / 100 + 1}: HTTP ${r.status} — ${lote.length} venta(s) sin revisar`);
          huboFalloAlReclasificar = true;
          continue;
        }
        const data = (await r.json()) as {
          results?: Array<{ id: string; properties: Record<string, string | null> }>;
        };
        const vivos = new Map((data.results ?? []).map((x) => [x.id, x.properties]));
        for (const v of lote) {
          const p = vivos.get(v.hubspotDealId);
          const etapa = p?.dealstage ?? null;
          // ⚠ "No vino en la búsqueda" NO es "cambió de estado". El trato puede seguir
          // ganado y haberse caído del rango por su fecha, o por la consistencia eventual
          // del índice de búsqueda de HubSpot. Preguntarle a HubSpot en qué etapa está y
          // creerle a ESO es la única lectura honesta: si sigue en una etapa ganada, la
          // fila se queda como está. Marcarla REABIERTA decía lo contrario de la verdad.
          if (etapa && ETAPAS_GANADAS.includes(etapa)) continue;
          const nuevoEstado = !p
            ? ("DESAPARECIDA" as const)
            : etapa && ETAPAS_PERDIDAS.includes(etapa)
              ? ("PERDIDA" as const)
              : ("REABIERTA" as const);
          res.reclasificadas++;
          if (!opciones.dryRun) {
            await prisma.ventaGanada.update({ where: { id: v.id }, data: { estado: nuevoEstado, sincronizadoEn: now } });
            await prisma.ventaGanadaCambio.create({
              data: {
                ventaId: v.id,
                hubspotDealId: v.hubspotDealId,
                nombre: v.nombre,
                tipo: "ESTADO",
                anterior: "GANADA",
                nuevo: nuevoEstado,
              },
            });
          }
        }
      }
    }

    return { ...res, parcial: parcial || huboFalloAlReclasificar || undefined };
  } finally {
    if (!opciones.dryRun) await soltarLock();
  }
}
