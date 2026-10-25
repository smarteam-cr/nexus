/**
 * scripts/hubspot-escribir-datos-de-la-empresa.ts — la escritura masiva de los datos de la empresa en HubSpot (R2,
 * 2026-10-25).
 *
 * Lo que la escritura de cada decisión deja al día de ahí en adelante, este script lo pone al día para lo que ya estaba:
 * por cada empresa con empresa de HubSpot, compara lo que tiene Nexus con lo que tiene HubSpot y escribe lo que manda la
 * regla del espejo (lib/hubspot/empresa.ts › queSeEscribe): lo que calcula Nexus (el TAM, con su fuente y su fecha), lo
 * que decidió una persona, y lo estándar solo si allá está vacío. Lo que vino de HubSpot no vuelve. Y el siguiente caso
 * sugerido (`nexus_siguiente_caso`, R12: lo que le falta comprar), que calcula Nexus.
 *
 * SIMULACRO por defecto: dice, empresa por empresa, qué propiedad cambiaría y de qué a qué. `--limite` (5 por defecto,
 * como pide el plan para la primera vez: se mira en HubSpot y después va el resto). Con `--apply` escribe y deja en la
 * fila de cada decisión lo que había antes (`PropuestaDeDato.hubspotAnterior`): scripts/hubspot-empresa-volver-atras.ts
 * lo deshace.
 *
 * Antes: las propiedades creadas (scripts/hubspot-crear-propiedades-empresa.ts --apply).
 *
 * Uso (PowerShell):
 *   npx tsx scripts/hubspot-escribir-datos-de-la-empresa.ts                    # simulacro, 5 empresas
 *   npx tsx scripts/hubspot-escribir-datos-de-la-empresa.ts --limite 200       # simulacro de todas
 *   npx tsx scripts/hubspot-escribir-datos-de-la-empresa.ts --solo <clientId>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/hubspot-escribir-datos-de-la-empresa.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { CATALOGO_DE_DATOS, SELECT_DE_LOS_DATOS, type ClaveDeDato } from "@/lib/clients/datos-de-la-empresa";
import { datosDeLaFila, entradaDelTam, valorDeLaFila } from "@/lib/clients/datos-de-la-empresa-server";
import { loQueLeFalta, loQueYaPaga } from "@/lib/clients/lo-que-ya-paga";
import { calcularTamV1 } from "@/lib/clients/tam-v1";
import { loQueLeFaltaComprarDeLaEmpresa } from "@/lib/clients/lo-que-le-falta-comprar-server";
import { planDeEscritura, propiedadesALeer, type DatoParaEscribir } from "@/lib/clients/escritura-en-hubspot";
import { escribirPlan, leerEmpresasDeHubspot } from "@/lib/clients/escritura-en-hubspot-server";
import { escrituraHabilitada, valorDelSiguienteCaso } from "@/lib/hubspot/empresa";

const APPLY = resolverApply({ tablas: ["PropuestaDeDato"] });
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const LIMITE = Number(arg("--limite") ?? 5);
const SOLO = arg("--solo") ?? null;

const CLAVES: ClaveDeDato[] = CATALOGO_DE_DATOS.filter((d) => d.hubspot && d.hubspot.sentido !== "lee").map((d) => d.clave);

async function main() {
  if (!Number.isInteger(LIMITE) || LIMITE < 1) throw new Error("--limite tiene que ser un número entero mayor que 0.");
  if (!escrituraHabilitada()) console.log("ℹ EMPRESA_HUBSPOT_ESCRITURA está apagada: este script escribe igual (es a mano), pero las decisiones de la ficha no.");
  const empresas = await prisma.client.findMany({
    where: { hubspotCompanyId: { not: null }, kind: { in: ["CLIENTE", "PROSPECTO"] }, ...(SOLO ? { id: SOLO } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, hubspotCompanyId: true, ...SELECT_DE_LOS_DATOS },
  });
  const enHubspot = await leerEmpresasDeHubspot(
    empresas.map((e) => e.hubspotCompanyId!),
    propiedadesALeer(CLAVES, ["nexus_siguiente_caso"]),
  );

  let escritas = 0;
  let propiedades = 0;
  let conCambios = 0;
  for (const e of empresas) {
    // El lote cuenta las empresas con algo que escribir, no las que se miraron.
    if (conCambios >= LIMITE) break;
    const datos = datosDeLaFila(e as Record<string, unknown>);
    // Una empresa que no volvió por su id se fusionó en HubSpot (o se borró): no se escribe, que sería pisar a otra.
    const actual = enHubspot.get(e.hubspotCompanyId!);
    if (!actual) {
      console.log(`\n${e.name}: su empresa ${e.hubspotCompanyId} no volvió de HubSpot (¿fusionada o borrada?). No se escribe: revisa la ficha.`);
      continue;
    }
    // La fila de la decisión VIGENTE de cada dato (la más reciente que dejó el valor que hay hoy) guarda lo que había en
    // HubSpot: así la vuelta atrás encuentra lo que escribió este script.
    const decisiones = await prisma.propuestaDeDato.findMany({
      where: { clientId: e.id, campo: { in: CLAVES }, estado: { in: ["aplicada", "usada", "editada"] } },
      orderBy: [{ decididaAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, campo: true, valor: true, valorDecidido: true },
    });
    const filaDe = new Map<string, string>();
    for (const d of decisiones) {
      if (filaDe.has(d.campo)) continue;
      const k = d.campo as ClaveDeDato;
      if (valorDeLaFila(d.valorDecidido ?? d.valor) === datos[k]?.valor) filaDe.set(d.campo, d.id);
    }
    const paraEscribir: DatoParaEscribir[] = CLAVES.map((k) => ({ propuestaId: filaDe.get(k) ?? null, clave: k, ...datos[k] }));
    // El siguiente caso (R12), con lo que le falta: la misma cuenta que hace la ficha.
    const [snapshot, manuales] = await Promise.all([
      prisma.clientPartnerSnapshot.findUnique({ where: { clientId: e.id }, select: { properties: true, fetchedAt: true } }),
      prisma.licenciaCliente.findMany({ where: { clientId: e.id } }),
    ]);
    const hubs = loQueLeFalta(calcularTamV1(entradaDelTam(datos)), loQueYaPaga(snapshot, manuales));
    const siguiente = (await loQueLeFaltaComprarDeLaEmpresa(e.id, hubs)).siguiente;
    const extras = siguiente ? [{ propiedad: "nexus_siguiente_caso", valor: valorDelSiguienteCaso(siguiente.casoId) }] : [];
    const plan = planDeEscritura(paraEscribir, actual, extras);
    if (!plan.length) continue;
    conCambios++;
    console.log(`\n${e.name} (${e.id}, HubSpot ${e.hubspotCompanyId})`);
    for (const x of plan) console.log(`  ${x.propiedad}: «${x.anterior || "vacía"}» → «${x.valor}»${x.propuestaId ? "" : x.clave ? " (sin fila de decisión: el script de vuelta no lo deshace)" : " (propiedad de Nexus)"}`);
    propiedades += plan.length;
    if (!APPLY) continue;
    const r = await escribirPlan(e.hubspotCompanyId!, plan);
    console.log(`  → ${r.estado}${r.estado === "fallo" ? `: ${r.error}` : ""}`);
    if (r.estado === "escrita") escritas++;
  }
  console.log(`\n${APPLY ? `Escritas ${escritas} empresas` : `SIMULACRO de ${conCambios} empresas (--limite ${LIMITE})`} · ${propiedades} propiedades${APPLY ? "" : " cambiarían. Con --apply (y ALLOW_PROD_WRITE=1) se escriben"}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
