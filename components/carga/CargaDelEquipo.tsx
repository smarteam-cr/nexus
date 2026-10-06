/**
 * components/carga/CargaDelEquipo.tsx — «Carga del equipo»: la utilización de cada persona de CS semana por semana,
 * las señales para la 1:1 y lo que pide cada cuenta frente a su complejidad. Sin montos: el dinero vive en Finanzas.
 *
 * Componente del servidor (sin estado): recibe todo ya calculado por `cargarCargaDelEquipo`.
 */
import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { cn } from "@/lib/cn";
import type { DatosDeLaCarga } from "@/lib/carga/queries";
import { RUTA_DE_LOS_DATOS, RUTA_DE_LOS_SUPUESTOS, rutaDeLaUnoAUno } from "@/lib/carga/rutas";
import { etiquetaDelLunes } from "@/lib/carga/semana";
import { horasLibres, sinReunionesRecientes, type Senal } from "@/lib/carga/senales";
import {
  BarraDeLaSemana,
  CeldaDeSemana,
  Cifra,
  ENLACE_AZUL,
  ENLACE_BLANCO,
  EstadoDeCarga,
  LEYENDA_DE_SEMAFORO,
  LeyendaDeLaSemana,
  Muestra,
  coma,
  horas,
} from "./piezas";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function CargaDelEquipo({ datos, senales, contenedor }: { datos: DatosDeLaCarga; senales: Senal[]; contenedor: string }) {
  const { config } = datos.configuracion;
  const cse = datos.personas.filter((p) => !p.esCsl);
  const lunesActual = datos.futuras[0]?.lunes ?? datos.hoy;
  const libres = horasLibres(datos.personas, config, lunesActual).map((x) => ({ nombre: x.p.nombre.split(" ")[0], h: x.libres }));
  const totalLibres = libres.reduce((a, x) => a + x.h, 0);
  const enSobrecarga = datos.personas.filter((p) => p.senal).length;
  const atrasadas = datos.personas.reduce((a, p) => a + p.atrasadas, 0);

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Carga del equipo"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Carga del equipo" }]}
        badges={
          <>
            <ChipDeCabecera>Semana del {etiquetaDelLunes(lunesActual)}</ChipDeCabecera>
            <ChipDeCabecera>CSL y dirección</ChipDeCabecera>
          </>
        }
        description="La carga de cada persona de CS: lo que ya tiene en la agenda más lo que su cronograma le pide fuera de las reuniones. Sin montos: el dinero vive en Finanzas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={RUTA_DE_LOS_DATOS} className={ENLACE_BLANCO}>
              Qué datos hay
            </Link>
            <Link href={RUTA_DE_LOS_SUPUESTOS} className={ENLACE_BLANCO}>
              Ajustar el cálculo
            </Link>
          </div>
        }
      />

      {datos.configuracion.sinTabla && (
        <Alert variant="warning" title="Rigen los supuestos de fábrica.">
          Esta base todavía no tiene la tabla donde se guardan los supuestos: se pueden mirar, pero no guardar.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Cifra
          rotulo="Utilización del equipo"
          valor={`${datos.equipo.utilizacion} %`}
          nota={`${horas(datos.equipo.horas)} por semana · hoy hay ${horas(datos.equipo.disponible)} entre ${plural(cse.length, "CSE", "CSE")}`}
        />
        <Cifra
          rotulo="Horas libres esta semana"
          valor={horas(totalLibres)}
          nota={libres.length ? libres.slice(0, 3).map((x) => `${x.nombre} ${Math.round(x.h)} h`).join(" · ") : "Nadie tiene horas libres"}
        />
        <Cifra
          rotulo="Sobrecarga sostenida"
          valor={plural(enSobrecarga, "persona", "personas")}
          alerta={enSobrecarga > 0}
          nota={`Más del ${config.semaforo.sobrecarga} % durante ${config.semanasSenal} semanas o más`}
        />
        <Cifra rotulo="Tareas atrasadas o sin marcar" valor={atrasadas} nota="No suman a la carga: puede ser trabajo hecho y no marcado" />
      </div>

      <section className="space-y-3 rounded-xl border border-line bg-surface py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-4">
          <h2 className="text-sm font-semibold text-fg">Utilización por semana</h2>
          <span className="flex flex-wrap items-center gap-3.5 text-xs text-fg-secondary">
            {LEYENDA_DE_SEMAFORO.map((l) => (
              <span key={l.texto} className="inline-flex items-center gap-1.5">
                <Muestra className={l.clase} />
                {l.texto}
              </span>
            ))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <th className="whitespace-nowrap px-4 py-2">Persona</th>
                <th className="whitespace-nowrap px-3 py-2">Estado</th>
                {datos.semanas.map((s) => (
                  <th key={s.lunes} className="whitespace-nowrap px-1 py-2 text-center">
                    {s.etiqueta}
                  </th>
                ))}
                {datos.futuras.map((s) => (
                  <th key={s.lunes} className="whitespace-nowrap px-1 py-2 text-center text-fg-muted">
                    {s.etiqueta}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right">Promedio</th>
                <th className="whitespace-nowrap px-3 py-2">En qué se va la semana</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">Atrasadas</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {datos.personas.map((p) => {
                const primera = p.semanas.find((s) => s.enElEquipo);
                const detalle =
                  p.semanasEnElEquipo === 0
                    ? "Entró esta semana"
                    : p.semanasEnElEquipo < p.semanas.length && primera
                      ? `Entró la semana del ${etiquetaDelLunes(primera.lunes)}`
                      : p.esCsl
                      ? `CSL · ${plural(p.cuentas.length, "cuenta", "cuentas")}`
                      : p.cuentas.length
                        ? plural(p.cuentas.length, "cuenta", "cuentas")
                        : p.ultimaSemanaConReuniones
                          ? `Sin reuniones desde el ${etiquetaDelLunes(p.ultimaSemanaConReuniones)}`
                          : "Sin reuniones en el calendario";
                return (
                  <tr key={p.email} className="border-b border-line last:border-b-0">
                    <td className="min-w-[190px] px-4 py-2.5">
                      <span className="block font-semibold text-fg">{p.nombre}</span>
                      <span className="block text-xs text-fg-muted">{detalle}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {!p.esCsl && sinReunionesRecientes(p, lunesActual) ? (
                        <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-dashed border-line bg-surface-muted px-2.5 text-[11px] font-semibold text-fg-muted">
                          Sin reuniones
                        </span>
                      ) : (
                        <EstadoDeCarga semaforo={p.promedio.semaforo} detalle={p.senal ? `${p.racha} semanas` : undefined} />
                      )}
                    </td>
                    {[...p.semanas, ...p.proyeccion].map((s) => (
                      <td key={s.lunes} className="min-w-[52px] px-[3px] py-1.5">
                        <CeldaDeSemana semana={s} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="block font-semibold text-fg">{p.promedio.utilizacion} %</span>
                      <span className="block text-xs text-fg-muted">{horas(p.promedio.total)}</span>
                    </td>
                    <td className="min-w-[200px] px-3 py-2.5">
                      <BarraDeLaSemana partes={p.promedio} />
                      <span className="mt-1 block text-xs text-fg-muted">
                        {coma(p.promedio.cliente)} clientes · {coma(p.promedio.interna + p.promedio.comercial)} internas · {coma(p.promedio.preparacion)} prep. ·{" "}
                        {coma(p.promedio.entrega)} entrega
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.atrasadas || <span className="text-fg-muted">0</span>}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.id && (
                        <Link href={rutaDeLaUnoAUno(p.id)} className={cn(ENLACE_AZUL, "whitespace-nowrap")}>
                          Abrir la 1:1
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4">
          <LeyendaDeLaSemana preparacionMin={config.preparacionMin} />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg">Señales para la 1:1</h2>
            <span className="text-xs text-fg-muted">Nexus sugiere; no mueve cuentas ni cambia dueños</span>
          </div>
          {senales.length === 0 ? (
            <p className="mt-3 text-[13px] text-fg-secondary">Nada fuera de lo normal en las últimas {datos.semanas.length} semanas.</p>
          ) : (
            <ul>
              {senales.map((s) => (
                <li key={s.clave} className="flex items-start justify-between gap-4 border-b border-line py-2.5 text-[13px] last:border-b-0">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <EstadoDeSenal senal={s} />
                      <span className="text-sm font-semibold text-fg">{s.titulo}</span>
                    </div>
                    <span className="text-[13px] leading-[19px] text-fg-secondary">{s.texto}</span>
                  </div>
                  <Link href={destinoDe(s)} className={cn(ENLACE_BLANCO, "flex-shrink-0 whitespace-nowrap")}>
                    {s.accion}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2.5 rounded-xl bg-surface-muted p-4">
          <h2 className="text-sm font-semibold text-fg">Cómo se calcula</h2>
          <p className="text-[13px] leading-[19px] text-fg-secondary">Utilización = horas comprometidas ÷ horas disponibles.</p>
          <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] leading-[19px] text-fg-secondary">
            <li>
              <b className="text-fg">Disponibles:</b> {config.capacidad.horasContrato} h de contrato × {Math.round(config.capacidad.productiva * 100)} % productivas ={" "}
              {coma(config.capacidad.horasContrato * config.capacidad.productiva, 0)} h.
            </li>
            <li>
              <b className="text-fg">Reuniones:</b> las del calendario, con clientes, comerciales e internas. Son AGENDADAS: cuentan a todos los invitados hasta leer
              la asistencia de Meet. Las de día completo no cuentan y las largas se topan en 4 h.
            </li>
            <li>
              <b className="text-fg">Preparación:</b> {config.preparacionMin} min por reunión con un cliente.
            </li>
            <li>
              <b className="text-fg">Entrega estimada:</b> las tareas del cronograma × horas por tipo de fase × factor de complejidad de la cuenta. «Ambos» cuenta{" "}
              {Math.round(config.ambosFraccion * 100)} %; «Cliente» y «Desarrollo» no cuentan.
            </li>
            <li>
              <b className="text-fg">Proyectada:</b> el ritmo de reuniones de las últimas {datos.semanas.length} semanas más las tareas que el cronograma pone en
              cada semana.
            </li>
          </ul>
          <p className="text-xs text-fg-muted">
            {datos.reuniones.contadas} reuniones contadas; {datos.reuniones.descartadas} de día completo o sin duración no cuentan.
          </p>
          <Link href={RUTA_DE_LOS_SUPUESTOS} className={cn(ENLACE_AZUL, "self-start")}>
            Ver y ajustar los supuestos
          </Link>
        </section>
      </div>

      <CuentasFrenteASuComplejidad datos={datos} />
    </div>
  );
}

function destinoDe(s: Senal): string {
  if (s.destino.tipo === "persona") return rutaDeLaUnoAUno(s.destino.id);
  if (s.destino.tipo === "supuestos") return RUTA_DE_LOS_SUPUESTOS;
  return "/customer-success";
}

function EstadoDeSenal({ senal }: { senal: Senal }) {
  const tono =
    senal.tono === "alto"
      ? "border-danger-line bg-danger-surface text-danger-ink"
      : senal.tono === "espacio"
        ? "border-success-line bg-success-surface text-success-ink"
        : "border-warn-line bg-warn-surface text-warn-ink";
  return <span className={cn("inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold", tono)}>{senal.estado}</span>;
}

/** Lo que pide cada cuenta frente a lo que su complejidad predice. */
function CuentasFrenteASuComplejidad({ datos }: { datos: DatosDeLaCarga }) {
  // Las que piden al menos 1 h por semana van en la tabla; las demás, en una línea al pie.
  const cuentas = datos.cuentas.filter((c) => c.horasSemana >= 1);
  const resto = datos.cuentas.filter((c) => c.horasSemana < 1);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Cada cuenta frente a su complejidad</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            Horas por semana que le pide al equipo de CS, contra las que predice su factor ({coma(datos.horasPorPunto, 2)} h por punto).
            {datos.correlacion !== null && ` El factor explica parte de las horas: correlación ${coma(datos.correlacion, 2)}.`}
          </p>
        </div>
        <span className="text-xs text-fg-muted">Abre una cuenta para ver de dónde sale su factor</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-3 py-2">CSE</th>
              <th className="px-3 py-2 text-right">Factor</th>
              <th className="px-3 py-2 text-right">Horas por semana</th>
              <th className="px-3 py-2 text-right">Lo esperado</th>
              <th className="px-3 py-2">Frente a su complejidad</th>
              <th className="px-4 py-2 text-right">Reuniones</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.clienteId} className="border-b border-line align-top last:border-b-0">
                <td className="min-w-[220px] px-4 py-2.5">
                  <details>
                    <summary className="cursor-pointer font-semibold text-fg">{c.nombre}</summary>
                    <ul className="mt-2 space-y-1 text-xs text-fg-secondary">
                      {c.factor.variables.map((v) => (
                        <li key={v.clave} className="flex justify-between gap-3">
                          <span>
                            <span className="text-fg">{v.nombre}:</span> {v.valor}
                            {v.estado === "falta" && <span className="text-fg-muted"> (falta el dato)</span>}
                          </span>
                          <span className="tabular-nums">{v.suma > 0 ? `+${coma(v.suma, 2)}` : "0"}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {c.etapas.length > 0 && <span className="block text-xs text-fg-muted">{c.etapas.join(" · ")}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {c.cseNombre ?? <span className="text-warn-ink">{c.cseDeBaja ? `Sin CSE (era de ${c.cseDeBaja})` : "Sin CSE"}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{coma(c.factor.factor, 2)}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{horas(c.horasSemana)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-muted">{horas(c.horasEsperadas)}</td>
                <td className="px-3 py-2.5">
                  <Razon razon={c.razon} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.reunionesEnLaVentana}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resto.length > 0 && (
        <p className="px-4 text-xs text-fg-muted">
          {resto.length} {resto.length === 1 ? "cuenta pide" : "cuentas piden"} menos de 1 h por semana: {resto.map((c) => c.nombre).join(", ")}.
        </p>
      )}
    </section>
  );
}

function Razon({ razon }: { razon: number | null }) {
  if (razon === null) return <span className="text-fg-muted">—</span>;
  const texto = `${coma(razon, 1)}×`;
  if (razon >= 1.5) return <span className="inline-flex h-[22px] items-center rounded-full border border-warn-line bg-warn-surface px-2.5 text-[11px] font-semibold text-warn-ink">Pide {texto}</span>;
  if (razon <= 0.5) return <span className="inline-flex h-[22px] items-center rounded-full border border-line bg-surface-muted px-2.5 text-[11px] font-semibold text-fg-secondary">Pide menos · {texto}</span>;
  return <span className="text-fg-secondary">Lo esperado · {texto}</span>;
}
