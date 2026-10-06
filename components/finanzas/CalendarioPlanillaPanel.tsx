"use client";

/**
 * components/finanzas/CalendarioPlanillaPanel.tsx
 *
 * El año de planilla, PERSONA POR PERSONA: sus 24 quincenas, lo que se le pagó y lo que
 * falta pagarle. Y desde acá se edita el salario, que es donde uno decide un aumento.
 *
 * ⚠ ES OTRO EJE DEL MISMO DATO, no una segunda verdad. El libro (`/historial`) agrupa
 * por mes y quincena —la lectura de "qué sale esta quincena"— y esto lo transpone: una
 * persona, su año entero. Las dos leen las mismas filas de `PagoPlanilla`. Es el mismo par
 * que la cola de cobros y el panel de cartera.
 *
 * ── LA TABLA SE EDITA (2026-10-06, pedido de Alex) ──────────────────────────────
 * «Que le permita editar los espacios que estaban en blanco, para que Nexus recalcule».
 * Una casilla «falta» se llena con lo que se pagó y queda PAGADA en la fecha de esa
 * quincena, a nombre de quien la anota (`anotarQuincenaPagada`). Una «sin pagar» corrige
 * su monto y, si ya pasó, se marca pagada. Las dos escriben por las MISMAS rutas que el
 * libro, y pagar sigue pasando por el chokepoint de INV18. Una pagada no se toca.
 *
 * ── LAS CINCO CLASES, Y POR QUÉ NO SE FUNDEN ────────────────────────────────────
 * Cada casilla es una de cinco cosas y cada una pide algo distinto de quien la mira.
 * Fundirlas ahorraría colores y perdería la información:
 *
 *   pagada      ya salió la plata
 *   anotada     está en el libro y todavía no se paga
 *   proyectada  no ocurrió — estimación al salario vigente en ESA quincena
 *   falta       ocurrió, la persona estaba, y nadie la anotó   ← lo accionable
 *   no estaba   hay una baja o una pausa que lo apaga
 *   sin dato    el catálogo no llega tan atrás. NO es "no estaba"
 *
 * ── POR QUÉ LAS CASILLAS NO REPITEN SU ESTADO EN TEXTO ──────────────────────────
 * La primera versión escribía "pagada"/"proyectada" abajo de cada monto: veinticuatro
 * repeticiones de dos palabras, por persona. Eso no informa — compite. La clase la lleva
 * el ESTILO, con una leyenda arriba que se lee una vez, y el texto queda reservado para
 * las casillas excepcionales (falta anotar, anotada sin pagar), que son las accionables.
 *
 * Lo que sí se resalta es DÓNDE CAMBIA EL MONTO. Con quince casillas iguales seguidas, el
 * dato es el escalón, no cada peldaño.
 */
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarioPersonaDTO, CostoRecurrenteDTO } from "@/lib/cobranza";
import type { ClaseQuincena } from "@/lib/cobranza/calendario-planilla";
import { montoQuincena } from "@/lib/cobranza/engine";
import { parseMontoLocal } from "@/lib/cobranza/import-core";
import { inicioDeQuincena } from "@/lib/cobranza/planilla";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import CostoForm from "@/components/cobranza/CostoForm";
import { PageHeader, EmptyState } from "@/components/ui";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Cómo se ve cada clase. El texto es el de la leyenda, no el de cada casilla.
 *
 * ⚠ `registrada` va con `bg-surface-hover` y NO con `bg-surface`, que es lo que parece
 * correcto por el nombre. La tarjeta que las contiene YA ES `bg-surface`, así que una casilla
 * con ese mismo token no se lee como llena — se funde con el fondo. Y `surface-muted`, el
 * candidato obvio, es idéntico a `surface` en el tema oscuro; se verificó en pantalla. La
 * única que tiene contraste real contra la tarjeta en los DOS temas es `surface-hover`.
 *
 * Que lo pagado se vea LLENO y lo proyectado VACÍO es la lectura principal de la vista: dónde
 * termina lo que ya ocurrió. Con las dos del mismo tono, esa frontera hay que buscarla.
 */
const CLASE: Record<ClaseQuincena, { label: string; cls: string; vacio: string }> = {
  registrada: { label: "En el libro", cls: "border-line bg-surface-hover text-fg", vacio: "" },
  proyectada: {
    label: "Proyectada",
    cls: "border-line border-dashed bg-transparent text-fg-secondary",
    vacio: "",
  },
  faltante: {
    label: "Falta anotar",
    cls: "border-warn-line bg-warn-surface text-warn-ink",
    vacio: "",
  },
  // Las dos "acá no pasó nada" pierden el borde y el fondo: no pueden competir con un
  // monto. Se distinguen entre sí por el glifo, y la leyenda dice cuál es cuál.
  fuera: { label: "No estaba", cls: "border-transparent bg-transparent text-fg-muted", vacio: "–" },
  sinDato: { label: "Sin dato", cls: "border-transparent bg-transparent text-fg-muted", vacio: "·" },
};

const ORDEN_LEYENDA: ClaseQuincena[] = ["registrada", "proyectada", "faltante", "fuera", "sinDato"];

type Quincena = CalendarioPersonaDTO["quincenas"][number];

/** Se escribe a mano: la que falta (se anota pagada) y la anotada sin pagar (se corrige). Una pagada, nunca. */
function seEdita(q: Quincena): boolean {
  return q.clase === "faltante" || (q.clase === "registrada" && q.estado !== "PAGADO" && q.pagoId !== null);
}

const claveDe = (q: Pick<Quincena, "periodo" | "quincena">) => `${q.periodo}-${q.quincena}`;

export default function CalendarioPlanillaPanel({
  personas,
  salarios,
  anio,
  todayISO,
}: {
  personas: CalendarioPersonaDTO[];
  /** Los costos de SALARIO, para poder editarlos sin salir de acá. */
  salarios: CostoRecurrenteDTO[];
  anio: number;
  /** Hoy, por parámetro: el módulo puro no lee el reloj. */
  todayISO: string;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(personas[0]?.teamMemberId ?? null);
  const [soloConPendientes, setSoloConPendientes] = useState(false);
  /** Qué costo se está editando y con qué fecha efectiva abrir «Rige desde». */
  const [editando, setEditando] = useState<{ costo: CostoRecurrenteDTO; desde?: string } | null>(null);

  const visibles = useMemo(
    () => (soloConPendientes ? personas.filter((p) => p.faltantes > 0) : personas),
    [personas, soloConPendientes],
  );
  const pendientes = personas.reduce((n, p) => n + p.faltantes, 0);
  const costoDe = useMemo(
    () => new Map(salarios.filter((c) => c.teamMemberId).map((c) => [c.teamMemberId!, c])),
    [salarios],
  );

  return (
    <div>
      <PageHeader recorrido="finanzas-planilla-calendario"
        title={`Calendario de planilla ${anio}`}
        description="El año de cada persona, quincena por quincena. Lo que se le pagó sale del libro y no se toca; lo que falta se proyecta al salario que rige en esa fecha."
      />

      {/* Un aumento no reescribe el pasado, y conviene decirlo antes de que alguien lo
          note por su cuenta mirando dos montos distintos en la misma columna. */}
      <div data-recorrido="fin.calendario.aumento" className="rounded-lg border border-line bg-surface-muted px-3 py-2 mb-3">
        <p className="text-[11px] text-fg-muted">
          Un aumento rige <strong className="text-fg-secondary">desde su fecha efectiva hacia adelante</strong>: las
          quincenas ya anotadas conservan el monto viejo, porque es lo que se pagó. La proyección no se
          guarda: se recalcula sola cada vez que se abre.
        </p>
      </div>

      {pendientes > 0 && (
        <div data-recorrido="fin.calendario.pendientes" className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-warn-ink">
            <strong className="font-medium">
              {pendientes} quincena{pendientes === 1 ? "" : "s"} sin anotar
            </strong>{" "}
            — ya ocurrieron, la persona estaba, y no están en el libro. Haz clic en cada casilla «falta» y
            escribe lo que se pagó: el aguinaldo y el punto de equilibrio se recalculan solos.
          </p>
          <button
            type="button"
            onClick={() => setSoloConPendientes((v) => !v)}
            className="ml-auto text-[11px] px-2 py-1 rounded-md border border-warn-line text-warn-ink hover:bg-warn-surface"
          >
            {soloConPendientes ? "Ver a todos" : "Ver solo esas personas"}
          </button>
        </div>
      )}

      {visibles.length === 0 ? (
        <EmptyState title="Nadie con quincenas sin anotar" description="El libro está al día para este año." />
      ) : (
        <div className="space-y-1.5">
          {visibles.map((p) => (
            <FilaDePersona
              key={p.teamMemberId}
              persona={p}
              anio={anio}
              todayISO={todayISO}
              abierto={abierta === p.teamMemberId}
              onToggle={() => setAbierta(abierta === p.teamMemberId ? null : p.teamMemberId)}
              costo={costoDe.get(p.teamMemberId) ?? null}
              onEditar={(desde) => {
                const c = costoDe.get(p.teamMemberId);
                if (c) setEditando({ costo: c, desde });
              }}
              onGuardado={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {editando && (
        <CostoForm
          costo={editando.costo}
          categoriaInicial="SALARIO"
          todayISO={todayISO}
          fechaEfectivaInicial={editando.desde}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            // La proyección es DERIVADA: no hay estado local que sincronizar, se vuelve a
            // pedir el año y las casillas futuras salen ya con el monto nuevo.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FilaDePersona({
  persona: p,
  anio,
  todayISO,
  abierto,
  onToggle,
  costo,
  onEditar,
  onGuardado,
}: {
  persona: CalendarioPersonaDTO;
  anio: number;
  todayISO: string;
  abierto: boolean;
  onToggle: () => void;
  costo: CostoRecurrenteDTO | null;
  onEditar: (desde?: string) => void;
  /** Algo se escribió en el libro: el calendario se vuelve a pedir (es derivado, no hay estado local). */
  onGuardado: () => void;
}) {
  const toast = useToast();
  const moneda = p.moneda as "CRC" | "USD";
  /** La casilla que se está escribiendo (su clave) y lo que lleva el campo. */
  const [sel, setSel] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  /**
   * Las quincenas donde el monto CAMBIA respecto de la anterior con dato.
   *
   * Es la única casilla que vale la pena mirar de cerca en una fila de veinticuatro: quince
   * iguales seguidas no informan quince veces. Se compara contra la anterior CON MONTO —
   * saltando las vacías— para que un mes sin dato en el medio no invente un escalón.
   */
  const escalones = useMemo(() => {
    const m = new Map<string, "sube" | "baja">();
    let previo: number | null = null;
    for (const q of p.quincenas) {
      if (q.monto === null) continue;
      if (previo !== null && q.monto !== previo) {
        m.set(`${q.periodo}-${q.quincena}`, q.monto > previo ? "sube" : "baja");
      }
      previo = q.monto;
    }
    return m;
  }, [p.quincenas]);

  const porClave = useMemo(
    () => new Map(p.quincenas.map((q) => [`${q.periodo}-${q.quincena}`, q])),
    [p.quincenas],
  );

  // Tras guardar, el calendario vuelve del servidor: si la casilla ya no se edita (quedó pagada), se suelta sola.
  const elegida = sel ? (porClave.get(sel) ?? null) : null;
  const abiertaParaEditar = elegida && seEdita(elegida) ? elegida : null;

  function abrir(q: Quincena) {
    setSel(claveDe(q));
    // La que falta trae de sugerencia la quincena del salario que regía; la anotada, su monto. Se reemplaza al escribir.
    setValor(String(q.clase === "faltante" ? (q.sugerido ?? "") : (q.monto ?? "")));
  }

  /** «Anotar y pasar a la siguiente»: llenar los huecos de un año es una tanda, no un clic suelto. */
  function siguienteQueFalta(q: Quincena): Quincena | null {
    const i = p.quincenas.findIndex((x) => claveDe(x) === claveDe(q));
    return p.quincenas.slice(i + 1).find((x) => x.clase === "faltante") ?? null;
  }

  async function guardar(comoPagada: boolean) {
    const q = abiertaParaEditar;
    if (!q || guardando) return;
    const n = parseMontoLocal(valor);
    if (n === null || !(n > 0)) {
      toast.error("Escribe un monto mayor que cero.");
      return;
    }
    const json = { "Content-Type": "application/json" };
    setGuardando(true);
    try {
      if (q.clase === "faltante") {
        await fetchJson("/api/cobranza/costos/pagos-planilla/anotar", {
          method: "POST",
          headers: json,
          body: JSON.stringify({ teamMemberId: p.teamMemberId, periodo: q.periodo, quincena: q.quincena, monto: n }),
        });
        toast.success(`Anotada: ${fmtMonto(n, moneda)}, pagada el ${fmtFecha(q.fechaProgramada)} a tu nombre.`);
      } else {
        if (n !== q.monto) {
          await fetchJson(`/api/cobranza/costos/pagos-planilla/${q.pagoId}`, {
            method: "PATCH",
            headers: json,
            body: JSON.stringify({ monto: n }),
          });
        }
        if (comoPagada) {
          await fetchJson(`/api/cobranza/costos/pagos-planilla/${q.pagoId}/pagar`, {
            method: "PUT",
            headers: json,
            body: JSON.stringify({ fechaPago: q.fechaProgramada }),
          });
        }
        toast.success(comoPagada ? `Pagada el ${fmtFecha(q.fechaProgramada)} a tu nombre.` : "Monto corregido.");
      }
      const sig = siguienteQueFalta(q);
      if (sig) abrir(sig);
      else setSel(null);
      onGuardado();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar. Recarga la página e inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section data-recorrido="fin.calendario.persona" className="rounded-xl border border-line bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="w-full text-left px-4 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 hover:bg-surface-hover transition-colors"
      >
        <span className="text-sm font-medium text-fg">{p.nombre}</span>
        {/* La casilla dice $600 y el encabezado $1.200: sin esta línea la relación hay que
            adivinarla, y el primer reflejo es pensar que uno de los dos está mal. */}
        <span className="text-[11px] text-fg-muted">
          {p.salarioActual !== null ? (
            <>
              {fmtMonto(p.salarioActual, moneda)} al mes
              <span className="text-fg-muted/70">
                {" · "}
                {fmtMonto(montoQuincena(p.salarioActual, 1), moneda)} por quincena
              </span>
            </>
          ) : (
            "ya no está en planilla"
          )}
        </span>
        {p.faltantes > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-warn-line bg-warn-surface text-warn-ink">
            {p.faltantes} sin anotar
          </span>
        )}
        <span className="ml-auto text-[11px] tabular-nums whitespace-nowrap">
          <span className="text-fg-secondary font-medium">{fmtMonto(p.totalRegistrado, moneda)}</span>
          <span className="text-fg-muted"> en el libro</span>
          {p.totalProyectado > 0 && (
            <span className="text-fg-muted">
              {" · "}
              {fmtMonto(p.totalProyectado, moneda)} por venir
            </span>
          )}
        </span>
      </button>

      {abierto && (
        <div className="border-t border-line px-4 py-3 space-y-3">
          {/* Los cambios de salario del año: la explicación de por qué el monto de la grilla
              cambia a mitad de año. Al lado, el botón que los produce. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {p.cambios.map((c, i) => (
              <span key={i} className="text-[11px] text-fg-muted">
                <span className="text-fg-secondary tabular-nums">{fmtFecha(c.fecha)}</span>{" "}
                {c.tipo === "CAMBIO_MONTO" && c.de !== null && c.a !== null
                  ? `aumento de ${fmtMonto(c.de, moneda)} a ${fmtMonto(c.a, moneda)}`
                  : c.tipo === "ALTA"
                    ? `entra a planilla${c.a !== null ? ` con ${fmtMonto(c.a, moneda)}` : ""}`
                    : c.tipo === "BAJA"
                      ? "sale de planilla"
                      : c.tipo.toLowerCase()}
              </span>
            ))}
            {costo && (
              <button
                type="button"
                onClick={() => onEditar()}
                className="ml-auto text-[11px] px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
              >
                Editar salario
              </button>
            )}
          </div>

          {/* La leyenda se lee UNA vez y libera a las 24 casillas de repetir su estado. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {ORDEN_LEYENDA.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[10px] text-fg-muted">
                <span
                  aria-hidden
                  className={`inline-flex h-3.5 w-5 items-center justify-center rounded-[3px] border text-[9px] leading-none ${CLASE[k].cls}`}
                >
                  {CLASE[k].vacio}
                </span>
                {CLASE[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[10px] text-fg-muted">
              <span aria-hidden className="text-brand font-semibold">
                ↑↓
              </span>
              acá cambia el monto
            </span>
            <span className="text-[10px] text-fg-muted/80">
              · clic en una casilla «falta» o «sin pagar» para escribir el monto
              {costo && ", o en una proyectada para fijar un aumento desde ahí"}
            </span>
          </div>

          {/* Doce meses × dos quincenas. Una línea por casilla: el monto y nada más. */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[auto_repeat(12,minmax(64px,1fr))] gap-x-1 gap-y-0.5 min-w-[860px]">
              <div />
              {MES_CORTO.map((m) => (
                <div key={m} className="text-[10px] uppercase tracking-wide text-fg-muted text-center pb-0.5">
                  {m}
                </div>
              ))}
              {([1, 2] as const).map((q) => (
                <Fragment key={q}>
                  <div className="text-[10px] uppercase tracking-wide text-fg-muted pr-2 flex items-center whitespace-nowrap">
                    {q === 1 ? "1–15" : "16–fin"}
                  </div>
                  {MES_CORTO.map((_, i) => {
                    const periodo = `${anio}-${String(i + 1).padStart(2, "0")}`;
                    const cel = porClave.get(`${periodo}-${q}`);
                    if (!cel) return <div key={`${q}-${i}`} />;
                    return (
                      <Casilla
                        key={`${q}-${i}`}
                        cel={cel}
                        moneda={moneda}
                        esHoy={cel.fechaProgramada === todayISO}
                        escalon={escalones.get(`${periodo}-${q}`) ?? null}
                        elegida={abiertaParaEditar !== null && claveDe(abiertaParaEditar) === claveDe(cel)}
                        onClic={
                          seEdita(cel)
                            ? () => abrir(cel)
                            : costo && cel.clase === "proyectada"
                              ? () => onEditar(inicioDeQuincena(periodo, q))
                              : null
                        }
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          {abiertaParaEditar && (
            <EditorDeQuincena
              q={abiertaParaEditar}
              moneda={moneda}
              todayISO={todayISO}
              valor={valor}
              onValor={setValor}
              guardando={guardando}
              onGuardar={guardar}
              onCancelar={() => setSel(null)}
            />
          )}

          <p className="text-[11px] text-fg-muted">
            {p.registradas} en el libro · {p.proyectadas} proyectadas
            {p.faltantes > 0 && ` · ${p.faltantes} sin anotar`}
            {" · "}
            <span className="text-fg-secondary">
              el aguinaldo se calcula con lo que está EN EL LIBRO, no con la proyección
            </span>
          </p>
        </div>
      )}
    </section>
  );
}

const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * El campo de la casilla elegida, debajo de la grilla: el monto con su moneda y lo que va a pasar al guardar, dicho
 * antes de guardar. Enter hace lo principal; Esc suelta la casilla.
 */
function EditorDeQuincena({
  q,
  moneda,
  todayISO,
  valor,
  onValor,
  guardando,
  onGuardar,
  onCancelar,
}: {
  q: Quincena;
  moneda: "CRC" | "USD";
  todayISO: string;
  valor: string;
  onValor: (v: string) => void;
  guardando: boolean;
  onGuardar: (comoPagada: boolean) => void;
  onCancelar: () => void;
}) {
  const falta = q.clase === "faltante";
  const yaPaso = q.fechaProgramada <= todayISO;
  const mes = MES_LARGO[Number(q.periodo.slice(5, 7)) - 1] ?? q.periodo;
  const titulo = `${q.quincena === 1 ? "1.ª" : "2.ª"} quincena de ${mes}`;
  const principal = falta ? "Anotar como pagada" : yaPaso ? "Guardar como pagada" : "Guardar el monto";

  return (
    <div className="rounded-lg border border-brand/40 bg-surface-muted px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-[220px] flex-1">
        <p className="text-xs font-medium text-fg">{titulo}</p>
        <p className="text-[11px] text-fg-muted">
          {falta
            ? `No está en el libro. Escribe lo que se pagó: queda pagada el ${fmtFecha(q.fechaProgramada)}, a tu nombre.`
            : yaPaso
              ? `Está en el libro sin pagar. Corrige el monto si hace falta y márcala pagada el ${fmtFecha(q.fechaProgramada)}.`
              : "Todavía no llega: puedes ajustar el monto. Se paga desde el libro cuando salga la plata."}
        </p>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(falta || yaPaso);
        }}
      >
        <label className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 focus-within:border-brand">
          <span className="text-[11px] text-fg-muted">{moneda === "CRC" ? "₡" : "$"}</span>
          <input
            // Una casilla nueva, un campo nuevo: la sugerencia viene seleccionada y se reemplaza al escribir.
            key={claveDe(q)}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            inputMode="decimal"
            aria-label={`Monto de la ${titulo}`}
            value={valor}
            onChange={(e) => onValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancelar();
            }}
            className="w-28 bg-transparent text-xs tabular-nums text-fg outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={guardando}
          className="text-[11px] px-2.5 py-1 rounded-md bg-brand text-primary-fg font-medium hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : principal}
        </button>
        {!falta && yaPaso && (
          <button
            type="button"
            disabled={guardando}
            onClick={() => onGuardar(false)}
            className="text-[11px] px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            Solo corregir el monto
          </button>
        )}
        <button
          type="button"
          onClick={onCancelar}
          className="text-[11px] px-2 py-1 rounded-md text-fg-muted hover:text-fg-secondary"
        >
          Cancelar
        </button>
      </form>
    </div>
  );
}

function Casilla({
  cel,
  moneda,
  esHoy,
  escalon,
  elegida,
  onClic,
}: {
  cel: Quincena;
  moneda: "CRC" | "USD";
  esHoy: boolean;
  /** El monto cambió respecto de la quincena anterior, y hacia dónde. null = venía igual. */
  escalon: "sube" | "baja" | null;
  /** Es la que se está escribiendo abajo. */
  elegida: boolean;
  /** Escribir su monto (falta / sin pagar) o fijar un aumento desde ella (proyectada). null = no es accionable. */
  onClic: (() => void) | null;
}) {
  const c = CLASE[cel.clase];

  // El texto queda para lo EXCEPCIONAL. Una casilla pagada no necesita decir "pagada":
  // eso lo dice la leyenda, y repetirlo veinticuatro veces tapa lo que sí hay que ver.
  const nota =
    cel.clase === "faltante"
      ? "falta"
      : cel.clase === "registrada" && cel.estado !== "PAGADO"
        ? "sin pagar"
        : null;

  const titulo = `${fmtFecha(cel.fechaProgramada)} · ${c.label}${
    cel.salarioMensual !== null ? ` · de ${fmtMonto(cel.salarioMensual, moneda)} al mes` : ""
  }${cel.fechaPago ? ` · pagada el ${fmtFecha(cel.fechaPago)}` : ""}${
    escalon ? ` · el monto ${escalon} desde acá` : ""
  }${
    onClic
      ? cel.clase === "proyectada"
        ? " — clic para fijar un aumento desde acá"
        : " — clic para escribir el monto"
      : ""
  }`;

  const clases = [
    "rounded-[5px] border px-1 py-1 text-center leading-tight transition-colors",
    c.cls,
    elegida ? "ring-2 ring-brand" : esHoy ? "ring-1 ring-brand" : "",
    /* El escalón va en negrita + una flecha, NO con un borde de color.
       ⚠ `border-l-brand` se veía gris: `border-line` fija el color de los CUATRO lados y,
       con la misma especificidad, gana el que la hoja generada pone último. Una flecha no
       compite con nada — y encima dice hacia DÓNDE cambió, que un borde no puede. */
    escalon ? "font-semibold text-fg" : "",
    onClic ? "cursor-pointer hover:border-brand hover:bg-surface-hover" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const contenido = (
    <>
      <span className="block text-[11px] tabular-nums">
        {escalon && (
          <span aria-hidden className="text-brand mr-0.5">
            {escalon === "sube" ? "↑" : "↓"}
          </span>
        )}
        {cel.monto !== null ? fmtMonto(cel.monto, moneda) : c.vacio || "—"}
      </span>
      {nota && <span className="block text-[9px] opacity-80">{nota}</span>}
    </>
  );

  if (!onClic) {
    return (
      <div title={titulo} className={clases}>
        {contenido}
      </div>
    );
  }
  return (
    <button type="button" title={titulo} onClick={onClic} aria-pressed={elegida} className={`${clases} w-full`}>
      {contenido}
    </button>
  );
}
