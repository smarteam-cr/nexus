"use client";

/**
 * components/cobranza/MercuryClient.tsx
 *
 * Las pestañas de la integración con Mercury: **cómo funciona**, **emparejar** y **lo que no cuadra**. Es el molde de
 * OdooClient (2026-10-02): la misma línea de «de cuándo es la copia», el mismo «Actualizar desde…» arriba de las
 * pestañas y la misma lista de lo que no cuadra (DiferenciasOdoo con `fuente="mercury"`).
 *
 * Lo que cambia es el sistema: en Mercury se emiten las facturas a los clientes internacionales y entra su plata. Por
 * eso además de las facturas se copian los movimientos: una factura pagada en Mercury se ata a la entrada de plata que la
 * pagó, y la plata que entró sin factura también es una línea.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Tabs } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import EmparejadoMercury from "./EmparejadoMercury";
import DiferenciasOdoo from "./DiferenciasOdoo";
import type { PestanaMercury } from "@/lib/cobranza/mercury/pestanas";
import { horaDeCostaRica } from "@/lib/cobranza/odoo/espejo";
import { resumenDeDiferencias, type DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
/* «Cómo funciona» dice las reglas con los mismos números que las aplican. */
import { COMISION_DEL_BANCO, DIAS_DE_GRACIA_MERCURY, DIAS_PARA_PAGAR } from "@/lib/cobranza/mercury/diferencias";

interface CorridaDelEspejo {
  iniciadaEn: string;
  terminadaEn: string | null;
  ok: boolean;
  parcial: boolean;
  error: string | null;
  ultimaOkEn: string | null;
  horasDesdeLaUltimaBuena: number | null;
  vencido: boolean;
}

interface RespuestaDeActualizar {
  estado: "COPIADO" | "RECIENTE" | "EN_CURSO" | "FALLO";
  mensaje: string;
  corrida: CorridaDelEspejo | null;
  facturas: number;
}

interface Conteos {
  facturas: number;
  clientes: number;
  emparejados: number;
  porEmparejar: number;
  cuentasSinCliente: number;
  diferencias: number;
}

const ENDPOINT_DIFERENCIAS = "/api/cobranza/mercury/diferencias";

export default function MercuryClient({
  corrida,
  tieneToken,
  conteos,
  puedeEditar,
  pestanaInicial,
}: {
  corrida: CorridaDelEspejo | null;
  /** Si el servidor tiene `MERCURY_API_TOKEN`. Sin él, la copia no puede correr. */
  tieneToken: boolean;
  conteos: Conteos;
  /** `cobranza.write`: decide si se dibujan «Está bien así» y su «Deshacer». */
  puedeEditar: boolean;
  pestanaInicial?: PestanaMercury;
}) {
  /* Arranca donde está el trabajo: si falta emparejar, ahí; si no, lo que no cuadra. Un enlace que pide una pestaña
     manda. Sin ninguna copia todavía, en «Cómo funciona». */
  const [tab, setTab] = useState<PestanaMercury>(
    pestanaInicial ?? (!corrida ? "que-es" : conteos.porEmparejar > 0 ? "emparejar" : "no-cuadra"),
  );
  const [emparejado, setEmparejado] = useState({ porEmparejar: conteos.porEmparejar, cuentasSinCliente: conteos.cuentasSinCliente });
  const [diferencias, setDiferencias] = useState(conteos.diferencias);
  const vueltaDeDiferencias = useRef(0);
  const alContarDiferencias = useCallback((filas: number) => {
    vueltaDeDiferencias.current += 1;
    setDiferencias(filas);
  }, []);
  const alContarEmparejado = useCallback((porEmparejar: number, cuentasSinCliente: number) => {
    setEmparejado({ porEmparejar, cuentasSinCliente });
  }, []);
  /* Emparejar mueve «Lo que no cuadra» (las facturas de un cliente pasan a su cuenta): se recuenta en segundo plano. */
  const recontarDiferencias = useCallback(() => {
    const vuelta = ++vueltaDeDiferencias.current;
    void fetchJson<{ inconsistencias: DiferenciaOdoo[] }>(ENDPOINT_DIFERENCIAS)
      .then((r) => {
        if (vueltaDeDiferencias.current === vuelta) setDiferencias(resumenDeDiferencias(r.inconsistencias).filas);
      })
      .catch(() => undefined);
  }, []);

  const toast = useToast();
  const [copia, setCopia] = useState(corrida);
  const [facturas, setFacturas] = useState(conteos.facturas);
  const [recarga, setRecarga] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  const actualizar = useCallback(async () => {
    setActualizando(true);
    try {
      const r = await fetchJson<RespuestaDeActualizar>("/api/cobranza/mercury/actualizar", { method: "POST" });
      setCopia(r.corrida);
      setFacturas(r.facturas);
      if (r.estado === "FALLO") toast.error(r.mensaje);
      else if (r.estado === "COPIADO") toast.success(r.mensaje);
      else toast.info(r.mensaje);
      setRecarga((n) => n + 1);
      if (tab !== "no-cuadra") recontarDiferencias();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar desde Mercury.");
    } finally {
      setActualizando(false);
    }
  }, [toast, recontarDiferencias, tab]);
  const vivos: Conteos = { ...conteos, ...emparejado, facturas, diferencias };

  return (
    <div className="space-y-4">
      <Tabs
        aria-label="Secciones de la integración con Mercury"
        variant="underline"
        value={tab}
        onChange={(k) => setTab(k as PestanaMercury)}
        items={[
          { key: "que-es", label: "Cómo funciona", title: "Qué hace esta integración y qué no hace." },
          {
            key: "emparejar",
            label: "Emparejar",
            count: vivos.porEmparejar,
            title: "Decir qué cuenta de Nexus es cada cliente de Mercury.",
          },
          {
            key: "no-cuadra",
            label: "Lo que no cuadra",
            count: vivos.diferencias,
            title: "Diferencias entre Nexus y Mercury, con dónde se arregla cada una.",
          },
        ]}
      />

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          {!tieneToken && (
            <div role="alert" className="rounded-lg border border-warn-line bg-warn-surface px-4 py-3 text-sm text-warn-ink">
              El servidor no tiene el token de Mercury, así que no puede copiar nada. Hay que ponerlo en el servidor como{" "}
              <code>MERCURY_API_TOKEN</code> (ver RUNBOOK, «La copia de Mercury no corre»).
            </div>
          )}
          {tieneToken && copia && <EstadoDelEspejo corrida={copia} facturas={facturas} />}
          {tieneToken && !copia && (
            <p className="text-xs text-fg-muted">Nexus todavía no copió nada de Mercury. «Actualizar desde Mercury» hace la primera copia.</p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => void actualizar()}
          disabled={actualizando || !tieneToken}
          title="Trae ya las facturas, los clientes y los pagos de Mercury. Solo lee: no cambia ningún cobro."
        >
          {actualizando ? "Leyendo Mercury…" : "Actualizar desde Mercury"}
        </Button>
      </div>

      {tab === "que-es" && <QueEs conteos={vivos} />}
      {tab === "emparejar" && <EmparejadoMercury recarga={recarga} onConteos={alContarEmparejado} onCambio={recontarDiferencias} />}
      {tab === "no-cuadra" && (
        <DiferenciasOdoo
          fuente="mercury"
          puedeEditar={puedeEditar}
          recarga={recarga}
          onIrAEmparejar={() => setTab("emparejar")}
          onPendientes={alContarDiferencias}
        />
      )}
    </div>
  );
}

/* ── La línea de arriba: de cuándo es la copia ──────────────────────────────────── */

const cuando = (iso: string) => horaDeCostaRica(iso);
const hace = (horas: number | null) =>
  horas === null ? "" : horas < 1 ? "hace menos de una hora" : horas < 48 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} días`;

function EstadoDelEspejo({ corrida, facturas }: { corrida: CorridaDelEspejo; facturas: number }) {
  const sinTerminar = corrida.terminadaEn === null;
  const queFallo =
    !corrida.ok && !sinTerminar
      ? `La última copia (${cuando(corrida.iniciadaEn)}) ${corrida.parcial ? "quedó incompleta" : "falló"}${corrida.error ? `: ${corrida.error}` : "."}`
      : null;

  if (corrida.vencido) {
    return (
      <div role="alert" className="space-y-1 rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-ink">
        <p className="font-semibold">
          {corrida.ultimaOkEn
            ? `⚠ La copia de Mercury está vieja: la última buena es del ${cuando(corrida.ultimaOkEn)} (${hace(corrida.horasDesdeLaUltimaBuena)}).`
            : "⚠ Ninguna copia de Mercury salió bien todavía."}
        </p>
        <p>
          Lo facturado o pagado en Mercury después no está acá.{" "}
          {queFallo ?? (sinTerminar ? `Hay una copia sin terminar desde el ${cuando(corrida.iniciadaEn)}.` : "No se volvió a copiar desde entonces.")}{" "}
          «Actualizar desde Mercury» la vuelve a intentar ahora.
        </p>
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
      {corrida.ultimaOkEn && (
        <span title="Hora de Costa Rica. La copia se hace sola cada mañana, desde las 6, y con «Actualizar desde Mercury».">
          Copia de Mercury del {cuando(corrida.ultimaOkEn)}
          {corrida.horasDesdeLaUltimaBuena !== null && ` (${hace(corrida.horasDesdeLaUltimaBuena)})`} · {facturas} facturas
        </span>
      )}
      {queFallo && <span className="text-danger-ink">· ⚠ {queFallo}</span>}
      {sinTerminar && <span className="text-warn-ink">· la copia del {cuando(corrida.iniciadaEn)} sigue sin terminar</span>}
    </p>
  );
}

/* ── La pestaña que explica ──────────────────────────────────────────────────────── */

const { proporcion, minimo, maximo } = COMISION_DEL_BANCO;

function QueEs({ conteos }: { conteos: Conteos }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Para qué existe</h2>
        <p className="mt-2 text-sm text-fg-secondary">
          A los clientes internacionales se les factura desde Mercury, y su plata entra ahí. Hasta ahora, saber si uno había
          pagado era entrar a Mercury y comparar a mano con los cobros de Nexus.
        </p>
        <p className="mt-2 text-sm text-fg-secondary">
          Ahora Nexus copia de Mercury las facturas, los clientes y las entradas de plata cada mañana, y cada vez que alguien
          aprieta «Actualizar desde Mercury». Lo que no coincide con los cobros aparece en «Lo que no cuadra», con su monto,
          dónde se arregla y los pasos. Cada copia lo vuelve a calcular: lo arreglado sale solo y lo que sigue mal sigue ahí.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-success-line bg-success-surface p-5">
          <h3 className="text-sm font-semibold text-success-ink">Lo que sí hace</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">
            <li>· Trae las facturas y los clientes de Mercury, y las entradas de plata desde 2025.</li>
            <li>· Ata cada factura pagada a la entrada de plata que la pagó, para saber qué día entró.</li>
            <li>· Lista lo que no cuadra con los cobros de Nexus, lo más urgente primero.</li>
            <li>· Propone la cuenta de Nexus de cada cliente de Mercury, diciendo por qué.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-danger-line bg-danger-surface p-5">
          <h3 className="text-sm font-semibold text-danger-ink">Lo que NO hace, a propósito</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">
            <li>
              · <strong className="text-fg">Nunca escribe en Mercury.</strong> El token es de solo lectura.
            </li>
            <li>
              · <strong className="text-fg">Nunca marca un cobro como cobrado.</strong> Muestra que Mercury lo da pagado; el
              pago lo registra una persona.
            </li>
            <li>· No convierte moneda.</li>
            <li>· «Está bien así» solo saca la fila de la lista: no arregla nada, ni en Nexus ni en Mercury.</li>
          </ul>
        </div>
      </div>

      <Bloque titulo="Cómo se usa">
        <li>
          · <strong className="text-fg">1. Emparejar, una vez por cliente.</strong> Mercury usa la razón social y Nexus el
          nombre comercial. Al emparejar, las facturas del cliente pasan a su cuenta y su razón social queda como sociedad
          de Mercury de la cuenta.
        </li>
        <li>
          · <strong className="text-fg">2. Revisar lo que no cuadra.</strong> Cada línea dice cuánta plata mueve, dónde se
          arregla y los pasos. Lo que está bien así se marca fila por fila, con su motivo.
        </li>
        <li>
          · <strong className="text-fg">3. Traer lo último.</strong> Si acabas de marcar una factura pagada en Mercury o de
          emitir una, «Actualizar desde Mercury» la copia en el momento.
        </li>
      </Bloque>

      <Bloque titulo="Las filas vuelven solas">
        <li>· Nada se guarda como «resuelto»: cada vez que se abre la lista se vuelve a comparar todo.</li>
        <li>
          · Una fila marcada «Está bien así» vuelve si cambia uno de sus números: el monto, el estado, el número de factura o
          el cobro.
        </li>
        <li>· Lo marcado queda en «Marcadas», al final de la lista, con quién, cuándo y por qué, y su «Deshacer».</li>
      </Bloque>

      <Bloque titulo="Las reglas, con sus números">
        <li>
          · <strong className="text-fg">Comisión del banco.</strong> Una transferencia llega con la comisión descontada. Se
          acepta que pague hasta un {Math.round(proporcion * 100)} % menos que la factura (al menos US${minimo}, a lo sumo
          US${maximo}). El cobro en Nexus igual se registra completo: la comisión es un gasto.
        </li>
        <li>
          · <strong className="text-fg">Qué plata cuenta.</strong> Solo entradas de clientes: no cuentan las transferencias
          entre cuentas propias, los intereses, las devoluciones de tarjeta ni lo que mueve Mercury mismo.
        </li>
        <li>
          · <strong className="text-fg">Cuándo se ata a una factura.</strong> Desde 3 días antes de la factura hasta{" "}
          {DIAS_PARA_PAGAR} días después, primero la de nombre parecido al cliente.
        </li>
        <li>
          · <strong className="text-fg">Lo recién facturado.</strong> Un cobro facturado en Nexus en los{" "}
          {DIAS_DE_GRACIA_MERCURY} días antes de la última copia todavía puede no estar en Mercury: recién después se acusa.
        </li>
        <li>
          · <strong className="text-fg">El número de factura.</strong> Nexus lo reconoce aunque esté escrito con más texto
          («INVOICE NO.INV-48» es la INV-48).
        </li>
      </Bloque>

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Qué quiere decir cada estado</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="py-1.5 pr-4 font-medium">Mercury dice</th>
                <th className="py-1.5 pr-4 font-medium">Quiere decir</th>
                <th className="py-1.5 font-medium">¿Entró la plata?</th>
              </tr>
            </thead>
            <tbody>
              <Estado codigo="Unpaid" que="Sin pagar." plata="No" />
              <Estado codigo="Processing" que="El cliente pagó y Mercury está procesando el pago." plata="Todavía no" />
              <Estado codigo="Paid" que="Pagada. Mercury no dice el día: Nexus lo saca de la entrada de plata que la pagó." plata="Sí" />
              <Estado codigo="Cancelled" que="Anulada. Ya no se cobra." plata="No" />
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Dato n={conteos.facturas} etiqueta="facturas copiadas de Mercury" pie="Solo lectura." />
        <Dato
          n={conteos.emparejados}
          de={conteos.clientes}
          etiqueta="clientes de Mercury con cuenta"
          pie={
            conteos.porEmparejar > 0
              ? `Faltan ${conteos.porEmparejar}: sus facturas no cuentan en la cobranza.`
              : "No falta ninguno por emparejar."
          }
        />
        <Dato n={conteos.diferencias} etiqueta="cosas por resolver" pie="Las filas pendientes de «Lo que no cuadra»." />
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">{children}</ul>
    </div>
  );
}

function Estado({ codigo, que, plata, alerta }: { codigo: string; que: string; plata: string; alerta?: boolean }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-1.5 pr-4 align-top">
        <code className="text-xs text-fg-secondary">{codigo}</code>
      </td>
      <td className="py-1.5 pr-4 align-top text-fg-secondary">{que}</td>
      <td className={`py-1.5 align-top font-medium ${alerta ? "text-danger-ink" : "text-fg"}`}>{plata}</td>
    </tr>
  );
}

function Dato({ n, de, etiqueta, pie }: { n: number; de?: number; etiqueta: string; pie: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-2xl font-bold tabular-nums text-fg">
        {n}
        {de !== undefined && <span className="text-base font-normal text-fg-muted"> / {de}</span>}
      </p>
      <p className="text-sm text-fg-secondary">{etiqueta}</p>
      <p className="mt-0.5 text-xs text-fg-muted">{pie}</p>
    </div>
  );
}
