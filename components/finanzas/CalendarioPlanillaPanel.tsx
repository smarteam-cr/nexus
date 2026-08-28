"use client";

/**
 * components/finanzas/CalendarioPlanillaPanel.tsx
 *
 * El año de planilla, PERSONA POR PERSONA: sus 24 quincenas, lo que se le pagó y lo que
 * falta pagarle. Y desde acá se edita el salario, que es donde uno decide un aumento.
 *
 * ⚠ ES OTRO EJE DEL MISMO DATO, no una segunda verdad. El libro (`/historial`) agrupa
 * por mes y quincena —la lectura de "qué sale esta quincena"— y esto lo transpone: una
 * persona, su año entero. Las dos leen las mismas filas de `PagoPlanilla`; ninguna
 * escribe. Es el mismo par que la cola de cobros y el panel de cartera.
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
import { inicioDeQuincena } from "@/lib/cobranza/planilla";
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
      <PageHeader
        title={`Calendario de planilla ${anio}`}
        description="El año de cada persona, quincena por quincena. Lo que se le pagó sale del libro y no se toca; lo que falta se proyecta al salario que rige en esa fecha."
      />

      {/* Un aumento no reescribe el pasado, y conviene decirlo antes de que alguien lo
          note por su cuenta mirando dos montos distintos en la misma columna. */}
      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 mb-3">
        <p className="text-[11px] text-fg-muted">
          Un aumento rige <strong className="text-fg-secondary">desde su fecha efectiva hacia adelante</strong>: las
          quincenas ya anotadas conservan el monto viejo, porque es lo que se pagó. Nada de esto se guarda —
          la proyección se recalcula sola cada vez que se abre.
        </p>
      </div>

      {pendientes > 0 && (
        <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-warn-ink">
            <strong className="font-medium">
              {pendientes} quincena{pendientes === 1 ? "" : "s"} sin anotar
            </strong>{" "}
            — ya ocurrieron, la persona estaba, y no están en el libro.
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
}: {
  persona: CalendarioPersonaDTO;
  anio: number;
  todayISO: string;
  abierto: boolean;
  onToggle: () => void;
  costo: CostoRecurrenteDTO | null;
  onEditar: (desde?: string) => void;
}) {
  const moneda = p.moneda as "CRC" | "USD";

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

  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
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
            {costo && (
              <span className="text-[10px] text-fg-muted/80">
                · clic en una quincena proyectada para fijar un aumento desde ahí
              </span>
            )}
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
                        onFijarAumento={
                          costo && cel.clase === "proyectada"
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

function Casilla({
  cel,
  moneda,
  esHoy,
  escalon,
  onFijarAumento,
}: {
  cel: CalendarioPersonaDTO["quincenas"][number];
  moneda: "CRC" | "USD";
  esHoy: boolean;
  /** El monto cambió respecto de la quincena anterior, y hacia dónde. null = venía igual. */
  escalon: "sube" | "baja" | null;
  /** Fijar un aumento desde esta quincena. null = la casilla no es accionable. */
  onFijarAumento: (() => void) | null;
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
  }${onFijarAumento ? " — clic para fijar un aumento desde acá" : ""}`;

  const clases = [
    "rounded-[5px] border px-1 py-1 text-center leading-tight transition-colors",
    c.cls,
    esHoy ? "ring-1 ring-brand" : "",
    /* El escalón va en negrita + una flecha, NO con un borde de color.
       ⚠ `border-l-brand` se veía gris: `border-line` fija el color de los CUATRO lados y,
       con la misma especificidad, gana el que la hoja generada pone último. Una flecha no
       compite con nada — y encima dice hacia DÓNDE cambió, que un borde no puede. */
    escalon ? "font-semibold text-fg" : "",
    onFijarAumento ? "cursor-pointer hover:border-brand hover:bg-surface-hover" : "",
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

  if (!onFijarAumento) {
    return (
      <div title={titulo} className={clases}>
        {contenido}
      </div>
    );
  }
  return (
    <button type="button" title={titulo} onClick={onFijarAumento} className={`${clases} w-full`}>
      {contenido}
    </button>
  );
}
