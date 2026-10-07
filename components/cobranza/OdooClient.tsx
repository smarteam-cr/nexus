"use client";

/**
 * components/cobranza/OdooClient.tsx
 *
 * Las pestañas de la integración con Odoo: **qué es**, **emparejar**, **lo que no cuadra** y, desde el 2026-09-30,
 * **facturación por cliente** (lo facturado y cobrado de cada cliente por año, al lado de las ventas cerradas).
 *
 * ── POR QUÉ HAY UNA PESTAÑA QUE SOLO EXPLICA ────────────────────────────────────
 * Esta pantalla la abre alguien que no la construyó, cada varias semanas, para hacer un
 * trabajo puntual. Sin una página que diga qué hace la integración —y sobre todo **qué NO
 * hace**— cada visita empieza reconstruyendo el modelo mental desde cero, y las dos preguntas
 * que aparecen siempre son las mismas: «¿esto le escribe a Odoo?» y «¿esto mueve mis cobros?».
 *
 * Las dos respuestas son que no, y están escritas grandes.
 *
 * ── LA LÍNEA DE ARRIBA DICE SI LA COPIA ES VIEJA ────────────────────────────────
 * Hasta el 2026-09-12 decía «Espejo actualizado el 2-sep» con la fecha de la ÚLTIMA corrida,
 * aunque esa corrida hubiera fallado, y no decía nada cuando el sync directamente dejó de correr.
 * Así pasaron diez días. Ahora distingue la última corrida de la última BUENA, y cuando la copia
 * es más vieja que `espejoVencido()` (la misma regla que INV31) se pone en rojo.
 *
 * ── «CÓMO FUNCIONA» TAMBIÉN DICE LO QUE LA LISTA NO MUESTRA (2026-09-25) ────────
 * Lo que queda fuera por regla (historia, exentas de años anteriores, pagadas sin cuenta, el IVA, lo recién
 * facturado) se cuenta en el texto de su línea, pero una línea sin filas pendientes no se muestra, y con ella se va
 * la cuenta. La explicación que queda siempre es la de esta pestaña. Lo vigila guardas.test.ts.
 *
 * ── «ACTUALIZAR DESDE ODOO» (2026-09-29) ────────────────────────────────────────
 * La copia era una vez por día, a las 6. Alex registraba un pago en Odoo y «Lo que no cuadra» lo seguía acusando
 * hasta la mañana siguiente, y un cliente recién creado en Odoo no aparecía para emparejar hasta que alguien apretaba
 * «Actualizar lista desde Odoo», un botón que traía los clientes pero no las facturas. Ahora hay UN botón, arriba de
 * las tres pestañas, que copia facturas y clientes y recarga la pestaña que se está mirando.
 */
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Tabs } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import EmparejadoOdoo from "./EmparejadoOdoo";
import DiferenciasOdoo from "./DiferenciasOdoo";
import FacturacionOdoo from "./FacturacionOdoo";
// ⚠ Viven en un módulo neutral: la página (servidor) también las lee, y de un "use client" no podría.
import type { Pestana } from "@/lib/cobranza/odoo/pestanas";
import { horaDeCostaRica } from "@/lib/cobranza/odoo/espejo";
/* «Cómo funciona» dice las reglas con los mismos números que las aplican: si la gracia o el IVA cambian allá, el
   texto cambia solo. */
import { DIAS_DE_GRACIA_DEL_ESPEJO, resumenDeDiferencias, type DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import { IVA_COSTA_RICA } from "@/lib/cobranza/montos";

const IVA_EN_PORCENTAJE = Math.round((IVA_COSTA_RICA - 1) * 100);

interface CorridaDelEspejo {
  iniciadaEn: string;
  terminadaEn: string | null;
  ok: boolean;
  parcial: boolean;
  error: string | null;
  /** Cuándo empezó la última corrida BUENA; null = nunca hubo una. */
  ultimaOkEn: string | null;
  horasDesdeLaUltimaBuena: number | null;
  /** `espejoVencido()` calculado en el servidor, con su reloj. */
  vencido: boolean;
}

/** Lo que contesta «Actualizar desde Odoo» (`ResultadoDeActualizar`, servicio.ts). */
interface RespuestaDeActualizar {
  estado: "COPIADO" | "RECIENTE" | "EN_CURSO" | "FALLO";
  mensaje: string;
  corrida: CorridaDelEspejo | null;
  facturas: number;
}

/**
 * Los contadores del emparejado, todos de `resumenDelEmparejado` (lib/cobranza/odoo/emparejado.ts): la pestaña,
 * la pestaña con que abre y «Cómo funciona» cuentan lo mismo que la lista. Viven en estado porque «Emparejar»
 * los devuelve después de cada cambio: marcar «Está en Mercury» baja el número de la pestaña sin recargar.
 */
type ConteosEmparejado = {
  cuentas: number;
  cuentasVinculadas: number;
  /** Vía Odoo y sin cliente de Odoo: el número de la pestaña. */
  porEmparejar: number;
  enMercury: number;
  enOtra: number;
};
type Conteos = ConteosEmparejado & { facturas: number; diferencias: number };

export default function OdooClient({
  corrida,
  conteos,
  puedeVerCorridas,
  puedeEditar,
  pestanaInicial,
}: {
  /** `cobranza.write`: decide si se dibujan los controles que cierran una línea a mano. */
  puedeEditar: boolean;
  corrida: CorridaDelEspejo | null;
  conteos: Conteos;
  /** Solo SUPER_ADMIN llega a /integrations/odoo. Sin esto el enlace sería un rebote. */
  puedeVerCorridas?: boolean;
  /**
   * La pestaña que pidió el enlace (`?pestana=no-cuadra`). La usa «Rendimiento de cobranza» del punto de
   * equilibrio: sin esto, «Revisalas en Lo que no cuadra» abría en «Emparejar» mientras falte emparejar.
   */
  pestanaInicial?: Pestana;
}) {
  const [tab, setTab] = useState<Pestana>(
    /* Arranca donde está el trabajo: si falta emparejar, esa es la pestaña. Si ya está todo
       emparejado, lo que queda es resolver diferencias. Un enlace que pide una pestaña manda.
       ⚠ Con la regla única: hasta el 2026-09-25 comparaba vinculadas contra TODAS las cuentas, y como las
       de Mercury nunca se vinculan, abría en «Emparejar» para siempre. */
    pestanaInicial ?? (conteos.porEmparejar > 0 ? "emparejar" : "no-cuadra"),
  );
  const [emparejado, setEmparejado] = useState<ConteosEmparejado>(() => ({
    cuentas: conteos.cuentas,
    cuentasVinculadas: conteos.cuentasVinculadas,
    porEmparejar: conteos.porEmparejar,
    enMercury: conteos.enMercury,
    enOtra: conteos.enOtra,
  }));
  /* ⭐ Las filas pendientes de «Lo que no cuadra»: arranca con las del servidor y «Lo que no cuadra» las actualiza
     después de cada carga, así marcar una fila baja el número de la pestaña y el de «Cómo funciona» sin recargar.
     Hasta el 2026-09-25 contaba LÍNEAS y quedaba fijo hasta recargar la página entera. */
  const [diferencias, setDiferencias] = useState(conteos.diferencias);
  /* La vuelta del último número de «Lo que no cuadra»: un recuento que termina después de que la pestaña ya dio uno más
     nuevo (se marcó una fila en el medio) no lo pisa con uno viejo. */
  const vueltaDeDiferencias = useRef(0);
  const alContarDiferencias = useCallback((filas: number) => {
    vueltaDeDiferencias.current += 1;
    setDiferencias(filas);
  }, []);
  /* ⚠ «Emparejar» también mueve «Lo que no cuadra»: «Está en Mercury» saca a la cuenta de «cuentas internacionales…»
     y vincular un cliente de Odoo saca sus facturas de «sin cuenta». Hasta la revisión del 2026-09-25 el número de esa
     pestaña y el de «Cómo funciona» quedaban viejos hasta abrirla. Se recuenta en segundo plano, con el mismo cálculo
     que la pestaña; si falla, el número se corrige solo al abrirla. */
  const recontarDiferencias = useCallback(() => {
    const vuelta = ++vueltaDeDiferencias.current;
    void fetchJson<{ inconsistencias: DiferenciaOdoo[] }>("/api/cobranza/odoo/diferencias")
      .then((r) => {
        if (vueltaDeDiferencias.current === vuelta) setDiferencias(resumenDeDiferencias(r.inconsistencias).filas);
      })
      .catch(() => undefined);
  }, []);
  /* ⭐ «Actualizar desde Odoo» (2026-09-29). La línea de arriba y el conteo de facturas pasan a estado: los cambia la
     respuesta del botón, no una recarga de la página. `recarga` les avisa a las dos pestañas que vuelvan a leer. */
  const toast = useToast();
  const [copia, setCopia] = useState(corrida);
  const [facturas, setFacturas] = useState(conteos.facturas);
  const [recarga, setRecarga] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  const actualizar = useCallback(async () => {
    setActualizando(true);
    try {
      const r = await fetchJson<RespuestaDeActualizar>("/api/cobranza/odoo/actualizar", { method: "POST" });
      setCopia(r.corrida);
      setFacturas(r.facturas);
      if (r.estado === "FALLO") toast.error(r.mensaje);
      else if (r.estado === "COPIADO") toast.success(r.mensaje);
      else toast.info(r.mensaje);
      /* La vista se recarga también cuando no se volvió a leer Odoo: lo que otra persona cambió en Nexus sale igual.
         «Lo que no cuadra» abierta se recuenta sola al recargar; desde otra pestaña, su número se pide aparte. */
      setRecarga((n) => n + 1);
      if (tab !== "no-cuadra") recontarDiferencias();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar desde Odoo.");
    } finally {
      setActualizando(false);
    }
  }, [toast, recontarDiferencias, tab]);
  const vivos: Conteos = { ...conteos, ...emparejado, facturas, diferencias };

  return (
    <div className="space-y-4">
      <Tabs
        aria-label="Secciones de la integración con Odoo"
        variant="underline"
        value={tab}
        onChange={(k) => setTab(k as Pestana)}
        items={[
          { key: "que-es", label: "Cómo funciona", title: "Qué hace esta integración y qué no hace. Solo explica." },
          {
            key: "emparejar",
            label: "Emparejar",
            count: vivos.porEmparejar,
            title: "Decir qué cliente de Odoo es de cada cuenta de Nexus: así sus facturas caen en esa cuenta.",
          },
          {
            key: "no-cuadra",
            label: "Lo que no cuadra",
            count: vivos.diferencias,
            title: "Diferencias entre lo que Nexus planificó y lo que Odoo facturó, con dónde se arregla cada una.",
          },
          {
            key: "facturacion",
            label: "Facturación por cliente",
            title: "Lo facturado y cobrado de cada cliente por año, al lado de las ventas cerradas. Solo mira.",
          },
        ]}
      />

      {/* De cuándo es la copia, y el botón para traer lo último. Arriba de las tres pestañas: vale para las tres. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          {copia && <EstadoDelEspejo corrida={copia} facturas={facturas} puedeVerCorridas={puedeVerCorridas} />}
          {/* Si nunca corrió, el enlace igual sirve: ahí se ve la conexión y las banderas. */}
          {!copia && (
            <p className="text-xs text-fg-muted">
              Nexus todavía no copió nada de Odoo.{" "}
              {puedeVerCorridas && (
                <Link href="/integrations/odoo" className="text-brand underline hover:no-underline">
                  Ver el estado de la conexión →
                </Link>
              )}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => void actualizar()}
          disabled={actualizando}
          title="Trae ya las facturas y los clientes de Odoo, sin esperar a mañana. Solo lee Odoo: no cambia ningún cobro."
        >
          {actualizando ? "Leyendo Odoo…" : "Actualizar desde Odoo"}
        </Button>
      </div>

      {tab === "que-es" && <QueEs conteos={vivos} />}
      {tab === "emparejar" && (
        <EmparejadoOdoo puedeEditar={puedeEditar} recarga={recarga} onConteos={setEmparejado} onCambio={recontarDiferencias} />
      )}
      {tab === "no-cuadra" && (
        <DiferenciasOdoo
          puedeEditar={puedeEditar}
          recarga={recarga}
          onIrAEmparejar={() => setTab("emparejar")}
          onPendientes={alContarDiferencias}
        />
      )}
      {tab === "facturacion" && <FacturacionOdoo recarga={recarga} />}
    </div>
  );
}

/* ── La línea de arriba: de cuándo es la copia ──────────────────────────────────── */

/* En hora de Costa Rica: hasta el 2026-09-29 decía «12:00 UTC» para la copia de las 6 de la mañana. */
const cuando = (iso: string) => horaDeCostaRica(iso);
const hace = (horas: number | null) =>
  horas === null ? "" : horas < 1 ? "hace menos de una hora" : horas < 48 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} días`;

function EstadoDelEspejo({
  corrida,
  facturas,
  puedeVerCorridas,
}: {
  corrida: CorridaDelEspejo;
  facturas: number;
  puedeVerCorridas?: boolean;
}) {
  /* El historial completo: cuándo corrió cada vez, qué trajo, qué falló. Es donde se va cuando
     esta línea dice algo raro. */
  const enlace = puedeVerCorridas ? (
    <Link href="/integrations/odoo" className="text-brand underline hover:no-underline">
      Ver todas las corridas →
    </Link>
  ) : null;
  const sinTerminar = corrida.terminadaEn === null;
  const queFallo =
    !corrida.ok && !sinTerminar
      ? `La última copia (${cuando(corrida.iniciadaEn)}) ${corrida.parcial ? "quedó incompleta" : "falló"}${corrida.error ? `: ${corrida.error}` : "."}`
      : null;

  if (corrida.vencido) {
    return (
      <div
        role="alert"
        className="space-y-1 rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-ink"
      >
        <p className="font-semibold">
          {corrida.ultimaOkEn
            ? `⚠ La copia de Odoo está vieja: la última buena es del ${cuando(corrida.ultimaOkEn)} (${hace(corrida.horasDesdeLaUltimaBuena)}).`
            : "⚠ Ninguna copia de Odoo salió bien todavía."}
        </p>
        <p>
          Lo facturado en Odoo después no está acá: ni al lado de los cobros ni en «Lo que no cuadra».{" "}
          {queFallo ??
            (sinTerminar
              ? `Hay una copia sin terminar desde el ${cuando(corrida.iniciadaEn)}.`
              : "No se volvió a copiar desde entonces.")}{" "}
          «Actualizar desde Odoo» la vuelve a intentar ahora.
        </p>
        {enlace && <p>{enlace}</p>}
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
      {corrida.ultimaOkEn && (
        <span title="Hora de Costa Rica. La copia se hace sola cada mañana, desde las 6, y cada vez que alguien aprieta «Actualizar desde Odoo».">
          Copia de Odoo del {cuando(corrida.ultimaOkEn)}
          {corrida.horasDesdeLaUltimaBuena !== null && ` (${hace(corrida.horasDesdeLaUltimaBuena)})`} · {facturas} facturas
        </span>
      )}
      {queFallo && <span className="text-danger-ink">· ⚠ {queFallo}</span>}
      {sinTerminar && (
        <span className="text-warn-ink">· la copia del {cuando(corrida.iniciadaEn)} sigue sin terminar</span>
      )}
      {enlace}
    </p>
  );
}

/* ── La pestaña que explica ──────────────────────────────────────────────────────── */

function QueEs({ conteos }: { conteos: Conteos }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Para qué existe</h2>
        <p className="mt-2 text-sm text-fg-secondary">
          Hasta ahora la misma información vivía en cuatro lugares: el banco, Odoo, Nexus y una hoja de cálculo.
          Cuando se emitía una factura había que anotarla en Odoo y volver a Nexus a marcar el cobro como facturado.
          Cuando entraba un pago, lo mismo. Nadie hacía nada mal — simplemente los dos sistemas no se hablaban, y la
          única conexión entre ellos era una persona copiando datos.
        </p>
        <p className="mt-2 text-sm text-fg-secondary">
          El costo caro no era el tiempo: era que <strong className="text-fg">los dos sistemas se separaban sin que
          nadie se enterara</strong>. Nexus podía decir que un cliente debe plata que ya pagó, y eso subía hasta la
          reunión de dirección.
        </p>
        <p className="mt-2 text-sm text-fg-secondary">
          Ahora Nexus lee Odoo cada mañana —cuando la copia automática está encendida en el servidor—, y otra vez cada
          vez que alguien aprieta «Actualizar desde Odoo», y pone las facturas reales al lado de los cobros de las
          cuentas emparejadas. Lo que no coincide aparece en una lista, con su monto y con quién lo puede cerrar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-success-line bg-success-surface p-5">
          <h3 className="text-sm font-semibold text-success-ink">Lo que sí hace</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">
            <li>· Trae las facturas de venta y la lista de clientes de Odoo, cada mañana y cuando se lo pides con «Actualizar desde Odoo».</li>
            <li>· En las cuentas emparejadas, las muestra al lado del cobro que les corresponde, con su número y su estado real.</li>
            <li>· Lista lo que no cuadra, ordenado por la plata que mueve.</li>
            <li>· Guarda el monto sin impuesto y el total, porque los cobros de Nexus están cargados sin IVA.</li>
          </ul>
        </div>

        {/* ⛔ Estas dos son LAS preguntas que aparecen siempre. Van grandes y en negativo. */}
        <div className="rounded-lg border border-danger-line bg-danger-surface p-5">
          <h3 className="text-sm font-semibold text-danger-ink">Lo que NO hace, a propósito</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">
            <li>
              · <strong className="text-fg">Nunca escribe en Odoo.</strong> Ni una línea. Es solo lectura, siempre.
            </li>
            <li>
              · <strong className="text-fg">Nunca marca un cobro como cobrado.</strong> Puede mostrar que Odoo dice
              que la factura está pagada, pero pasar un cobro a verde lo sigue haciendo una persona con nombre.
            </li>
            <li>· Nunca convierte moneda: si el cobro está en dólares y la factura en colones, muestra las dos.</li>
            <li>· No reemplaza el plan de pago. Odoo no sabe en cuántas cuotas se le cobra a cada cliente; eso vive acá.</li>
            <li>
              · Desestimar una fila no toca el cobro ni Odoo: solo la saca de la lista. Y «Está en
              Mercury» cambia la vía de cobro de la cuenta en Nexus, no en Odoo.
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Cómo se usa</h2>
        <ol className="mt-2 space-y-2 text-sm text-fg-secondary">
          <li>
            <strong className="text-fg">1. Emparejar, una sola vez.</strong> Dile a Nexus qué cliente de Odoo
            corresponde a cada cuenta. Hace falta porque Nexus guarda el nombre comercial («Iberorutas») y Odoo la
            razón social («Servicios San Mateo y Santa Elena del Sur S.A.»), y no se parecen. Al confirmar, las
            facturas de ese cliente pasan a la cuenta en el momento, y se guarda la cédula para que la próxima vez
            se sostenga solo. Queda por emparejar toda cuenta que factura por Odoo y todavía no tiene su cliente de
            Odoo: ese es el número de la pestaña. Las que facturan por Mercury o QuickBooks no cuentan.
          </li>
          <li>
            <strong className="text-fg">2. Revisar lo que no cuadra.</strong> Cada línea dice cuánta plata mueve, en
            qué sistema se arregla y los pasos. Lo que ya revisaste y no es un problema se desestima fila por fila, con
            su motivo; lo que hay que corregir en Nexus, con «Abrir la cuenta».
          </li>
          <li>
            <strong className="text-fg">3. Mirar de cuándo es la copia.</strong> La copia de Odoo se hace sola cada mañana,
            desde las 6. La línea de arriba de estas pestañas dice de cuándo es la última copia buena, en hora de Costa
            Rica; si falla o deja de hacerse, se pone en rojo. Mientras esté en rojo, lo facturado después no está acá.
          </li>
          <li>
            <strong className="text-fg">4. Traer lo último cuando haga falta.</strong> Si acabas de registrar algo en
            Odoo —un pago, una factura, un cliente nuevo—, «Actualizar desde Odoo», arriba a la derecha, lo copia en el
            momento y recarga la pestaña que estás mirando. Un cobro en Cobrado cuya factura ya figura pagada en Odoo
            sale de «Lo que no cuadra» con esa copia. Si sigue ahí, es que en Odoo el pago todavía no está aplicado a
            esa factura.
          </li>
        </ol>
      </div>

      {/* ⭐ 2026-09-25: lo que cambió en esta pantalla ese día, explicado para quien la abre cada varias semanas. Cada
          bloque responde una pregunta que aparece siempre: «¿dónde quedó esta cuenta?», «¿dónde quedó lo que
          marqué?», «¿por qué este número no es el de la semana pasada?» y «¿por qué esta factura no está?». */}
      <Bloque titulo="Las cuentas que facturan por Mercury">
        <li>
          · En su tarjeta de «Emparejar», <strong className="text-fg">«Está en Mercury»</strong> pasa su vía de cobro
          a Mercury en todo Cobranza, también en su ficha, con tu nombre y la fecha. La cuenta sale de la lista y del
          número de la pestaña en el momento.
        </li>
        <li>
          · Desde ahí Nexus no le busca cliente en Odoo, no le ofrece facturas de Odoo al marcar un cobro como
          facturado y no compara sus cobros con Odoo. Lo que no depende de Odoo sigue: «falta anotar el número de
          Mercury» y «venta contada dos veces».
        </li>
        <li>
          · La lista <strong className="text-fg">«En Mercury»</strong>, debajo de las tarjetas, se abre con un clic y
          dice quién marcó cada cuenta y cuándo. Las que ya decían Mercury desde la importación o desde su alta
          aparecen «sin firma», para que alguien las confirme o las deshaga.
        </li>
        <li>
          · <strong className="text-fg">«Deshacer»</strong> devuelve la vía a Odoo, y la cuenta vuelve a «Emparejar»
          con todo lo que tenía. Sirve también el día que una cuenta pase a facturar por Odoo.
        </li>
        <li>
          · No se marca una cuenta que ya tiene su cliente de Odoo: sus facturas vienen de Odoo. Primero se desvincula
          ese cliente en «Ya vinculadas».
        </li>
        <li>· QuickBooks no tiene botón: se elige en la ficha de la cuenta, y la cuenta también sale de «Emparejar».</li>
      </Bloque>

      {/* ⭐ 2026-09-29, revisión con Alex: lo que «Emparejar» hace con un cliente de Odoo que no tiene cuenta en Nexus.
          «Lo que no cuadra» mandaba a emparejar a Publimark y a McCann, y en «Emparejar» no aparecían por ningún lado. */}
      <Bloque titulo="Los clientes de Odoo que todavía no tienen cuenta en Nexus">
        <li>
          · «Emparejar» los muestra aparte, con lo que Odoo les tiene por cobrar. Son los de la línea de «Lo que no
          cuadra» de las facturas de Odoo por cobrar que no están en ninguna cuenta de Nexus, con la misma cifra.
        </li>
        <li>
          · Cada uno tiene dos salidas: <strong className="text-fg">«Es de una cuenta de Nexus»</strong> lo vincula a
          una cuenta que ya existe, y sus facturas pasan a ella en el momento;{" "}
          <strong className="text-fg">«No es cliente nuestro»</strong> lo saca de la lista y lo deja en «Marcados como
          no clientes», al final, donde «Sí es cliente» lo devuelve. Si la empresa todavía no tiene cuenta, se crea en
          Cobranza, con «Nueva empresa».
        </li>
        <li>
          · Un cliente de Odoo va en una sola cuenta, y una cuenta puede tener varios. Si la empresa ya tiene su cuenta
          y contrata algo más, el servicio nuevo se agrega en esa misma cuenta: no hay que desvincular nada.
        </li>
        <li>
          · Un cliente nuevo de Odoo entra a la lista con la copia siguiente, aunque todavía no tenga facturas. Si no
          aparece, «Buscar directamente en Odoo», en el buscador de cada cuenta, lo encuentra por nombre o por cédula.
        </li>
        <li>
          · Los contactos que Odoo crea para mandar copia de la factura —los del correo 2 y el correo 3 de un cliente—
          no son clientes y no entran a la lista.
        </li>
        <li>
          · Una cuenta nueva nace con la vía de su clasificación: nacional, Odoo; internacional, Mercury. Se cambia en
          su ficha, y la que pasa a Odoo vuelve sola a «Emparejar».
        </li>
      </Bloque>

      {/* ⭐ 2026-09-30, punto 8 de la revisión con Alex: la historia de facturación por cliente. */}
      <Bloque titulo="Facturación por cliente">
        <li>
          · Lo facturado, lo cobrado y lo por cobrar de cada cliente en el año que elijas, de la copia de Odoo, con la
          factura más reciente arriba. La copia trae todos los años que tiene Odoo, también los que vinieron de Factum.
        </li>
        <li>
          · Al lado, las ventas cerradas en HubSpot ese año, de la empresa de cada cuenta. Es una guía y no un cuadre:
          una venta de diciembre se factura en enero. Un cliente de Odoo sin cuenta en Nexus no tiene con qué cruzarse.
        </li>
        <li>· Solo mira: no cambia nada, ni en Nexus ni en Odoo.</li>
      </Bloque>

      <Bloque titulo="«Desestimar» y «Abrir la cuenta», fila por fila">
        <li>
          · <strong className="text-fg">«Desestimar» solo quita la fila de la lista.</strong> No cambia cobros,
          cuentas ni facturas, ni en Nexus ni en Odoo: si lo que la fila acusa hay que arreglarlo, se arregla donde dice
          su línea. Si es de una cuenta, «Abrir la cuenta» lleva a Cobranza con esa cuenta abierta.
        </li>
        <li>
          · Cada fila de «Lo que no cuadra» tiene su «Desestimar», con motivo, y te propone el último motivo que
          usaste. El botón de la línea desestima una por una las filas que ves, con el mismo motivo.
        </li>
        <li>
          · Se marca con los números que ves. Si una fila cambió antes de tu clic —por ejemplo, porque llegó una copia
          nueva de Odoo—, esa no se marca y te avisa; las demás sí.
        </li>
        <li>
          · <strong className="text-fg">Vuelve sola si cambia uno de sus números</strong>: un monto, un saldo, un
          estado o el número del documento. Vuelve a su línea diciendo que volvió y con qué marca. Que Odoo cambie el
          nombre de un cliente no trae nada de vuelta.
        </li>
        <li>
          · Vale solo en esa línea: si el mismo documento aparece en otra, ahí sigue a la vista. En las filas que juntan
          varias facturas de un cliente, la marca queda en cada factura, así que una factura nueva de ese cliente
          aparece sola, sin traer las ya revisadas.
        </li>
        <li>
          · <strong className="text-fg">«Desestimadas»</strong>, al final de la pestaña, muestra todo lo desestimado con su
          motivo, quién y cuándo, y «Deshacer». Sigue ahí aunque la línea se quede sin filas. Deshacer también queda
          anotado: ninguna marca se borra.
        </li>
        <li>
          · «Ya está anulada», en las facturas soltadas que ninguna copia puede verificar, también pide motivo y también
          se deshace desde «Desestimadas».
        </li>
        <li>· Desestimar o marcar «Está en Mercury», y deshacerlos, piden permiso para editar Cobranza.</li>
      </Bloque>

      <Bloque titulo="Cómo se cuenta lo pendiente">
        <li>
          · Cada línea muestra, cuenta y suma solo sus filas pendientes. Si se queda sin ninguna, sale de la lista; lo
          que tenía desestimado sigue en «Desestimadas».
        </li>
        <li>
          · El número de la pestaña y «cosas por resolver» cuentan{" "}
          <strong className="text-fg">filas pendientes</strong>, no líneas, y bajan apenas marcas una, sin recargar
          la página.
        </li>
        <li>
          · Lo que corriges en Nexus sale la próxima vez que abres la pestaña. Lo que se corrige en Odoo sale con la
          próxima copia de Odoo: la de la mañana, o la que pides con «Actualizar desde Odoo».
        </li>
        <li>
          · La suma de arriba va por moneda y sin IVA, y cuenta cada documento una sola vez aunque lo miren varias
          líneas.
        </li>
        <li>· «Ocultar» solo pliega la lista de una línea en tu pantalla: no saca filas ni cambia ningún número.</li>
      </Bloque>

      {/* ⚠ Estas reglas viven en lib/cobranza/odoo/diferencias.ts. Si una cambia allá, cambia acá: la guarda de
          «Cómo funciona» en guardas.test.ts pide que cada una siga nombrada. */}
      <Bloque
        titulo="Lo que queda fuera por regla, y por qué"
        intro="Hay cosas que no van a cuadrar nunca y no son un problema. No son filas: no se marcan ni cuentan en la pestaña. La línea donde caerían dice cuántas dejó fuera."
      >
        <li>
          · <strong className="text-fg">Historia.</strong> Facturas ya pagadas de antes del primer cobro que Nexus
          tiene de su cuenta, o de años anteriores si la cuenta no tiene cobros. Son de antes de que Nexus planificara
          la cuenta: no hay cobro que las explique ni plata que cobrar. ⚠ Una factura que Odoo sigue dando por cobrar
          nunca es historia, sea del año que sea.
        </li>
        <li>
          · <strong className="text-fg">Exentas de años anteriores.</strong> Solo se revisan las facturas sin impuesto
          del año de la última copia de Odoo. Las de antes eran casi todas historia ya pagada, y la pregunta que importa
          —si al cliente le faltó el IVA— es sobre lo que se está cobrando ahora.
        </li>
        <li>
          · <strong className="text-fg">Pagadas sin cuenta.</strong> Facturas ya pagadas de clientes de Odoo que no
          están emparejados, y también sus notas de crédito y los documentos anulados. No son plata por cobrar. Al
          emparejar el cliente pasan a su cuenta y se cruzan como las demás. Un cliente sin emparejar que solo tiene de
          estas no aparece en «Lo que no cuadra».
        </li>
        <li>
          · <strong className="text-fg">Diferencias de exactamente el {IVA_EN_PORCENTAJE} %.</strong> Es el IVA:
          Nexus guarda los cobros sin IVA, y si la factura dice lo mismo con IVA (o al revés) no falta plata. Lo decidió
          Alex.
        </li>
        <li>
          · <strong className="text-fg">Lo recién facturado.</strong> Un
          cobro marcado facturado en los {DIAS_DE_GRACIA_DEL_ESPEJO} días antes de la última copia buena de Odoo, o
          después, todavía puede no estar en la copia. Si pasado ese plazo sigue sin factura, recién ahí se acusa.
        </li>
      </Bloque>

      {/* ⚠ Esta tabla existe porque la pantalla muestra «pagada, falta conciliar» en cada
          cobro y nunca decía qué significa. El vocabulario es de Odoo, no del negocio, y
          quien lo lee no tiene por qué conocerlo. */}
      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Qué quiere decir cada estado</h2>
        <p className="mt-1 text-sm text-fg-secondary">
          Odoo le hace a cada factura una sola pregunta: <em>¿cuánto de esto ya se saldó, y cómo?</em> Hay cinco
          respuestas posibles, y Nexus las muestra tal cual vienen.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="py-1.5 pr-4 font-medium">Odoo dice</th>
                <th className="py-1.5 pr-4 font-medium">En cristiano</th>
                <th className="py-1.5 font-medium">¿Entró la plata?</th>
              </tr>
            </thead>
            <tbody>
              <Estado codigo="not_paid" que="Sin pagar. Se emitió y no entró nada." plata="No" />
              <Estado codigo="partial" que="Pagada a medias. Entró una parte." plata="En parte" />
              <Estado
                codigo="in_payment"
                que="Pagada, falta cuadrarla con el banco. Está registrado que el cliente pagó, pero nadie ató todavía ese pago a la línea del extracto."
                plata="Sí"
              />
              <Estado codigo="paid" que="Pagada y cuadrada contra el extracto bancario." plata="Sí" />
              <Estado
                codigo="reversed"
                que="Saldada, pero con una nota de crédito. La factura ya no debe nada porque se anuló, no porque alguien pagara."
                plata="NO"
                alerta
              />
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fg-muted">
          ⚠ <strong className="text-fg">«Saldo cero» no es lo mismo que «cobrada».</strong> Las anuladas por nota de
          crédito también quedan en cero, y ahí no entró un peso. Por eso Nexus las trata aparte y nunca las propone
          como cobradas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Dato n={conteos.facturas} etiqueta="facturas copiadas de Odoo" pie="Solo lectura desde Odoo." />
        <Dato
          n={conteos.cuentasVinculadas}
          de={conteos.cuentas}
          etiqueta="cuentas emparejadas"
          pie={pieDelEmparejado(conteos)}
        />
        <Dato
          n={conteos.diferencias}
          etiqueta="cosas por resolver"
          pie="Las filas pendientes de «Lo que no cuadra», ordenadas por la plata que mueven. Lo desestimado no cuenta."
        />
      </div>
    </div>
  );
}

/** Un bloque de «Cómo funciona»: un título, una frase opcional y una lista de puntos. */
function Bloque({ titulo, intro, children }: { titulo: string; intro?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      {intro && <p className="mt-1 text-sm text-fg-secondary">{intro}</p>}
      <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">{children}</ul>
    </div>
  );
}

/** El pie del dato de «Cómo funciona»: cuántas faltan y cuántas no se emparejan porque facturan por otra vía. */
function pieDelEmparejado(c: ConteosEmparejado): string {
  const partes = [
    c.porEmparejar > 0 ? `Faltan ${c.porEmparejar}: no pueden mostrar sus facturas.` : "No falta ninguna por emparejar.",
  ];
  if (c.enMercury > 0) partes.push(`${c.enMercury} facturan por Mercury y no se emparejan.`);
  if (c.enOtra > 0) partes.push(`${c.enOtra} facturan por QuickBooks y tampoco.`);
  return partes.join(" ");
}

function Estado({
  codigo,
  que,
  plata,
  alerta,
}: {
  codigo: string;
  que: string;
  plata: string;
  alerta?: boolean;
}) {
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
