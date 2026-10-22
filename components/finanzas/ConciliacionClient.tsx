"use client";

/**
 * components/finanzas/ConciliacionClient.tsx
 *
 * Finanzas › Conciliación (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md): TODO lo que no cuadra entre Nexus, Odoo
 * y Mercury en una sola lista, con Emparejar y el libro de Alex al lado. Antes eran dos páginas escondidas (Cobranza ›
 * Odoo y Cobranza › Mercury) con su propia lista cada una.
 *
 * La trabaja quien registra: su lista arranca filtrada en lo que se arregla registrando. Las preguntas de negocio
 * («¿entró esta plata?») quedan para quien supervisa, que las ve en Supervisión y acá con el filtro de decisiones.
 *
 * Las piezas son las de Odoo y Mercury, sin copias: la lista es `DiferenciasOdoo` con las dos fuentes juntas, y Emparejar
 * son `EmparejadoOdoo` y `EmparejadoMercury`. ⛔ Nada de esto escribe en Odoo ni en Mercury.
 *
 * Una sola fila de pestañas (prueba 97, 2026-10-18): Odoo, Mercury e Integraciones ya no son una fila de píldoras arriba
 * del título. Son enlaces al lado de la fecha de cada copia, y esas páginas vuelven acá con «← Conciliación».
 */
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button, PageHeader, Segmentado, Tabs } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { FuenteActualizada } from "@/lib/finanzas/actualizar-tablero";
import type { VistaFinanzas } from "@/lib/finanzas/vista";
import DiferenciasOdoo from "@/components/cobranza/DiferenciasOdoo";
import EmparejadoOdoo from "@/components/cobranza/EmparejadoOdoo";
import EmparejadoMercury from "@/components/cobranza/EmparejadoMercury";
import GastosContraMercury, { pendientesDeGastos } from "@/components/finanzas/GastosContraMercury";
import GastosFinancieros from "@/components/finanzas/GastosFinancieros";
import LoPagado from "@/components/cobranza/LoPagado";
import type { GastosContraMercury as DatosDeGastosMercury } from "@/lib/finanzas/gastos-mercury";

type Pestana = "no-cuadra" | "pagado" | "emparejar" | "libro" | "gastos";
type Sistema = "odoo" | "mercury";

export default function ConciliacionClient({
  vista,
  supervisor,
  puedeEditar,
  copias,
  conteos,
  soloDecisiones = false,
  gastosMercury = null,
  abrirEn = "no-cuadra",
  puedeEditarGastos = false,
  conIntegraciones = false,
}: {
  vista: VistaFinanzas;
  /** El nombre de pila de quien supervisa (lib/finanzas/vista-server.ts). */
  supervisor: string;
  /** `cobranza.write`: marcar «Está bien así» y deshacerlo. */
  puedeEditar: boolean;
  /** De cuándo es la última copia buena de cada sistema, ya en hora de Costa Rica. */
  copias: { odoo: string | null; mercury: string | null };
  /** Con qué número abre cada pestaña. Después se mueven solos. */
  conteos: { noCuadra: number; porEmparejarOdoo: number; porEmparejarMercury: number };
  /** Se llegó desde Supervisión › «Decidir»: la lista arranca con las decisiones. */
  soloDecisiones?: boolean;
  /** Los gastos contra Mercury (2026-10-06). null = quien mira no tiene `gastos.read`: la pestaña no aparece. */
  gastosMercury?: DatosDeGastosMercury | null;
  /** La pestaña con que abre: Pendientes › «Cobrar lo pagado» llega con ?ver=pagados. */
  abrirEn?: Pestana;
  /** `gastos.write`: decidir los gastos financieros (2026-10-17). */
  puedeEditarGastos?: boolean;
  /** Integraciones es solo de Super Admin: a los demás no se les ofrece el enlace. */
  conIntegraciones?: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Pestana>(abrirEn);
  const [sistema, setSistema] = useState<Sistema>(conteos.porEmparejarOdoo > 0 ? "odoo" : "mercury");
  const [noCuadra, setNoCuadra] = useState(conteos.noCuadra);
  const [porEmparejar, setPorEmparejar] = useState({ odoo: conteos.porEmparejarOdoo, mercury: conteos.porEmparejarMercury });
  const [recarga, setRecarga] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  /* Un doble clic rápido llega antes de que el botón se dibuje deshabilitado: el ref lo corta en el acto. */
  const enCurso = useRef(false);

  /* Copia Odoo y Mercury y después cobra lo pagado (2026-10-21): el aviso dice cuántas facturas cambiaron y cuántas
     cuotas quedaron cobradas, o el error en palabras. «Lo pagado» y «Lo que no cuadra» se vuelven a leer. */
  const actualizar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setActualizando(true);
    try {
      const r = await fetchJson<{ fuentes: FuenteActualizada[]; todoBien: boolean; texto: string }>("/api/finanzas/actualizar", {
        method: "POST",
        body: JSON.stringify({ ventas: false }),
      });
      if (r.todoBien) toast.success(r.texto);
      else toast.error(`No todo se pudo actualizar. ${r.texto}`);
      setRecarga((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    } finally {
      enCurso.current = false;
      setActualizando(false);
    }
  }, [toast]);

  const alContarOdoo = useCallback((c: { porEmparejar: number }) => setPorEmparejar((p) => ({ ...p, odoo: c.porEmparejar })), []);
  const alContarMercury = useCallback((n: number) => setPorEmparejar((p) => ({ ...p, mercury: n })), []);
  /* Emparejar mueve lo que no cuadra: la lista se vuelve a leer cuando se vuelve a ella. */
  const alEmparejar = useCallback(() => setRecarga((n) => n + 1), []);

  return (
    <div className="space-y-4">
      <PageHeader recorrido="finanzas-conciliacion"
        title="Conciliación"
        description="Todo lo que no cuadra entre Nexus, Odoo y Mercury, en una sola lista. Se vuelve a calcular con cada copia: lo que se arregla sale solo."
        action={
          <div data-recorrido="fin.conciliacion.actualizar" className="flex flex-col items-end gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void actualizar()}
              disabled={actualizando}
              title="Trae ya lo último de Odoo y de Mercury, sin esperar a la próxima hora, y cobra lo que dan por pagado y conciliado con el banco. Solo lee Odoo y Mercury."
            >
              {actualizando ? "Leyendo Odoo y Mercury y cobrando lo pagado…" : "Actualizar desde Odoo y Mercury"}
            </Button>
            <span className="text-xs text-fg-muted">
              <Link href="/cobranza/odoo" className="font-medium text-brand hover:text-brand-light" title="La copia de Odoo: qué es, emparejar y la facturación por cliente.">
                Odoo
              </Link>
              {copias.odoo ? `: copia del ${copias.odoo}` : ": sin copia"} ·{" "}
              <Link href="/cobranza/mercury" className="font-medium text-brand hover:text-brand-light" title="La copia de Mercury: facturas, clientes y pagos.">
                Mercury
              </Link>
              {copias.mercury ? `: copia del ${copias.mercury}` : ": sin copia"}
              {conIntegraciones && (
                <>
                  {" · "}
                  <Link href="/finanzas/integraciones" className="font-medium text-brand hover:text-brand-light" title="Si las copias de Odoo, Mercury y HubSpot están al día.">
                    Integraciones
                  </Link>
                </>
              )}
            </span>
          </div>
        }
      />

      <Tabs
        aria-label="Secciones de Conciliación"
        variant="underline"
        value={tab}
        onChange={(k) => setTab(k as Pestana)}
        items={[
          {
            key: "no-cuadra",
            label: "Lo que no cuadra",
            count: noCuadra,
            title: "Las diferencias entre los cobros de Nexus y lo que dicen Odoo y Mercury, con dónde se arregla cada una.",
          },
          {
            key: "pagado",
            label: "Lo pagado",
            title: "Lo que Odoo y Mercury ya dan por facturado o pagado, listo para pasar a Nexus con tu firma.",
          },
          {
            key: "emparejar",
            label: "Emparejar",
            count: porEmparejar.odoo + porEmparejar.mercury || undefined,
            title: "Decir qué cuenta de Nexus es cada cliente de Odoo y de Mercury.",
          },
          { key: "libro", label: "Libro de Alex", title: "Comparar el Excel de Alex contra Nexus, fila por fila." },
          ...(gastosMercury
            ? [
                {
                  key: "gastos",
                  label: "Gastos y Mercury",
                  count: pendientesDeGastos(gastosMercury),
                  title: "Los cargos de las tarjetas de Mercury contra los recurrentes y los gastos de Nexus.",
                },
              ]
            : []),
        ]}
      />

      {tab === "gastos" && gastosMercury && (
        <div className="space-y-6">
          <GastosFinancieros puedeEditar={puedeEditarGastos} />
          <GastosContraMercury datos={gastosMercury} />
        </div>
      )}

      {tab === "pagado" && <LoPagado puedeEditar={puedeEditar} recarga={recarga} />}

      {tab === "no-cuadra" && (
        <DiferenciasOdoo
          fuente="todas"
          vista={vista}
          supervisor={supervisor}
          quienInicial={soloDecisiones ? "decisiones" : undefined}
          puedeEditar={puedeEditar}
          recarga={recarga}
          onIrAEmparejar={() => setTab("emparejar")}
          onPendientes={setNoCuadra}
        />
      )}

      {tab === "emparejar" && (
        <div className="space-y-4">
          <Segmentado<Sistema>
            etiqueta="De qué sistema"
            valor={sistema}
            onCambio={setSistema}
            opciones={[
              { clave: "odoo", etiqueta: `Odoo · ${porEmparejar.odoo}` },
              { clave: "mercury", etiqueta: `Mercury · ${porEmparejar.mercury}` },
            ]}
          />
          {sistema === "odoo" ? (
            <EmparejadoOdoo puedeEditar={puedeEditar} recarga={recarga} onConteos={alContarOdoo} onCambio={alEmparejar} />
          ) : (
            <EmparejadoMercury recarga={recarga} onConteos={alContarMercury} onCambio={alEmparejar} />
          )}
        </div>
      )}

      {tab === "libro" && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-fg">El libro de Alex contra Nexus</h2>
          <p className="max-w-2xl text-sm text-fg-secondary">
            Sube el Excel de cobranza de Alex y Nexus lo compara fila por fila: lo que coincide, lo que falta en Nexus, los
            números de factura que se pueden anotar y lo que conviene cargar como por cobrar. Mientras el libro siga
            existiendo, es la forma de comprobar que los dos dicen lo mismo.
          </p>
          <Link
            href="/cobranza/importar"
            className="inline-flex rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover"
          >
            Abrir el libro de Alex
          </Link>
        </section>
      )}
    </div>
  );
}
