"use client";

/**
 * components/sociedades/SociedadesClient.tsx — Finanzas › Sociedades (2026-11-13).
 *
 * Tres pestañas:
 *   · «Lo que se deben»: el saldo acumulado de cada par de sociedades, por moneda, y los movimientos que lo arman.
 *   · «Sin factura»: lo que cruzó entre sociedades sin una factura que lo respalde, y los traslados entre cuentas
 *     propias sin su otra mitad. «Está bien así» (con el porqué) lo saca de la lista, no del saldo.
 *   · «Catálogo de Odoo»: las cuentas, clasificadas por el primer dígito de su código, con lo que no encaja.
 * Lo de Odoo llega con la copia de cada hora (lib/sociedades/copia.ts); lo que no está en Odoo se anota a mano.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, EmptyState, Field, Input, Modal, PageHeader, Selector, Table, Tabs, Textarea } from "@/components/ui";
import type { TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import { NOMBRE_DE_CLASE, TEXTO_DEL_AVISO, type CuentaClasificada, type ResumenDelCatalogo } from "@/lib/sociedades/catalogo";
import type { MovimientoDTO, PaginaDeSociedades } from "@/lib/sociedades/server";

type Pestana = "saldos" | "sin-factura" | "catalogo";

interface CatalogoDTO {
  resumen: ResumenDelCatalogo;
  cuentas: CuentaClasificada[];
  entreSociedades: Array<{ codigo: string; nombre: string; sociedad: string }>;
  avisos: string[];
}

const RESPALDO: Record<string, { texto: string; cls: string }> = {
  FACTURA: { texto: "Con factura", cls: "border-success-line bg-success-surface text-success-ink" },
  CONCILIADA: { texto: "Con su otra mitad", cls: "border-line bg-surface-muted text-fg-secondary" },
  SIN_RESPALDO: { texto: "Sin factura", cls: "border-warn-line bg-warn-surface text-warn-ink" },
};

export default function SociedadesClient({ d }: { d: PaginaDeSociedades }) {
  const router = useRouter();
  const toast = useToast();
  const [pestana, setPestana] = useState<Pestana>("saldos");
  const [actualizando, setActualizando] = useState(false);
  const [anotando, setAnotando] = useState(false);
  const [aceptando, setAceptando] = useState<MovimientoDTO | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoDTO | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);

  const nombre = useMemo(() => new Map(d.sociedades.map((s) => [s.id, s.nombre])), [d.sociedades]);
  const n = (id: string | null) => (id ? (nombre.get(id) ?? "—") : "—");
  const porRevisar = d.sinFactura.length + d.trasladosSueltos.length;

  async function actualizar() {
    setActualizando(true);
    try {
      const r = await fetchJson<{ nuevas: number; cambiadas: number }>("/api/finanzas/sociedades/actualizar", { method: "POST" });
      toast.success(r.nuevas + r.cambiadas > 0 ? `Listo: ${r.nuevas} nuevos y ${r.cambiadas} con cambios.` : "Listo: Odoo no trae nada nuevo.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo leer Odoo.");
    } finally {
      setActualizando(false);
    }
  }

  async function abrirCatalogo() {
    setPestana("catalogo");
    if (catalogo) return;
    setErrorCatalogo(null);
    try {
      setCatalogo(await fetchJson<CatalogoDTO>("/api/finanzas/sociedades/catalogo"));
    } catch (e) {
      setErrorCatalogo(e instanceof ApiError ? e.message : "No se pudo leer el catálogo de Odoo.");
    }
  }

  async function cambiar(m: MovimientoDTO, body: unknown, ok: string) {
    try {
      await fetchJson(`/api/finanzas/sociedades/movimientos/${m.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      return false;
    }
  }

  const columnas = (conAccion: boolean): TableColumn<MovimientoDTO>[] => [
    { key: "fecha", header: "Fecha", render: (m) => fmtFecha(m.fecha), sortValue: (m) => m.fecha, width: "w-24" },
    {
      key: "quien",
      header: "Entre",
      render: (m) =>
        m.contraparteId ? (
          <span className="text-fg">
            {n(m.sociedadId)} · {n(m.contraparteId)}
          </span>
        ) : (
          <span className="text-fg">Cuentas de {n(m.sociedadId)}</span>
        ),
    },
    {
      key: "monto",
      header: "Monto",
      align: "right",
      sortValue: (m) => Math.abs(m.monto),
      headerHint: "Positivo: la otra sociedad le debe más a la de los libros. Negativo: le debe menos, o le deben a ella.",
      render: (m) => <span className="tabular-nums">{fmtMonto(m.monto, m.moneda)}</span>,
    },
    {
      key: "concepto",
      header: "Qué dice",
      render: (m) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg-secondary">{m.concepto ?? "—"}</span>
          <span className="truncate text-[11px] text-fg-muted">
            {[m.asiento, m.cuentaContable, m.diario, m.origen === "MANUAL" ? `anotado por ${m.anotadoPor ?? "—"}` : null].filter(Boolean).join(" · ")}
          </span>
          {m.aceptado && (
            <span className="text-[11px] text-fg-muted">
              ✓ Está bien así ({m.aceptado.por}, {fmtFecha(m.aceptado.en)}): {m.aceptado.nota}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "respaldo",
      header: "Respaldo",
      render: (m) => (
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${RESPALDO[m.respaldo]?.cls ?? ""}`}>
          {RESPALDO[m.respaldo]?.texto ?? m.respaldo}
        </span>
      ),
    },
    ...(conAccion
      ? [
          {
            key: "accion",
            header: "",
            align: "right" as const,
            render: (m: MovimientoDTO) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setAceptando(m)}>
                  Está bien así
                </Button>
                {m.origen === "MANUAL" && (
                  <Button variant="ghost" size="sm" onClick={() => void cambiar(m, { tipo: "ANULAR" }, "Se anuló el movimiento.")}>
                    Anular
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sociedades de Smarteam"
        description="Lo que se deben CR Smarteam, la LLC, Smart Agro y Flywheel, y lo que se movió entre ellas sin una factura que lo respalde."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAnotando(true)}>
              Anotar un movimiento
            </Button>
            <Button variant="primary" onClick={() => void actualizar()} disabled={actualizando}>
              {actualizando ? "Leyendo Odoo…" : "Actualizar desde Odoo"}
            </Button>
          </div>
        }
      />

      {d.copia?.error && (
        <Alert variant="warning" title="La última lectura de Odoo falló">
          {d.copia.ultimaBuena ? `Lo que ves es de la lectura buena del ${fmtFecha(d.copia.ultimaBuena.slice(0, 10))}.` : "Todavía no hubo una lectura buena."}
        </Alert>
      )}
      {!d.copia && (
        <Alert variant="info" title="Todavía no se leyó Odoo">
          La copia de cada hora lo trae sola. Para no esperar, aprieta «Actualizar desde Odoo».
        </Alert>
      )}
      {d.copia && d.copia.avisos.length > 0 && (
        <Alert variant="info" title="Lo que no encajó al leer Odoo">
          <ul className="list-disc space-y-0.5 pl-4">
            {d.copia.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Tabs<Pestana>
        aria-label="Sociedades"
        value={pestana}
        onChange={(k) => (k === "catalogo" ? void abrirCatalogo() : setPestana(k))}
        items={[
          { key: "saldos", label: "Lo que se deben" },
          { key: "sin-factura", label: "Sin factura", count: porRevisar },
          { key: "catalogo", label: "Catálogo de Odoo" },
        ]}
      />

      {pestana === "saldos" && (
        <div className="space-y-6">
          <section aria-label="Saldos entre sociedades" className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Saldo acumulado de cada par</h2>
            {d.saldos.length === 0 ? (
              <EmptyState variant="dashed" title="Sin saldos entre sociedades" description="Cuando Odoo traiga movimientos entre sociedades, o anotes uno, aparecen acá." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.saldos.map((s) => (
                  <div key={`${s.deudoraId}-${s.acreedoraId}-${s.moneda}`} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
                    <span className="text-xs text-fg-muted">
                      {s.saldo === 0 ? `${n(s.deudoraId)} y ${n(s.acreedoraId)}` : `${n(s.deudoraId)} le debe a ${n(s.acreedoraId)}`}
                    </span>
                    <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{s.saldo === 0 ? "A mano" : fmtMonto(s.saldo, s.moneda)}</span>
                    <span className="text-xs text-fg-muted">
                      En {s.moneda === "USD" ? "dólares" : "colones"} · {s.movimientos} {s.movimientos === 1 ? "movimiento" : "movimientos"} · el último, {fmtFecha(s.ultimaFecha)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-fg-muted">
              Sale de los libros de CR Smarteam en Odoo (sus cuentas por cobrar a Flywheel y Smart Agro, las facturas con la LLC y las
              transferencias) más lo que se anota a mano. Colones y dólares no se suman.
            </p>
          </section>

          <section aria-label="Movimientos entre sociedades" className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Movimientos</h2>
            <Table
              columns={columnas(false)}
              rows={d.movimientos}
              rowKey={(m) => m.id}
              initialSort={{ key: "fecha", dir: "desc" }}
              search={{ placeholder: "Buscar por referencia o asiento", getText: (m) => `${m.concepto ?? ""} ${m.asiento ?? ""} ${n(m.contraparteId)}` }}
              empty={<EmptyState title="Sin movimientos entre sociedades" />}
            />
          </section>

          <section aria-label="Las sociedades" className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Las sociedades</h2>
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {d.sociedades.map((s) => (
                <div key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                  <span className="text-sm font-semibold text-fg">{s.nombre}</span>
                  {s.razonSocial && s.razonSocial !== s.nombre && <span className="text-xs text-fg-muted">{s.razonSocial}</span>}
                  <span className="text-xs text-fg-secondary">
                    {s.plataforma === "ODOO" ? "Factura en Odoo" : s.plataforma === "MERCURY" ? "Factura en Mercury" : "Sin facturación propia todavía"}
                    {s.odooCompanyId ? ` · lleva sus libros en Odoo (compañía ${s.odooCompanyId})` : ""}
                  </span>
                  <span className="ml-auto text-xs text-fg-muted">
                    {s.cuentasDeCobranza} {s.cuentasDeCobranza === 1 ? "cuenta de cobranza" : "cuentas de cobranza"}
                    {s.principal ? " · la principal" : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-fg-muted">
              Una cuenta de cobranza es de la sociedad de su vía (Odoo o Mercury) salvo que se elija otra en su ficha, en «Sociedad de
              Smarteam que cobra».
            </p>
          </section>
        </div>
      )}

      {pestana === "sin-factura" && (
        <div className="space-y-6">
          <section aria-label="Entre sociedades sin factura" className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Entre sociedades, sin factura</h2>
            <p className="text-xs text-fg-muted">
              Plata que cruzó de una sociedad a otra sin una factura que la explique. Si está bien así (un préstamo acordado, un aporte),
              dilo con el porqué y sale de esta lista; sigue contando en el saldo.
            </p>
            <Table
              columns={columnas(true)}
              rows={d.sinFactura}
              rowKey={(m) => m.id}
              initialSort={{ key: "fecha", dir: "desc" }}
              empty={<EmptyState title="Nada sin factura entre sociedades" />}
            />
          </section>
          <section aria-label="Traslados sin su otra mitad" className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Traslados entre cuentas propias sin su otra mitad</h2>
            <p className="text-xs text-fg-muted">
              Salió de una cuenta de la sociedad y no se ve en cuál entró (o al revés): Odoo no los ató y no hay otro movimiento por el
              mismo monto a 5 días o menos.
            </p>
            <Table
              columns={columnas(true)}
              rows={d.trasladosSueltos}
              rowKey={(m) => m.id}
              initialSort={{ key: "fecha", dir: "desc" }}
              empty={<EmptyState title="Todos los traslados tienen su otra mitad" />}
            />
          </section>
        </div>
      )}

      {pestana === "catalogo" && (
        <div className="space-y-4">
          {errorCatalogo && <Alert variant="danger" title={errorCatalogo} />}
          {!catalogo && !errorCatalogo && <p className="text-sm text-fg-muted">Leyendo el catálogo de Odoo…</p>}
          {catalogo && <Catalogo c={catalogo} />}
        </div>
      )}

      {anotando && (
        <AnotarMovimiento
          sociedades={d.sociedades.filter((s) => s.activa)}
          onClose={() => setAnotando(false)}
          onListo={() => {
            setAnotando(false);
            router.refresh();
          }}
        />
      )}

      {aceptando && (
        <AceptarMovimiento
          m={aceptando}
          onClose={() => setAceptando(null)}
          onAceptar={async (nota) => {
            if (await cambiar(aceptando, { tipo: "ACEPTAR", nota }, "Quedó como «está bien así», a tu nombre.")) setAceptando(null);
          }}
        />
      )}
    </div>
  );
}

function Catalogo({ c }: { c: CatalogoDTO }) {
  const r = c.resumen;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
          <span className="text-xs text-fg-muted">Cuentas en uso</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{r.total}</span>
          <span className="text-xs text-fg-muted">La meta de la fusión: unas {r.meta}.</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
          <span className="text-xs text-fg-muted">Con el código nuevo (seis dígitos)</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{r.conCodigoNuevo}</span>
          <span className="text-xs text-fg-muted">{r.total - r.conCodigoNuevo} con el código viejo.</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
          <span className="text-xs text-fg-muted">Por clase</span>
          <span className="text-[13px] leading-5 text-fg">
            {r.porClase.filter((p) => p.n > 0).map((p) => `${NOMBRE_DE_CLASE[p.clase]} ${p.n}`).join(" · ")}
          </span>
        </div>
      </div>
      {c.entreSociedades.length > 0 && (
        <p className="text-xs text-fg-muted">
          Cuentas que Nexus lee como deuda entre sociedades: {c.entreSociedades.map((e) => `${e.codigo} ${e.nombre} (${e.sociedad})`).join(" · ")}.
        </p>
      )}
      {c.avisos.length > 0 && (
        <Alert variant="info" title="Lo que no encajó">
          <ul className="list-disc space-y-0.5 pl-4">
            {c.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      )}
      <section aria-label="Cuentas con algo que revisar" className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Cuentas con algo que revisar en Odoo</h2>
        <Table
          columns={[
            { key: "codigo", header: "Código", render: (x) => <span className="tabular-nums">{x.codigo}</span>, sortValue: (x) => x.codigo, width: "w-28" },
            { key: "nombre", header: "Cuenta", render: (x) => x.nombre },
            { key: "clase", header: "Clase", render: (x) => (x.clase ? NOMBRE_DE_CLASE[x.clase] : "—") },
            { key: "aviso", header: "Qué pasa", render: (x) => x.avisos.map((a) => TEXTO_DEL_AVISO[a]).join(" · ") },
          ]}
          rows={r.conAviso}
          rowKey={(x) => String(x.id)}
          initialSort={{ key: "codigo", dir: "asc" }}
          empty={<EmptyState title="Todas las cuentas encajan" description="Todas tienen el código nuevo y su tipo dice la misma clase." />}
        />
      </section>
    </>
  );
}

function AnotarMovimiento({
  sociedades,
  onClose,
  onListo,
}: {
  sociedades: PaginaDeSociedades["sociedades"];
  onClose: () => void;
  onListo: () => void;
}) {
  const toast = useToast();
  const [deudora, setDeudora] = useState<string | null>(null);
  const [acreedora, setAcreedora] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"CRC" | "USD">("USD");
  const [concepto, setConcepto] = useState("");
  const [factura, setFactura] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const opciones = sociedades.map((s) => ({ value: s.id, label: s.nombre }));
  const valido = deudora && acreedora && deudora !== acreedora && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number(monto.replace(",", ".")) > 0 && concepto.trim().length >= 3;

  async function guardar() {
    if (!valido) return;
    setOcupado(true);
    try {
      await fetchJson("/api/finanzas/sociedades/movimientos", {
        method: "POST",
        body: JSON.stringify({
          deudoraId: deudora,
          acreedoraId: acreedora,
          fecha,
          monto: Number(monto.replace(",", ".")),
          moneda,
          concepto,
          factura: factura.trim() || null,
        }),
      });
      toast.success("Quedó anotado, a tu nombre.");
      onListo();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo anotar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Anotar un movimiento entre sociedades"
      description="Para lo que no está en Odoo (por ejemplo, entre Smart Agro y Flywheel). Lo de Odoo llega solo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valido || ocupado} onClick={() => void guardar()}>
            {ocupado ? "Anotando…" : "Anotar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quién debe">
            <Selector etiqueta="Quién debe" placeholder="Elige la sociedad" valor={deudora} opciones={opciones} onElegir={setDeudora} />
          </Field>
          <Field label="A quién le debe">
            <Selector etiqueta="A quién le debe" placeholder="Elige la sociedad" valor={acreedora} opciones={opciones} onElegir={setAcreedora} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Monto">
            <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="1000" />
          </Field>
          <Field label="Moneda">
            <Selector
              etiqueta="Moneda"
              placeholder="Moneda"
              valor={moneda}
              opciones={[
                { value: "USD", label: "Dólares" },
                { value: "CRC", label: "Colones" },
              ]}
              onElegir={(v) => setMoneda(v === "CRC" ? "CRC" : "USD")}
            />
          </Field>
        </div>
        <Field label="De qué es">
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={300} placeholder="Préstamo para la planilla de octubre" />
        </Field>
        <Field label="Factura que lo respalda (opcional)" hint="Sin factura, queda en la lista de «Sin factura».">
          <Input value={factura} onChange={(e) => setFactura(e.target.value)} maxLength={60} placeholder="FAC/2026/0385" />
        </Field>
      </div>
    </Modal>
  );
}

function AceptarMovimiento({ m, onClose, onAceptar }: { m: MovimientoDTO; onClose: () => void; onAceptar: (nota: string) => Promise<void> }) {
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Está bien así"
      description={`${fmtMonto(m.monto, m.moneda)} del ${fmtFecha(m.fecha)}: «${m.concepto ?? "sin referencia"}». Sale de la lista de lo que no tiene factura; sigue contando en el saldo.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={nota.trim().length < 3 || ocupado}
            onClick={async () => {
              setOcupado(true);
              await onAceptar(nota);
              setOcupado(false);
            }}
          >
            {ocupado ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <Field label="Por qué está bien así">
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={1000} placeholder="Es un préstamo acordado con Marco." autoFocus />
      </Field>
    </Modal>
  );
}
