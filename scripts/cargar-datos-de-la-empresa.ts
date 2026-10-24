/**
 * scripts/cargar-datos-de-la-empresa.ts — la carga inicial de los datos de la empresa (R1, etapa 2; 2026-10-24).
 *
 * Por cada empresa de Nexus, lee lo que ya existe y lo pasa por la regla de quién manda
 * (lib/clients/datos-de-la-empresa.ts), con su fuente:
 *   - de su empresa en HubSpot (solo lectura): empleados, facturación, país, sitio, la industria de HubSpot y la de
 *     Smarteam, y el TAM si alguien lo escribió allá (`tam__potencial`, hoy vacío en todas);
 *   - de su preventa viva: la edición de la escala, el perfil de negocio y el país.
 * Con eso, el TAM estimado v1 se calcula solo en las que tienen empleados.
 *
 * SIMULACRO por defecto: cada empresa corre en su transacción y se deshace al final, así que el informe dice
 * EXACTAMENTE lo que haría el `--apply` (cuántos datos se llenan, cuántos quedan como propuesta y cuántas cuentas
 * cambian de potencial — la CSL tiene que saberlo antes). No escribe en HubSpot.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/cargar-datos-de-la-empresa.ts                       # simulacro
 *   npx tsx scripts/cargar-datos-de-la-empresa.ts --solo <clientId>     # una empresa
 *   npx tsx scripts/cargar-datos-de-la-empresa.ts --recalcular-tam      # solo el TAM, con lo que ya hay (p. ej. si
 *                                                                       # cambian los precios de lib/clients/tam-v1.ts)
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cargar-datos-de-la-empresa.ts --apply
 * Antes: scripts/sql/2026-10-25-datos-de-la-empresa.sql aplicado y el deploy hecho.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { PROPIEDADES_QUE_SE_LEEN } from "@/lib/hubspot/empresa";
import { ErrorDeDato, proponerDatoEnTx, recalcularTamEnTx, type ResultadoDelDato } from "@/lib/clients/datos-de-la-empresa-server";
import { proponerPotencial } from "@/lib/cs/clasificacion";
import { cargarCuentas, hoyEnCostaRica } from "@/lib/cs/cartera";
import type { ClaveDeDato, FuenteDeDato } from "@/lib/clients/datos-de-la-empresa";

const APPLY = resolverApply({ tablas: ["Client", "PropuestaDeDato"] });
const SOLO_TAM = process.argv.includes("--recalcular-tam");
const SOLO = (() => {
  const i = process.argv.indexOf("--solo");
  if (i < 0) return null;
  const id = process.argv[i + 1];
  // Sin un id después, `--solo` no puede querer decir «todas»: se corta antes de tocar nada.
  if (!id || id.startsWith("--")) {
    console.error("⛔ --solo necesita el id de una empresa (npx tsx scripts/cargar-datos-de-la-empresa.ts --solo <clientId>).");
    process.exit(1);
  }
  return id;
})();

class Simulacro extends Error {
  constructor(readonly resultado: ResultadoDelDato[]) {
    super("simulacro");
  }
}

/** De la propiedad de HubSpot al dato de Nexus. */
const DE_HUBSPOT: Readonly<Record<string, ClaveDeDato>> = {
  numberofemployees: "empleados",
  annualrevenue: "facturacionAnualUsd",
  country: "pais",
  domain: "sitioWeb",
  industry: "industry",
  industria__smarteam_: "industriaSmarteam",
  tam__potencial: "tamUsd",
};

async function leerDeHubspot(ids: string[]): Promise<Map<string, Record<string, string | null>>> {
  const out = new Map<string, Record<string, string | null>>();
  if (ids.length === 0) return out;
  const hs = await getSystemHubspotClient();
  const props = [...new Set([...PROPIEDADES_QUE_SE_LEEN, "tam__potencial"])];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/companies/batch/read",
      body: { properties: props, inputs: ids.slice(i, i + 100).map((id) => ({ id })) },
    });
    if (!r.ok) throw new Error(`HubSpot respondió ${r.status} al leer las empresas: ${(await r.text()).slice(0, 300)}`);
    const data = (await r.json()) as { results: { id: string; properties: Record<string, string | null> }[] };
    for (const c of data.results) out.set(c.id, c.properties);
  }
  return out;
}


async function main() {
  console.log(APPLY ? "── APPLY: escribe en la base ──" : "── SIMULACRO: no escribe nada ──");
  const clientes = await prisma.client.findMany({
    where: SOLO ? { id: SOLO } : {},
    select: { id: true, name: true, kind: true, hubspotCompanyId: true, tamUsd: true },
    orderBy: { name: "asc" },
  });
  const deHubspot = await leerDeHubspot(clientes.map((c) => c.hubspotCompanyId).filter((x): x is string => !!x));
  const preventas = await prisma.exploracionDeVenta.findMany({
    where: { clientId: { in: clientes.map((c) => c.id) }, projectId: null, archivadaEn: null },
    orderBy: { updatedAt: "desc" },
    select: { clientId: true, edicion: true, perfilCierre: true, perfilDespues: true, contenido: true },
  });
  /* El potencial que la CSL ve HOY en la cartera, con la MISMA regla (`proponerPotencial`): sin TAM, la cartera ya lo
     estima con Partner. Solo los clientes de CS: un prospecto no está en la cartera. */
  const hoy = hoyEnCostaRica();
  const cuentaDe = new Map((await cargarCuentas(null, { incluirSinServicio: true })).map((c) => [c.clientId, c]));
  const preventaDe = new Map<string, (typeof preventas)[number]>();
  for (const p of preventas) if (!preventaDe.has(p.clientId)) preventaDe.set(p.clientId, p);

  const cuenta = { aplicados: 0, propuestos: 0, igual: 0, errores: 0, conTam: 0 };
  const porDato = new Map<string, { aplicados: number; propuestos: number }>();
  const cambiosDePotencial: string[] = [];

  for (const c of clientes) {
    const pedidos: { clave: ClaveDeDato; valor: unknown; fuente: FuenteDeDato; cita: string }[] = [];
    const hs = c.hubspotCompanyId ? deHubspot.get(c.hubspotCompanyId) : undefined;
    if (hs) {
      for (const [prop, clave] of Object.entries(DE_HUBSPOT)) {
        const v = hs[prop];
        if (v !== null && v !== undefined && String(v).trim() !== "") pedidos.push({ clave, valor: v, fuente: "hubspot", cita: `HubSpot · ${prop}` });
      }
    }
    const p = preventaDe.get(c.id);
    if (p) {
      if (p.edicion) pedidos.push({ clave: "edicionEscala", valor: p.edicion, fuente: "preventa", cita: "La edición elegida en la preventa" });
      if (p.perfilCierre) pedidos.push({ clave: "perfilCierre", valor: p.perfilCierre, fuente: "preventa", cita: "El perfil de la preventa" });
      if (p.perfilDespues) pedidos.push({ clave: "perfilDespues", valor: p.perfilDespues, fuente: "preventa", cita: "El perfil de la preventa" });
      const medicion = (p.contenido as { medicion?: { pais?: string } } | null)?.medicion;
      if (medicion?.pais) pedidos.push({ clave: "pais", valor: medicion.pais, fuente: "preventa", cita: "El país de la preventa" });
    }
    if (pedidos.length === 0 && !SOLO_TAM) continue;

    let resultados: ResultadoDelDato[] = [];
    let tamDespues: number | null = c.tamUsd === null ? null : Number(c.tamUsd);
    let tamFuenteDespues: string | null = null;
    try {
      await prisma.$transaction(
        async (tx) => {
          const todos: ResultadoDelDato[] = [];
          if (SOLO_TAM) todos.push(...(await recalcularTamEnTx(tx, c.id)));
          for (const ped of SOLO_TAM ? [] : pedidos) {
            try {
              todos.push(...(await proponerDatoEnTx(tx, { clientId: c.id, ...ped })));
            } catch (e) {
              // Un valor que el catálogo no acepta (una industria de HubSpot vieja, un número raro) se salta y se cuenta.
              // Se lanza antes de escribir nada, así que la transacción sigue sana.
              if (e instanceof ErrorDeDato) {
                cuenta.errores++;
                console.warn(`  · ${c.name}: ${ped.clave} = «${String(ped.valor)}» no se cargó (${e.message})`);
                continue;
              }
              throw e;
            }
          }
          const fila = await tx.client.findUnique({ where: { id: c.id }, select: { tamUsd: true, tamFuente: true } });
          tamDespues = fila?.tamUsd === null || fila?.tamUsd === undefined ? null : Number(fila.tamUsd);
          tamFuenteDespues = fila?.tamFuente ?? null;
          if (!APPLY) throw new Simulacro(todos);
          resultados = todos;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
    } catch (e) {
      if (!(e instanceof Simulacro)) throw e;
      resultados = e.resultado;
    }

    // Un dato se cuenta una vez por empresa (el TAM se recalcula con cada dato que lee): si se llenó alguna vez, cuenta
    // como lleno; si no, como propuesta; si no, como que ya estaba.
    const PESO = { aplicar: 3, proponer: 2, nada: 1 } as const;
    const ultimo = new Map<string, keyof typeof PESO>();
    for (const r of resultados) {
      const antes = ultimo.get(r.clave);
      if (!antes || PESO[r.veredicto.accion] > PESO[antes]) ultimo.set(r.clave, r.veredicto.accion);
    }
    for (const [clave, accion] of ultimo) {
      const d = porDato.get(clave) ?? { aplicados: 0, propuestos: 0 };
      if (accion === "aplicar") {
        cuenta.aplicados++;
        d.aplicados++;
      } else if (accion === "proponer") {
        cuenta.propuestos++;
        d.propuestos++;
      } else cuenta.igual++;
      porDato.set(clave, d);
    }
    if (tamDespues !== null) cuenta.conTam++;
    const enLaCartera = cuentaDe.get(c.id);
    if (enLaCartera) {
      const antes = proponerPotencial(enLaCartera, hoy);
      const despues = proponerPotencial({ ...enLaCartera, tamUsd: tamDespues, tamFuente: tamFuenteDespues }, hoy);
      if (antes.valor !== despues.valor) cambiosDePotencial.push(`${c.name}: ${antes.valor} → ${despues.valor} · ${despues.razon}`);
    }
  }

  console.log(`\nEmpresas: ${clientes.length} · con empresa de HubSpot leída: ${deHubspot.size} · con preventa viva: ${preventaDe.size}`);
  console.log(`Datos: ${cuenta.aplicados} se llenan · ${cuenta.propuestos} quedan como propuesta · ${cuenta.igual} ya estaban · ${cuenta.errores} con un valor que no se acepta`);
  for (const [clave, d] of [...porDato].sort()) console.log(`  ${clave.padEnd(22)} ${String(d.aplicados).padStart(4)} se llenan · ${d.propuestos} propuestas`);
  console.log(`\nCon TAM estimado v1 después: ${cuenta.conTam}`);
  console.log(`Cambian de potencial (lo que ve la CSL en la cartera): ${cambiosDePotencial.length}`);
  for (const l of cambiosDePotencial) console.log(`  ${l}`);
  if (!APPLY) console.log("\nSimulacro: nada se escribió. Con --apply (y ALLOW_PROD_WRITE=1) se escribe esto mismo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
