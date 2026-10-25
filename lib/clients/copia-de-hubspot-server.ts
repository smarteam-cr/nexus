/**
 * lib/clients/copia-de-hubspot-server.ts — la copia de cada hora de la empresa de HubSpot a Nexus (R2, 2026-10-25).
 * SERVIDOR.
 *
 * Lee HubSpot y, con `EMPRESA_HUBSPOT_ESCRITURA=1`, escribe allá lo que la copia recalculó en Nexus (el TAM, cuando
 * cambiaron los empleados): la misma escritura de cada decisión (escritura-en-hubspot-server.ts). Con esa bandera
 * apagada, solo lee.
 *
 * Las empresas de Nexus con empresa de HubSpot son unas 200: se leen enteras de a 100 (`batch/read`, dos pedidos por el
 * transporte único) y se procesan solo las que cambiaron allá desde la corrida anterior (`hs_lastmodifieddate`, con una
 * hora de solape). Cada valor pasa por el motor de los datos (`proponerDatoEnTx`, fuente `hubspot`) en la transacción
 * de su empresa: se aplica o queda como propuesta según quién manda. Los filtros de eco y de «ya dicho» viven en
 * copia-de-hubspot.ts (puro).
 *
 * Lo corre el job `empresa-copia-de-hubspot` (lib/jobs/defs.ts) cada hora de 6:00 a 20:00 CR, con la bandera
 * `EMPRESA_HUBSPOT_COPIA=1`; y a mano, scripts/copiar-empresas-de-hubspot.ts (simulacro por defecto). Un candado en la
 * base: una corrida a la vez entre el servidor y las dos PCs.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROPIEDADES_QUE_SE_LEEN } from "@/lib/hubspot/empresa";
import { CLAVES_DE_DATO, type ClaveDeDato } from "./datos-de-la-empresa";
import { ErrorDeDato, proponerDatoEnTx, valorDeLaFila, type ResultadoDelDato } from "./datos-de-la-empresa-server";
import { cambioDesde, huellaDeValor, pedidosDeLaCopia } from "./copia-de-hubspot";
import { escribirEnHubspot, leerEmpresasDeHubspot } from "./escritura-en-hubspot-server";

const LOCK_KEY = "empresa-copia-de-hubspot-lock";
const CURSOR_KEY = "empresa-copia-de-hubspot-cursor";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export interface ResultadoDeLaCopiaDeEmpresas {
  locked?: boolean;
  empresas: number;
  cambiaron: number;
  aplicados: number;
  propuestas: number;
  /** Por empresa, lo que haría (para el simulacro). */
  detalle: { clientId: string; nombre: string; aplicados: string[]; propuestas: string[] }[];
  errores: string[];
}

async function tomarLock(now: Date): Promise<boolean> {
  await prisma.cronJobState.upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } }).catch((e) => {
    if ((e as { code?: string })?.code !== "P2002") throw e;
  });
  const claimed = await prisma.cronJobState.updateMany({
    where: { id: LOCK_KEY, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }] },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}

async function soltarLock(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } }).catch(() => {});
}

class Simulacro extends Error {}

/**
 * Trae lo que cambió en HubSpot. Con `apply: false` corre igual cada empresa en su transacción y la deshace: el
 * resultado dice exactamente lo que haría. El cursor solo avanza con `apply`.
 */
export async function copiarEmpresasDeHubspot(o: { apply: boolean; ahora?: Date; soloClientId?: string; todas?: boolean }): Promise<ResultadoDeLaCopiaDeEmpresas> {
  const ahora = o.ahora ?? new Date();
  const out: ResultadoDeLaCopiaDeEmpresas = { empresas: 0, cambiaron: 0, aplicados: 0, propuestas: 0, detalle: [], errores: [] };
  // El simulacro no toma el candado: tomarlo es escribir en la base, y el simulacro no escribe nada.
  if (o.apply && !(await tomarLock(ahora))) return { ...out, locked: true };
  try {
    const cursor = await prisma.cronJobState.findUnique({ where: { id: CURSOR_KEY }, select: { lastRunAt: true } });
    const desdeMs = o.todas || o.soloClientId ? null : (cursor?.lastRunAt?.getTime() ?? null);
    const empresas = await prisma.client.findMany({
      where: { hubspotCompanyId: { not: null }, ...(o.soloClientId ? { id: o.soloClientId } : {}) },
      select: { id: true, name: true, hubspotCompanyId: true },
    });
    out.empresas = empresas.length;
    const enHubspot = await leerEmpresasDeHubspot(
      empresas.map((e) => e.hubspotCompanyId!),
      [...PROPIEDADES_QUE_SE_LEEN, "hs_lastmodifieddate"],
    );

    for (const e of empresas) {
      const props = enHubspot.get(e.hubspotCompanyId!);
      if (!props) {
        // No volvió por su id: se fusionó en HubSpot (vuelve con otro) o se borró. Sus cambios no entran: se dice.
        out.errores.push(`${e.name}: su empresa ${e.hubspotCompanyId} no volvió de HubSpot (¿fusionada o borrada?): revisa la ficha`);
        continue;
      }
      if (!cambioDesde(props.hs_lastmodifieddate, desdeMs)) continue;
      out.cambiaron++;
      const { hs_lastmodifieddate: _m, ...propiedades } = props;
      void _m;
      const filtros = await filtrosDeLaEmpresa(e.id);
      const pedidos = pedidosDeLaCopia(propiedades, filtros);
      if (!pedidos.length) continue;
      const hechos: ResultadoDelDato[] = [];
      try {
        await prisma.$transaction(async (tx) => {
          for (const p of pedidos) {
            try {
              hechos.push(...(await proponerDatoEnTx(tx, { clientId: e.id, clave: p.clave, valor: p.valor, fuente: "hubspot", cita: p.cita, ahora })));
            } catch (err) {
              // Un valor que el catálogo no acepta (un número fuera de rango) se salta; los demás siguen.
              if (!(err instanceof ErrorDeDato)) throw err;
              out.errores.push(`${e.name}: ${err.message}`);
            }
          }
          if (!o.apply) throw new Simulacro();
        });
      } catch (err) {
        if (!(err instanceof Simulacro)) {
          out.errores.push(`${e.name}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      }
      // Lo que la copia recalculó en Nexus (el TAM, al cambiar los empleados) vuelve a HubSpot; lo que vino de allá no
      // (sería un eco: la regla del espejo lo descarta).
      if (o.apply && hechos.some((h) => h.veredicto.accion === "aplicar")) await escribirEnHubspot(e.id, hechos, { ahora });
      const directos = hechos.filter((h) => pedidos.some((p) => p.clave === h.clave));
      const aplicados = directos.filter((h) => h.veredicto.accion === "aplicar").map((h) => h.clave);
      const propuestas = directos.filter((h) => h.veredicto.accion === "proponer").map((h) => h.clave);
      out.aplicados += aplicados.length;
      out.propuestas += propuestas.length;
      if (aplicados.length || propuestas.length) out.detalle.push({ clientId: e.id, nombre: e.name, aplicados, propuestas });
    }
    if (o.apply && !o.soloClientId) {
      await prisma.cronJobState.upsert({ where: { id: CURSOR_KEY }, update: { lastRunAt: ahora }, create: { id: CURSOR_KEY, lastRunAt: ahora } });
    }
    return out;
  } finally {
    if (o.apply) await soltarLock();
  }
}

/** Lo que escribió Nexus en HubSpot (el eco) y lo que HubSpot ya propuso y espera o se descartó, de una empresa. */
async function filtrosDeLaEmpresa(clientId: string): Promise<{ escritoPorNexus: Set<string>; yaDicho: Set<string> }> {
  const [escritas, deHubspot, dichas] = await Promise.all([
    // Solo la ÚLTIMA escritura de cada dato, y solo si después no entró nada de HubSpot para ese dato: si allá lo
    // cambiaron (100 → 200) y lo volvieron al valor que escribió Nexus (→ 100), eso lo hizo alguien, no es un eco.
    prisma.propuestaDeDato.findMany({
      where: { clientId, hubspotEscritaAt: { not: null } },
      orderBy: { hubspotEscritaAt: "desc" },
      distinct: ["campo"],
      select: { campo: true, valor: true, valorDecidido: true, hubspotEscritaAt: true },
    }),
    prisma.propuestaDeDato.findMany({
      where: { clientId, fuente: "hubspot" },
      orderBy: { createdAt: "desc" },
      distinct: ["campo"],
      select: { campo: true, createdAt: true },
    }),
    prisma.propuestaDeDato.findMany({
      where: { clientId, fuente: "hubspot", estado: { in: ["pendiente", "descartada"] } },
      select: { campo: true, valor: true },
    }),
  ]);
  const huella = (campo: string, v: unknown) => {
    const valor = valorDeLaFila(v);
    return valor !== null && (CLAVES_DE_DATO as readonly string[]).includes(campo) ? huellaDeValor(campo as ClaveDeDato, valor) : null;
  };
  const ultimaDeHubspot = new Map(deHubspot.map((f) => [f.campo, f.createdAt]));
  const escritoPorNexus = new Set(
    escritas
      .filter((f) => !(ultimaDeHubspot.get(f.campo) && f.hubspotEscritaAt && ultimaDeHubspot.get(f.campo)! > f.hubspotEscritaAt))
      .map((f) => huella(f.campo, f.valorDecidido ?? f.valor))
      .filter((x): x is string => !!x),
  );
  const yaDicho = new Set(dichas.map((f) => huella(f.campo, f.valor)).filter((x): x is string => !!x));
  return { escritoPorNexus, yaDicho };
}
