/**
 * lib/tareas/guardas.test.ts — lo que el módulo de Tareas internas NO puede hacer (docs/tareas-plan.md §12).
 *
 * Escaneos del TEXTO del código: si una guarda desaparece, la suite se pone roja. Se arreglan restituyendo la guarda,
 * nunca relajando el regex.
 *
 *   · un solo escritor: `mutaciones.ts` escribe las tablas de tareas (y `lectura.ts` su `LecturaDeReunion`); solo
 *     `anotarResultado()` escribe `ResultadoDeSemana`;
 *   · `lib/tareas` no escribe `Project`, `Client` ni `TimelineTask`, ni lee reuniones fuera del chokepoint;
 *   · nada que llegue al cliente ni a los agentes que escriben documentos lee tareas (censo de lectores);
 *   · ninguna escritura de un evento lleva la cita de la reunión;
 *   · el SQL trae RLS + RESTRICTIVE en las 13 tablas y nada destructivo;
 *   · todo el copy del módulo en tuteo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

const RAIZ = join(__dirname, "..", "..");
// Sin CRLF: en un checkout de Windows (core.autocrlf) los archivos llegan con «\r\n» y los regex de abajo buscan «\n}\n».
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

/** El código sin comentarios: un comentario que EXPLICA una regla no la viola. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function fuentes(dir: string): string[] {
  const out: string[] = [];
  let entradas: import("node:fs").Dirent[];
  try {
    entradas = readdirSync(join(RAIZ, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entradas) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__fixtures__" && !e.name.startsWith(".")) out.push(...fuentes(rel));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const TODO = [...fuentes("lib"), ...fuentes("app"), ...fuentes("components"), ...fuentes("scripts")];
const DE_TAREAS = fuentes("lib/tareas");

const MODELOS = ["tarea", "tareaRelacion", "tareaComentario", "tareaVinculo", "tareaEvento", "proyectoDeTareas", "plantillaDeTareas", "espacioDeTareas", "miembroDeEspacio", "resultadoDeSemana", "cierreDeSemana", "lecturaDeReunion", "fuenteDeTareas"];
const ESCRITURA = "(?:create|createMany|update|updateMany|upsert|delete|deleteMany)";

describe("⛔ Tareas internas: un solo escritor", () => {
  it("solo mutaciones.ts escribe las tablas de tareas (lectura.ts, solo su LecturaDeReunion)", () => {
    const malos: string[] = [];
    for (const rel of TODO) {
      const src = soloCodigo(leer(rel));
      for (const m of MODELOS) {
        if (!new RegExp(`\\.${m}\\.${ESCRITURA}\\(`).test(src)) continue;
        if (rel === "lib/tareas/mutaciones.ts") continue;
        if (rel === "lib/tareas/lectura.ts" && m === "lecturaDeReunion") continue;
        // El segundo escritor de LecturaDeReunion (memoria de la cuenta, etapa 2): la cola de la lectura de seguimiento.
        // Escribe SOLO sus columnas `seguimiento*` (lo vigila la prueba de abajo); la fila la crea lectura.ts
        // (`crearFilaDelSeguimiento`), y la salida de Tareas sigue en lectura.ts y mutaciones.ts.
        if (rel === "lib/lecturas/cola.ts" && m === "lecturaDeReunion") continue;
        malos.push(`${rel} escribe ${m}`);
      }
    }
    expect(malos, `Las tablas de tareas se escriben solo en lib/tareas/mutaciones.ts:\n${malos.join("\n")}`).toEqual([]);
  });

  it("la cola de la lectura de seguimiento escribe SOLO las columnas seguimiento* (y no crea filas)", () => {
    /* La cola comparte la fila con Tareas: si un cambio futuro le hiciera pisar `estado`, `resumen` o `leidaAt` desde
       acá, Tareas perdería su salida sin que nada lo dijera. Cada `data` de un update de la cola se revisa campo por
       campo. */
    const src = soloCodigo(leer("lib/lecturas/cola.ts"));
    expect(src, "la fila nueva la crea lib/tareas/lectura.ts (crearFilaDelSeguimiento)").not.toMatch(/\.lecturaDeReunion\.(?:create|createMany|upsert)\(/);
    expect(src).toContain("crearFilaDelSeguimiento(");
    const datos = [...src.matchAll(/\.lecturaDeReunion\.(?:update|updateMany)\(\{[\s\S]*?data:\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(datos.length, "la prueba mira algo").toBeGreaterThan(3);
    const ajenos = datos.flatMap((d) => [...d.matchAll(/(\w+)\s*:/g)].map((m) => m[1])).filter((campo) => !campo.startsWith("seguimiento") && campo !== "increment");
    expect(ajenos, `La cola escribe columnas que no son del seguimiento: ${ajenos.join(", ")}`).toEqual([]);
  });

  it("solo anotarResultado() (y quitarResultado(), al reabrir) escriben ResultadoDeSemana", () => {
    const src = soloCodigo(leer("lib/tareas/mutaciones.ts"));
    /** El cuerpo de una función de nivel superior: desde su firma hasta la primera llave que cierra en la columna 0. */
    const cuerpoDe = (nombre: string) => {
      const i = src.indexOf(`export async function ${nombre}(`);
      expect(i, `${nombre} desapareció de mutaciones.ts`).toBeGreaterThan(-1);
      return src.slice(i, src.indexOf("\n}\n", i) + 3);
    };
    const escribe = new RegExp(`\\.resultadoDeSemana\\.${ESCRITURA}\\(`);
    const anotar = cuerpoDe("anotarResultado");
    const quitar = cuerpoDe("quitarResultado");
    expect(anotar).toMatch(escribe);
    expect(src.replace(anotar, "").replace(quitar, "")).not.toMatch(escribe);
  });

  it("lib/tareas no escribe Project, Client ni TimelineTask, ni llama a escritores de HubSpot", () => {
    const malos: string[] = [];
    for (const rel of DE_TAREAS) {
      const src = soloCodigo(leer(rel));
      if (new RegExp(`\\.(?:project|client|timelineTask|timelinePhase|projectTimeline)\\.${ESCRITURA}\\(`).test(src)) malos.push(`${rel}: escribe un modelo ajeno`);
      if (/from "@\/lib\/hubspot\//.test(src) && /\b(?:crear|actualizar|update|create|patch|sync)[A-Z]\w*\(/.test(src) && /lib\/hubspot\/(?:handoff-sync|social-broadcast|sync-projects|estado)/.test(src)) {
        malos.push(`${rel}: importa un escritor de HubSpot`);
      }
    }
    expect(malos).toEqual([]);
  });
});

describe("⛔ Tareas internas: las reuniones, solo por el chokepoint", () => {
  it("lib/tareas no lee FirefliesSession por su cuenta ni importa Drive o el parser de Docs", () => {
    const malos: string[] = [];
    for (const rel of DE_TAREAS) {
      const src = soloCodigo(leer(rel));
      if (/\.firefliesSession\./.test(src)) malos.push(`${rel}: lee firefliesSession`);
      if (/session:\s*\{\s*select/.test(src) || /lectura:\s*\{\s*session/.test(src)) malos.push(`${rel}: lee la reunión por una relación`);
      if (/@\/lib\/google\/drive-files|@\/lib\/google\/docs/.test(src)) malos.push(`${rel}: importa Drive o Docs`);
    }
    expect(malos, `Las reuniones se leen por lib/sessions (reuniones-para-tareas.ts):\n${malos.join("\n")}`).toEqual([]);
  });
});

describe("⛔ Tareas internas: quién las lee (censo)", () => {
  /** Lo que llega al cliente, a un PDF o a un agente que escribe un documento: ninguno lee tareas. */
  const PROHIBIDOS = [
    "app/external",
    "app/print",
    "app/portal",
    "lib/external",
    "lib/print",
    "lib/landing",
    "components/landing",
    "lib/contexto",
    "lib/agents",
    "lib/canvas",
    "lib/ai",
    "lib/timeline",
    "lib/delivery",
    "lib/hubspot",
    "lib/projects",
    "app/api/clients/[id]/analyze",
  ];
  /** Una consulta a las tablas de tareas (no una variable `tarea`: el cronograma llama así a sus TimelineTask). */
  const LECTOR = /@\/lib\/tareas\/|\b(?:prisma|tx|db)\.(?:tarea|proyectoDeTareas|tareaEvento|tareaVinculo|tareaComentario|lecturaDeReunion)\.|FROM "Tarea"/;

  it("nada de lo que ve el cliente ni de los agentes de documentos lee tareas", () => {
    const malos: string[] = [];
    for (const dir of PROHIBIDOS) {
      for (const rel of fuentes(dir)) {
        if (LECTOR.test(soloCodigo(leer(rel)))) malos.push(rel);
      }
    }
    expect(malos, `Estos archivos leen tareas y no pueden:\n${malos.join("\n")}`).toEqual([]);
  });

  it("los que importan lib/tareas desde afuera están declarados", () => {
    const CENSO: Record<string, string> = {
      "lib/invariantes/tareas.ts": "invariantes solo-base (lecturas)",
      "lib/para-ti/fuentes/tareas.ts": "los pendientes de «Para ti» (cuenta, no serializa)",
      "components/layout/AppShell.tsx": "el gate del menú (entraATareas)",
      "app/(shell)/not-found.tsx": "el gate del menú en la página 404",
      "lib/google/agenda.ts": "esBloqueDeTarea y los bloques de la agenda",
      "scripts/tareas-ensayo.ts": "el ensayo de la lectura: solo lectura, sin IA",
      "lib/jobs/defs.ts": "el job del lunes (mantenimientoDelLunes, por el único escritor)",
      "lib/seguimiento/tarjeta-server.ts": "«Lo que dejó esta reunión»: las tareas propuestas de una reunión, para quien las recibe (serializa por serializar.ts)",
      "lib/seguimiento/usar-todo-server.ts": "«Usar todo» de la tarjeta de una reunión: decide por decidirTarea (el único escritor)",
      "lib/lo-propuesto/registro-server.ts": "«Uso de Nexus»: cuenta las tareas propuestas por su estado (no serializa)",
      // La memoria de la cuenta, etapa 2 (DECISIONS «La lectura de cada reunión es durable…»).
      "lib/lecturas/cola.ts": "la cola de la lectura de seguimiento: la fila nueva la crea lectura.ts (crearFilaDelSeguimiento), y la suelta para Tareas (lectura.ts)",
      "lib/sessions/post-process.ts": "la lectura de seguimiento: los compromisos a propuestas por escribirSalidaDeSeguimiento (el único escritor); los títulos para no repetirlos, SOLO por lib/tareas/para-agentes.ts",
      // Iniciativa B (2026-10-18): lo que Smarteam prometió por CORREO, por la misma salida que la lectura de cada reunión.
      "lib/comunicaciones/compromisos-server.ts": "los compromisos de un correo enviado a propuestas por armarPropuestasDeSeguimiento y escribirSalidaDeUnCorreo (el único escritor); el equipo activo por miembrosActivos",
      "lib/cs/watchdog-context.ts": "el vigía: los compromisos vencidos SOLO por lib/tareas/para-agentes.ts (la puerta de los agentes: sin la cita, el contexto, las notas ni lo privado)",
      // La memoria de la cuenta, etapa 3 (DECISIONS «La memoria de la cuenta y del proyecto: un solo cargador»).
      "lib/memoria/cargar.ts": "la memoria INTERNA del proyecto: los compromisos abiertos SOLO por lib/tareas/para-agentes.ts (compromisosAbiertosParaAgentes), y solo en el alcance interno (queCargar): ni el handoff ni lo que ve el cliente leen tareas",
      "app/(shell)/sessions/[id]/page.tsx": "la página de la reunión: cuántas tareas dejó (contarTareasDeLaReunion, solo lo visible)",
      "lib/seguimiento/compromisos-server.ts": "«Lo que dejó esta reunión»: lo demás que dejó la reunión en Tareas, para leer (cargarTareasDeLaReunion, solo lo visible)",
      "components/clients/ProjectGPS.tsx": "los «Pendientes recientes» del Resumen: el tipo de /api/tareas/del-proyecto (no consulta; los cambios van por las rutas de Tareas)",
      "lib/equipos/registro.ts": "el registro de equipos (etapa 4c): solo el TIPO de la clave del sprint (equipos.ts); no lee tareas",
      "lib/equipos/registro.test.ts": "verifica que cada sprint del registro exista en equipos.ts (puro); no lee tareas",
      // El inicio de cada equipo (ficha D, 2026-10-17).
      "lib/mi-dia/servicio-server.ts": "la regla de servicio del inicio: la acción de la semana de cada cuenta (título, fecha y estado; sin la cita, el contexto, las notas ni lo privado)",
      "lib/mi-dia/inicio-server.ts": "el inicio: TUS tareas de hoy y tus tareas internas (las tuyas y las de tu sprint sin dueño), con su ámbito (no serializa la cita ni el contexto)",
      "lib/mi-dia/agenda-contactos-server.ts": "a quién invitar al borrador de un evento de la agenda del inicio: solo QUÉ cuentas ves (clientesQueVesParaTareas, el acceso de requireAccessToClient); no lee tareas",
      "lib/mi-dia/resumen-server.ts": "el resumen antes de una reunión (etapa 4c): lo pendiente de los dos lados SOLO por lib/tareas/para-agentes.ts (sin la cita, el contexto, las notas ni lo privado)",
      "lib/uso/lectura-server.ts": "«Uso de Nexus» (etapa 4a): solo el nombre del equipo de cada persona (equipos.ts, puro); no lee tareas",
      // La acción única (2026-10-16, fase 0.2 de docs/nexus-sistema-de-trabajo-plan.md): el siguiente paso es una tarea.
      "lib/siguiente-paso/lectura-server.ts": "el siguiente paso de cada equipo SALE de las tareas (lib/tareas/siguiente-paso.ts: lo de la cuenta, nunca lo privado ni lo de un espacio de solo miembros)",
      "lib/siguiente-paso/escritura-server.ts": "fijar el siguiente paso crea o cambia una tarea y «Ya se hizo» la termina, SIEMPRE por el escritor único (crearTarea, editarTarea, moverDeSemana, asignar, cambiarEstado); lo que va a HubSpot lo escribe acá",
      "lib/siguiente-paso/copia-server.ts": "lo que alguien escribió en HubSpot como siguiente paso entra como tarea por el escritor único (crearTareaDePasoDeHubspot)",
      // Los equipos en un solo registro (2026-10-16, fase 0.1): los sprints que lidera cada persona se eligen en Equipo.
      "app/api/team/[id]/permissions/route.ts": "guardar los sprints que lidera una persona: solo la lista de sprints (equipos.ts, puro); no lee tareas",
      "components/team/SprintsQueLidera.tsx": "«Lidera los sprints de» en Equipo: solo los nombres de los sprints (equipos.ts, puro); no lee tareas",
      "app/api/siguiente-paso/personas/route.ts": "quién puede llevar el siguiente paso de cada equipo: el sprint de cada persona (equipos.ts) y lo que lidera",
      // La capa de operaciones (2026-10-16, fase 0.4 de docs/nexus-sistema-de-trabajo-plan.md): la puerta del chat de Nexus.
      "lib/operaciones/contexto-server.ts": "la persona explícita de una operación: su visibilidad en Tareas (contextoDeTareas) y los clientes que ve; no lee tareas",
      "lib/operaciones/tareas-server.ts": "las operaciones de Tareas: leen SOLO por lib/tareas/para-operaciones.ts (sin la cita, el contexto ni las notas) y escriben SOLO por el escritor único (crearTarea, cambiarEstado, moverDeSemana)",
      "lib/operaciones/siguiente-paso-server.ts": "fijar el siguiente paso: solo los sprints que lidera la persona (equipos.ts, puro); escribe por lib/siguiente-paso",
      // La semana (2026-10-17, fase 2 de docs/nexus-sistema-de-trabajo-plan.md).
      "lib/mi-dia/planificar-server.ts": "«Planifica tu semana»: las tareas abiertas de tus cuentas (título, fecha, prioridad, lado; sin la cita, el contexto, las notas ni lo privado) y la próxima sugerida de la última reunión",
      "lib/mi-dia/proximas-server.ts": "las próximas reuniones de la ficha: las reuniones planeadas de la cuenta (título, hora, responsable e invitados; nunca lo privado) y quién tiene tareas abiertas con ella (para leer su calendario)",
      "lib/sessions/reanalizar.ts": "una reunión cuyo texto cambió: sus propuestas sin decidir quedan vencidas por el único escritor (retirarPropuestasDeLaReunion); no lee tareas",
      "app/api/sessions/[id]/seguimiento/route.ts": "«Ya la agendé» de la página de una reunión: deja la reunión planeada por el único escritor (planearReunion); no lee tareas",
      // El chat de Nexus (2026-10-17, ficha H): lee por la puerta de la capa y escribe por la capa de operaciones.
      "lib/nexus-chat/herramientas-server.ts": "el chat de Nexus: verifica que una tarea nombrada por su número sea de la cuenta del chat, SOLO por lib/tareas/para-operaciones.ts (tareaVisiblePorNumero); escribe por lib/operaciones",
      "lib/nexus-chat/acciones-server.ts": "las acciones sugeridas de una persona en una cuenta: sus tareas SOLO por lib/tareas/para-operaciones.ts (sin la cita, el contexto ni las notas) y los sprints que lidera (equipos.ts, puro); no escribe",
      // SmartLoop, etapa 6 (2026-10-17): recomendar la recurrencia deja una tarea al CSE.
      "lib/servicios/recurrencia-server.ts": "«Dejar la tarea» de la recomendación de pasar a SmartLoop: crea UNA tarea por el escritor único (crearTarea, con origenId); no lee tareas",
      // El servicio recurrente (2026-10-18, iniciativa 4): las rutinas y la tarea de mover el proyecto en HubSpot.
      "lib/servicios/servicio-server.ts": "las tareas que se repiten de un servicio recurrente y la de mover el proyecto en HubSpot: las crea por el escritor único (crearTarea, origen «plantilla», con origenId por semana); no lee tareas",
      // Las tareas de HubSpot (2026-10-15, etapa 3 de docs/mi-dia-plan.md).
      "lib/tareas-hubspot/reglas.ts": "las tareas de HubSpot: solo los tipos de prioridad (puro)",
      // «Actualizar escala» (2026-10-18): el agente que ubica la escala lee qué se está haciendo en la cuenta.
      "lib/exploraciones/posicionar-fuentes.ts": "«Actualizar escala»: las tareas abiertas de la cuenta SOLO por lib/tareas/para-agentes.ts (tareasDeLaCuentaParaAgentes: sin la cita, el contexto, las notas ni lo privado)",
      "lib/tareas-hubspot/sync-server.ts": "la copia de las tareas de HubSpot: escribe Tareas SOLO por el escritor único (crearTareaDeHubspot, aplicarDesdeHubspot, anotarSincronizacionConHubspot); lo que va a HubSpot lo escribe acá, nunca lib/tareas",
    };
    const afuera = TODO.filter((rel) => !/^(lib\/tareas|components\/tareas|app\/api\/tareas|app\/\(shell\)\/tareas)\//.test(rel)).filter((rel) => /@\/lib\/tareas\//.test(soloCodigo(leer(rel))));
    const sinDeclarar = afuera.filter((rel) => !CENSO[rel]);
    expect(sinDeclarar, `Lector nuevo de lib/tareas: decláralo en el CENSO con su destino:\n${sinDeclarar.join("\n")}`).toEqual([]);
  });

  it("los agentes internos leen tareas SOLO por lib/tareas/para-agentes.ts (la frontera Tareas ↔ agentes)", () => {
    /* El vigía (y después la memoria interna del proyecto y el avance) ven una proyección: título, para cuándo, estado y
       lado. Ninguno consulta las tablas de Tareas por su cuenta ni importa otra pieza de lib/tareas. */
    const AGENTES_INTERNOS = ["lib/cs", "lib/memoria"];
    const malos: string[] = [];
    for (const dir of AGENTES_INTERNOS) {
      for (const rel of fuentes(dir)) {
        const src = soloCodigo(leer(rel));
        for (const m of src.matchAll(/from "(@\/lib\/tareas\/[^"]+)"/g)) if (m[1] !== "@/lib/tareas/para-agentes") malos.push(`${rel} importa ${m[1]}`);
        if (/\b(?:prisma|tx|db)\.(?:tarea|proyectoDeTareas|tareaEvento|tareaVinculo|tareaComentario|lecturaDeReunion)\./.test(src)) malos.push(`${rel} consulta las tablas de Tareas`);
      }
    }
    expect(malos, `Un agente lee tareas por la puerta (lib/tareas/para-agentes.ts):\n${malos.join("\n")}`).toEqual([]);
  });

  it("la lectura de seguimiento (un agente) toma los títulos de «YA SON TAREAS» por la puerta de los agentes", () => {
    /* Es un agente: lo que escribe (la minuta, los compromisos) lo leen otras personas. Antes leía los títulos por
       lib/tareas/lectura.ts, sin las exclusiones de la puerta (espacios de «solo miembros», borradores de un plan). */
    const src = soloCodigo(leer("lib/sessions/post-process.ts"));
    expect(src).toContain('from "@/lib/tareas/para-agentes"');
    expect(src).toContain("titulosParaLaLectura(");
    expect(src, "no consulta las tablas de Tareas por su cuenta").not.toMatch(/\b(?:prisma|tx|db)\.(?:tarea|proyectoDeTareas|tareaEvento)\./);
    expect(src, "los títulos no salen de otra pieza de lib/tareas").not.toMatch(/titulosAbiertosDelCliente|titulosDeLaReunion/);
    expect(soloCodigo(leer("lib/tareas/para-agentes.ts"))).toMatch(/export async function titulosParaLaLectura[\s\S]*?VISIBLES_PARA_AGENTES[\s\S]*?ABIERTAS_PARA_AGENTES/);
  });

  it("la puerta de los agentes no pide la cita, el contexto, las notas ni lo privado", () => {
    const src = soloCodigo(leer("lib/tareas/para-agentes.ts"));
    for (const campo of ["cita", "contexto", "notas", "pasos", "origenTitulo"]) expect(src, `para-agentes.ts pide «${campo}»`).not.toMatch(new RegExp(`\\b${campo}\\s*:`));
    expect(src).toMatch(/privada:\s*false/);
  });

  it("ninguna lectura de los agentes o del chat nombra la cita de una tarea", () => {
    const malos: string[] = [];
    for (const dir of ["lib/agents", "lib/canvas", "lib/ai", "lib/asistente", "lib/cs", "lib/memoria", "lib/operaciones"]) {
      for (const rel of fuentes(dir)) {
        const src = soloCodigo(leer(rel));
        if (/\.tarea\.[\s\S]{0,200}\bcita\b|tareaEvento[\s\S]{0,200}\bcita\b|proyectoDeTareas[\s\S]{0,200}\bcita\b/.test(src)) malos.push(rel);
      }
    }
    expect(malos).toEqual([]);
  });
});

describe("⛔ Tareas internas: la cita no viaja en los eventos", () => {
  it("ninguna escritura de un evento lleva una clave `cita` en sus datos", () => {
    const malos: string[] = [];
    for (const rel of DE_TAREAS) {
      const src = soloCodigo(leer(rel));
      for (const m of src.matchAll(/evento\(\s*\w+\s*,\s*\{[\s\S]*?\}\s*\)/g)) {
        const datos = m[0].match(/datos:\s*\{([\s\S]*?)\}/);
        if (datos && /\bcita\b/.test(datos[1])) malos.push(`${rel}: ${m[0].slice(0, 80)}…`);
      }
    }
    expect(malos).toEqual([]);
  });
});

describe("⛔ Tareas internas: el SQL", () => {
  const SQL = "scripts/sql/2026-10-09-tareas.sql";
  const TABLAS = ["EspacioDeTareas", "MiembroDeEspacio", "ProyectoDeTareas", "PlantillaDeTareas", "Tarea", "TareaRelacion", "TareaComentario", "TareaVinculo", "TareaEvento", "ResultadoDeSemana", "CierreDeSemana", "LecturaDeReunion", "FuenteDeTareas"];

  it("RLS y la política RESTRICTIVE en las 13 tablas", () => {
    const src = leer(SQL);
    for (const t of TABLAS) {
      expect(src, `${t} sin RLS`).toMatch(new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`));
      expect(src, `${t} sin la política RESTRICTIVE`).toMatch(new RegExp(`ON "${t}"[\\s\\S]{0,40}AS RESTRICTIVE`));
    }
  });

  it("es aditivo: nada destructivo", () => {
    const src = leer(SQL);
    expect(src).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(src).not.toMatch(/\bTRUNCATE\b/i);
    expect(src).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("el SQL existe y el schema declara las 13 tablas", () => {
    expect(statSync(join(RAIZ, SQL)).size).toBeGreaterThan(1000);
    const schema = leer("prisma/schema.prisma");
    for (const t of TABLAS) expect(schema).toMatch(new RegExp(`^model ${t} \\{`, "m"));
  });
});

describe("⛔ Tareas internas habla en tuteo", () => {
  const ARCHIVOS = [...fuentes("components/tareas"), ...fuentes("app/(shell)/tareas"), ...fuentes("app/api/tareas"), ...DE_TAREAS, "lib/para-ti/fuentes/tareas.ts", "components/ui/AgendaDeLaSemana.tsx"];

  /** Primera persona del pretérito, que es tuteo («La terminé», «Ya la agendé»), y un sustantivo del prompt. */
  const NO_ES_VOSEO = new Set(["terminé", "agendé", "corchete", "corchetes"]);

  it("ni una forma de voseo en los textos que se leen (ni en el prompt de la lectura)", () => {
    const hallados: string[] = [];
    for (const rel of ARCHIVOS) {
      for (const { linea, texto } of textosDelFuente(leer(rel), rel)) {
        for (const w of formasDeVoseo(texto)) if (!NO_ES_VOSEO.has(w.toLowerCase())) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, `Voseo en Tareas. Pásalo a tuteo:\n${hallados.join("\n")}`).toEqual([]);
  });

  it("la guarda mira algo", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(30);
  });
});
