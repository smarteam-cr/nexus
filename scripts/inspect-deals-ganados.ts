/**
 * scripts/inspect-deals-ganados.ts  (SOLO LECTURA)
 *
 * Trae los deals GANADOS del año desde HubSpot y los cruza contra cobranza, para
 * contestar dos preguntas que hoy no contesta nadie:
 *   1. ¿Cuánto se VENDIÓ este año? (hoy el reporte solo sabe lo facturado)
 *   2. ¿Qué ventas ganadas NO llegaron a cobranza? — o sea, dónde está incompleto
 *      el módulo de cobranza.
 *
 * ⚠ DOS TRAMPAS DEL DATO, medidas y confirmadas:
 *   · El monto crudo (`amount`) está en la MONEDA DEL DEAL. Un solo deal en colones
 *     (JUDESUR, ₡3.060.416) infla el total del año a $3,4 MILLONES si se suma crudo.
 *     Se usa `amount_in_home_currency`, que HubSpot ya convierte: son $6.721.
 *   · El pipeline "HubSpot Shared Selling" es REGISTRO DE OPORTUNIDAD con HubSpot,
 *     no facturación de Smarteam. Va contado APARTE.
 *
 * Uso: npx tsx scripts/inspect-deals-ganados.ts [--anio=2026]
 */
import "dotenv/config";
import { getSystemHubspotClient } from "../lib/hubspot/client";
import { createScriptDb } from "./lib/db";

const ANIO = process.argv.find((a) => a.startsWith("--anio="))?.split("=")[1] ?? "2026";
const GANADAS = ["1373937254", "closedwon", "deal_registration_closed_won"];

/**
 * Deals de PRUEBA, que no son ventas. Se excluyen del total y se listan aparte para
 * que la exclusión sea visible: un filtro silencioso es la forma más facil de perder
 * una venta real que por casualidad se llamaba "test".
 */
const ES_PRUEBA = /(prueba|pruebas|test|testing|demo interno)/i;
const PIPE: Record<string, string> = {
  default: "Ventas",
  "907198211": "Insider One",
  "81ee3345-1b0f-42aa-9e78-580614546602": "Shared Selling",
};
const m = (n: number) => "$" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const { prisma, close } = createScriptDb();

(async () => {
  const hs = await getSystemHubspotClient();

  // ── 1. Los deals ganados del año ──────────────────────────────────────────
  let after: string | undefined;
  const deals: Array<{ id: string; p: Record<string, string | null> }> = [];
  do {
    const res = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/deals/search",
      body: {
        filterGroups: [{ filters: [
          { propertyName: "dealstage", operator: "IN", values: GANADAS },
          { propertyName: "closedate", operator: "BETWEEN", value: `${ANIO}-01-01`, highValue: `${ANIO}-12-31` }] }],
        properties: ["dealname", "amount", "amount_in_home_currency", "deal_currency_code", "closedate", "pipeline"],
        limit: 100, after,
      },
    });
    if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { results?: Array<{ id: string; properties: Record<string, string | null> }>; paging?: { next?: { after?: string } } };
    for (const d of data.results ?? []) deals.push({ id: d.id, p: d.properties });
    after = data.paging?.next?.after;
  } while (after);

  // ── 2. La empresa de cada deal ────────────────────────────────────────────
  const empresaDe = new Map<string, string>();
  for (let i = 0; i < deals.length; i += 100) {
    const lote = deals.slice(i, i + 100);
    const res = await hs.apiRequest({
      method: "POST", path: "/crm/v4/associations/deals/companies/batch/read",
      body: { inputs: lote.map((d) => ({ id: d.id })) },
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string }> }> };
    for (const r of data.results ?? []) if (r.to?.[0]) empresaDe.set(r.from.id, String(r.to[0].toObjectId));
  }

  // ── 3. Lo que cobranza tiene ──────────────────────────────────────────────
  // ⚠ El cruce por `hubspotCompanyId` SOLO no alcanza, y se midió: el deal de AMVAC
  // apunta a una company distinta de la que Nexus tiene guardada, así que el cliente
  // —que tiene 5 cobros— salía como "sin cliente". Hay empresas DUPLICADAS en HubSpot
  // y clientes duplicados en Nexus (BLUESAT está dos veces). Por eso el fallback por
  // nombre normalizado: sin él, la lista de "huecos" se llena de falsos positivos y
  // deja de ser accionable.
  const todos = await prisma.client.findMany({
    select: { id: true, name: true, hubspotCompanyId: true,
      cuentaFinanciera: { select: { id: true, servicios: { select: { cobros: { select: { id: true } } } } } } },
  });
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const porCompany = new Map(todos.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, c]));
  const porNombre = new Map<string, typeof todos>();
  for (const c of todos) {
    const k = norm(c.name);
    porNombre.set(k, [...(porNombre.get(k) ?? []), c]);
  }
  /**
   * De qué cliente es un trato. TRES vías, de la más firme a la más blanda:
   *
   *   1. company  — la empresa que HubSpot tiene asociada al trato. Es la buena.
   *   2. cabeza   — el nombre del trato ARRANCA con el cliente ("AMVAC | CRECIMIENTO WEB").
   *   3. mención  — el cliente aparece EN MEDIO del nombre del trato.
   *
   * ⚠ La tercera existe porque las ventas se registran en la empresa MADRE y la
   * facturación cuelga de la hija, y esa relación no está en ningún sistema — ni en
   * HubSpot (no hay asociación madre/hija en este portal) ni en Nexus. Solo vive en el
   * nombre del trato. Casos medidos: "Grupo Inve - AnalisaLab - Proyecto de
   * implementación" ($9.500) es la venta del servicio que cuelga del cliente
   * "Analisalab"; Corrugando factura contra una venta vieja de ACCCSA.
   * Sin esta vía, 24 servicios ($96.577, el 42% del año facturado) parecían no tener
   * NINGUNA venta detrás — y era el cruce el que no la encontraba, no la venta la que
   * faltaba.
   *
   * Umbral de 6 caracteres: por debajo, un nombre corto pega en cualquier lado.
   */
  const resolver = (compId: string | undefined, dealName: string) => {
    const directo = compId ? porCompany.get(compId) : undefined;
    if (directo) return { cli: directo, via: "company" as const };
    const elMejor = (arr: typeof todos) =>
      arr.find((c) => c.cuentaFinanciera?.servicios.some((s) => s.cobros.length > 0)) ?? arr[0];

    const cabeza = norm(dealName.split(/[|\-–]/)[0] ?? "");
    if (cabeza.length >= 4) {
      for (const [k, arr] of porNombre) {
        if (k.startsWith(cabeza) || cabeza.startsWith(k)) return { cli: elMejor(arr), via: "cabeza" as const };
      }
    }
    // El cliente nombrado en medio del trato: la venta de la madre que factura la hija.
    const completo = norm(dealName);
    for (const [k, arr] of porNombre) {
      if (k.length >= 6 && completo.includes(k)) return { cli: elMejor(arr), via: "mencion" as const };
    }
    return { cli: undefined, via: "nada" as const };
  };

  const totPipe = new Map<string, { n: number; monto: number; sinMonto: number }>();
  const totMes = new Map<string, number>();
  type Caso = { deal: string; monto: number; cliente: string | null };
  const sinCliente: Caso[] = [];      // ni existe el cliente
  const sinCuenta: Caso[] = [];        // existe, pero nadie lo configuró en cobranza
  const sinCobros: Caso[] = [];        // tiene cuenta, pero cero cobros
  const duplicado: Caso[] = [];        // el deal apunta a otra company: dato sucio en HubSpot
  const conCobranza: Caso[] = [];
  const pruebas: Caso[] = [];        // deals de test: fuera del total, pero a la vista
  const nombreDeal = (d: { id: string; p: Record<string, string | null> }) => d.p.dealname ?? d.id;

  for (const d of deals) {
    const pl = PIPE[d.p.pipeline ?? ""] ?? d.p.pipeline ?? "?";
    const monto = Number(d.p.amount_in_home_currency ?? d.p.amount ?? 0) || 0;
    const g = totPipe.get(pl) ?? { n: 0, monto: 0, sinMonto: 0 };
    g.n++; g.monto += monto; if (!monto) g.sinMonto++;
    totPipe.set(pl, g);
    if (pl !== "Ventas") continue;
    if (ES_PRUEBA.test(nombreDeal(d))) { pruebas.push({ deal: nombreDeal(d), monto, cliente: null }); continue; }
    totMes.set((d.p.closedate ?? "").slice(0, 7), (totMes.get((d.p.closedate ?? "").slice(0, 7)) ?? 0) + monto);

    const nombre = d.p.dealname ?? d.id;
    const { cli, via } = resolver(empresaDe.get(d.id), nombre);
    const caso: Caso = { deal: nombre, monto, cliente: cli?.name ?? null };
    if (!cli) { sinCliente.push(caso); continue; }
    const tieneCobros = cli.cuentaFinanciera?.servicios.some((s) => s.cobros.length > 0) ?? false;
    // Que el trato se haya resuelto por NOMBRE y no por empresa es en sí un hallazgo:
    // significa que HubSpot tiene la venta colgada de otra empresa que la que Nexus
    // factura (empresa duplicada, o la madre del grupo).
    if (tieneCobros) { (via === "company" ? conCobranza : duplicado).push(caso); continue; }
    (cli.cuentaFinanciera ? sinCobros : sinCuenta).push(caso);
  }

  const suma = (a: Caso[]) => a.reduce((s, x) => s + x.monto, 0);
  const lista = (t: string, a: Caso[]) => {
    if (!a.length) return;
    console.log(`
  ${t}: ${a.length} deals · ${m(suma(a))}`);
    for (const x of [...a].sort((p, q) => q.monto - p.monto)) {
      console.log(`    ${m(x.monto).padStart(13)}  ${(x.cliente ?? "—").padEnd(28).slice(0, 28)}  ${x.deal.slice(0, 46)}`);
    }
  };

  console.log(`
╔══ DEALS GANADOS ${ANIO} ══╗  ${deals.length} deals
`);
  for (const [k, v] of [...totPipe.entries()].sort((a, b) => b[1].monto - a[1].monto)) {
    console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(3)} deals  ${m(v.monto).padStart(15)}${v.sinMonto ? `  (${v.sinMonto} sin monto)` : ""}`);
  }
  console.log(`
  ⚠ "Shared Selling" es registro de oportunidad con HubSpot, NO facturación de`);
  console.log(`     Smarteam. Lo VENDIDO por Smarteam es el pipeline "Ventas".`);
  console.log(`
  LO VENDIDO POR MES (pipeline Ventas):`);
  for (const k of [...totMes.keys()].sort()) console.log(`    ${k}  ${m(totMes.get(k)!).padStart(14)}`);

  console.log(`
╔══ CRUCE CONTRA COBRANZA (solo pipeline Ventas) ══╗`);
  console.log(`
  ✓ Con cobros cargados: ${conCobranza.length} deals · ${m(suma(conCobranza))}`);
  lista("⚠ HUECO — cliente SIN cuenta de cobranza", sinCuenta);
  lista("⚠ HUECO — con cuenta pero SIN cobros", sinCobros);
  lista("⚠ HUECO — el cliente ni existe en Nexus", sinCliente);
  lista("ⓘ DATO SUCIO — el deal apunta a otra empresa de HubSpot (el cliente SÍ cobra)", duplicado);
  const huecos = suma(sinCuenta) + suma(sinCobros) + suma(sinCliente);
  lista("ⓘ EXCLUIDOS — deals de prueba, no son ventas", pruebas);
  const vendido = (totPipe.get("Ventas")?.monto ?? 0) - suma(pruebas);
  console.log(`
  VENDIDO REAL (sin pruebas): ${m(vendido)}`);
  console.log(`  TOTAL EN HUECOS: ${m(huecos)}  ·  ${Math.round((huecos / (vendido || 1)) * 100)}% de lo vendido`);
  await close();
})().catch(async (e) => { console.error("ERR", e.message); await close(); process.exitCode = 1; });
