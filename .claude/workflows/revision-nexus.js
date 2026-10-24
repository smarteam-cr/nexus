export const meta = {
  name: 'revision-nexus',
  description: 'Revisa un cambio de Nexus con revisores especializados, verifica cada hallazgo y dice qué no quedó garantizado',
  whenToUse: 'La dispara la skill /revisar, que además arregla lo encontrado y se lo cuenta a Elías: para revisar un cambio, usa /revisar. args: { rango?: "base..head", foco?: "qué mirar con más cuidado", nivel?: "normal" | "completo" }',
  phases: [
    { title: 'Alcance', detail: 'qué cambió, de qué tipo, y qué revisores aplican' },
    { title: 'Pruebas reales', detail: 'tsc, eslint, vitest y lo que aplique, corridos de verdad' },
    { title: 'Revisión', detail: 'un revisor por riesgo de Nexus' },
    { title: 'Verificación', detail: 'cada hallazgo, contra dos escépticos' },
    { title: 'Prueba de rojo', detail: 'las pruebas nuevas fallan si se quita el cambio' },
    { title: 'Lo que no se garantiza', detail: 'el crítico de la falsa seguridad' },
    { title: 'Informe', detail: 'para Elías, en simple' },
  ],
}

// ── Esquemas ────────────────────────────────────────────────────────────────────────────────
const ALCANCE = {
  type: 'object',
  properties: {
    rango: { type: 'string', description: 'El rango de git que se revisa ("base..head"), o "trabajo" si son cambios sin commitear' },
    comandoDiff: { type: 'string', description: 'El comando exacto que muestra el diff completo' },
    intencion: { type: 'string', description: 'Qué quiere lograr el cambio, en dos frases, según los mensajes de commit y el código' },
    archivos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruta: { type: 'string' },
          tipo: { type: 'string', enum: ['ui', 'api', 'lib', 'prueba', 'sql', 'script', 'prompt', 'esquema', 'config', 'doc'] },
          lineas: { type: 'number' },
        },
        required: ['ruta', 'tipo', 'lineas'],
      },
    },
    tocaReuniones: { type: 'boolean', description: 'Lee o escribe sesiones/reuniones, SessionProject o resolvedClientId' },
    tocaExterno: { type: 'boolean', description: 'Toca app/external, app/api/external, print, portal o lo que ve el cliente' },
    tocaIA: { type: 'boolean', description: 'Llama a Claude, cambia un prompt o un agente' },
    tocaDatos: { type: 'boolean', description: 'SQL, schema.prisma, scripts que escriben, backfills' },
    tocaUI: { type: 'boolean' },
    pruebasNuevas: { type: 'array', items: { type: 'string' }, description: 'Archivos *.test.ts nuevos o cambiados' },
    sinCommitear: { type: 'boolean' },
  },
  required: ['rango', 'comandoDiff', 'intencion', 'archivos', 'tocaReuniones', 'tocaExterno', 'tocaIA', 'tocaDatos', 'tocaUI', 'pruebasNuevas', 'sinCommitear'],
}

const COMPUERTAS = {
  type: 'object',
  properties: {
    corridas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          comando: { type: 'string' },
          codigoDeSalida: { type: 'number' },
          resultado: { type: 'string', enum: ['verde', 'rojo', 'no_corrio'] },
          culpaDelCambio: { type: 'string', enum: ['si', 'no', 'no_se', 'no_aplica'], description: 'Si es rojo: ¿lo causa este cambio? "no" solo con evidencia (el rojo no toca nada del diff, o ya estaba en la base del rango). Verde o no_corrio: no_aplica' },
          salida: { type: 'string', description: 'Las últimas líneas reales de la salida, copiadas, no resumidas' },
        },
        required: ['comando', 'codigoDeSalida', 'resultado', 'culpaDelCambio', 'salida'],
      },
    },
  },
  required: ['corridas'],
}

const HALLAZGOS = {
  type: 'object',
  properties: {
    revisados: { type: 'array', items: { type: 'string' }, description: 'Cada archivo que leíste de verdad' },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          archivo: { type: 'string' },
          linea: { type: 'number' },
          gravedad: { type: 'string', enum: ['critico', 'alto', 'medio', 'bajo'] },
          titulo: { type: 'string', description: 'El defecto en una frase' },
          escenario: { type: 'string', description: 'Entrada o estado concreto → qué sale mal y a quién le pasa' },
          evidencia: { type: 'string', description: 'La línea de código citada tal cual, o el comando que lo muestra' },
          arreglo: { type: 'string' },
        },
        required: ['archivo', 'linea', 'gravedad', 'titulo', 'escenario', 'evidencia', 'arreglo'],
      },
    },
  },
  required: ['revisados', 'hallazgos'],
}

const VEREDICTO = {
  type: 'object',
  properties: {
    refutado: { type: 'boolean', description: 'true si el hallazgo no ocurre, no importa, o no lo pudiste confirmar' },
    razon: { type: 'string', description: 'Qué leíste o corriste para decidir, con la línea citada' },
  },
  required: ['refutado', 'razon'],
}

const ROJO = {
  type: 'object',
  properties: {
    pruebas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          archivo: { type: 'string' },
          conElCambio: { type: 'string', enum: ['verde', 'rojo', 'no_corrio'] },
          sinElCambio: { type: 'string', enum: ['verde', 'rojo', 'no_concluyente', 'no_corrio'], description: 'no_concluyente: falla porque falta una función o un import nuevo, no por lo que comprueba' },
          nota: { type: 'string' },
        },
        required: ['archivo', 'conElCambio', 'sinElCambio', 'nota'],
      },
    },
  },
  required: ['pruebas'],
}

const VACIOS = {
  type: 'object',
  properties: {
    noGarantiza: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          que: { type: 'string', description: 'Lo que esta revisión no comprobó' },
          porque: { type: 'string' },
          comoComprobarlo: { type: 'string', description: 'Quién y cómo: un comando, una prueba en el 3004, una pregunta a Elías' },
        },
        required: ['que', 'porque', 'comoComprobarlo'],
      },
    },
  },
  required: ['noGarantiza'],
}

const INFORME = {
  type: 'object',
  properties: {
    veredicto: { type: 'string', enum: ['listo', 'listo_con_cuidado', 'no_listo'] },
    informe: { type: 'string', description: 'El informe en markdown, en español con tuteo, para Elías' },
  },
  required: ['veredicto', 'informe'],
}

// ── Los revisores: uno por riesgo de Nexus ───────────────────────────────────────────────────
const REVISORES = [
  {
    clave: 'correccion',
    siempre: true,
    foco: `CORRECCIÓN. ¿El código hace lo que dice la intención? Busca: casos borde (vacío, null, un solo elemento, duplicados),
fechas y zonas horarias (Costa Rica es UTC-6; una fecha @db.Date contra un DateTime), dinero y redondeos, condiciones de
carrera entre dos pestañas o dos jobs, errores que se tragan en silencio, un return que se salta un paso, y lo que el
cambio rompe en quien ya llamaba a la función cambiada (busca los llamadores con grep).`,
  },
  {
    clave: 'invariantes',
    siempre: true,
    foco: `LAS INVARIANTES DE NEXUS (CLAUDE.md, «INVARIANTES MEDULARES»). Comprueba una por una contra el diff:
1) ninguna lectura de reuniones fuera del chokepoint lib/sessions/project-sources.ts; el dueño de una reunión sale solo de
resolvedClientId; nada junta datos de dos clientes en un prompt, una pantalla o un correo;
2) ningún matching sesión→cliente nuevo fuera de lib/sessions/categorize.ts;
3) toda escritura masiva o DDL es dry-run primero y pasa por el guard (resolverApply / assertProdWriteAllowed);
4) ningún secreto en el código ni en .env.example con valor; toda variable nueva del código está en .env.example;
5) colores solo con tokens semánticos (bg-surface, text-fg…), nunca grises crudos;
6) copy nuevo con tuteo.
Además: ¿el cambio contradice una decisión de docs/DECISIONS.md? Busca la sección del módulo con grep -n "^## " y lee solo esa.`,
  },
  {
    clave: 'seguridad',
    cuando: (a) => a.tocaExterno || a.archivos.some((f) => f.tipo === 'api'),
    foco: `SEGURIDAD Y PERMISOS. Cada ruta tocada: ¿pide usuario y el permiso correcto (guardPermission, guardAccessToClient,
requireAccessToClient) ANTES de leer o escribir? ¿«Ver como» queda en solo lectura? ¿valida el cuerpo con Zod? En lo que ve
el cliente (app/external, print, portal): ¿cruza algo interno (notas, montos, otra empresa, horas, «por validar»)? ¿el
select es explícito? Una tabla nueva: ¿su SQL habilita RLS? Un token en la URL: ¿la página es force-dynamic y noindex?`,
  },
  {
    clave: 'datos',
    cuando: (a) => a.tocaDatos,
    foco: `DATOS Y MIGRACIONES. El SQL: ¿solo aditivo (columnas nulas o con default), seguro mientras producción corre el código
viejo, y se puede correr dos veces (IF NOT EXISTS)? ¿habilita RLS en tablas nuevas? ¿un ALTER TYPE ADD VALUE va aparte?
¿schema.prisma coincide con el SQL (nombres, nulos, onDelete explícito)? Un script que escribe: ¿simulacro por defecto,
--apply con el guard, respaldo declarado, idempotente? ¿El código nuevo funciona si el SQL todavía no se aplicó, o lo
detecta check:esquema?`,
  },
  {
    clave: 'pruebas',
    siempre: true,
    foco: `LAS PRUEBAS, CONTRA LA FALSA SEGURIDAD. Para cada prueba nueva o cambiada: ¿se pondría en rojo si el código se
rompe, o pasa igual (mocks que reemplazan lo que se prueba, expected copiado de la salida, solo el camino feliz)? ¿Vive
bajo lib/** (fuera de ahí no corre)? ¿Un ratchet o un golden se relajó o se regeneró para callarlo? Para la lógica nueva sin
prueba: ¿cuál es el caso que falta y qué rompería? Reporta como hallazgo cada lógica importante sin una prueba que la
pondría en rojo.`,
  },
  {
    clave: 'ia',
    cuando: (a) => a.tocaIA,
    foco: `IA Y COSTO. ¿La llamada pasa por el cliente único (lib/anthropic.ts) y el medidor (lib/ai/medidor.ts) con su
agentSlug? ¿El modelo tiene tarifa en lib/ai/precios.ts? ¿El JSON se lee con los helpers (section-schema, repair), no con
JSON.parse(texto.match(...))? ¿El contexto del prompt sale del chokepoint y es de UN solo cliente? ¿Cuánto cuesta una
corrida y cuántas corridas por día dispara el cambio? ¿Un prompt editado por un humano en la base se puede pisar?`,
  },
  {
    clave: 'ui',
    cuando: (a) => a.tocaUI,
    foco: `EL CONTRATO DE UNA PANTALLA (ARCHITECTURE §1-UI, o §1-WEB si es un documento del cliente). Primitivas de
components/ui y no controles inventados; PageHeader único; skeleton en loading.tsx y registrado; estados de vacío, error y
carga; tokens semánticos; tuteo; nada de horas ni códigos de la escala para el cliente. ¿Qué ve una persona sin permiso?
¿Qué pasa con 0 elementos y con 200?`,
  },
  {
    clave: 'simplicidad',
    siempre: true,
    foco: `SIMPLICIDAD Y UNA SOLA FUENTE. ¿El cambio re-implementa algo que ya existe (busca con grep una función que decide lo
mismo)? ¿Deja dos lugares que deciden la misma regla? ¿Código muerto, parámetros sin uso, una abstracción que se usa una
vez? Solo reporta lo que cuesta de verdad: una segunda fuente de verdad que va a divergir es alto; un nombre feo es bajo.`,
  },
]

// ── 1. Alcance ───────────────────────────────────────────────────────────────────────────────
phase('Alcance')
const pedido = args && typeof args === 'object' ? args : {}
const alcance = await agent(
  `Delimita el cambio que se va a revisar en el repo de Nexus (directorio actual).
${pedido.rango ? `El rango pedido es «${pedido.rango}».` : `No se pidió rango. Regla: si hay cambios sin commitear (git status), revisa esos contra HEAD (rango "trabajo", comandoDiff "git diff HEAD"); si no, el último commit (HEAD~1..HEAD).`}
Usa git (status, log, diff --stat, diff) para listar cada archivo cambiado con su tipo y cuántas líneas cambian, y escribe la
intención en dos frases. Las banderas toca* son true solo si el diff de verdad toca eso. No revises nada todavía.`,
  { label: 'alcance', phase: 'Alcance', schema: ALCANCE, effort: 'low' },
)
if (!alcance) throw new Error('No se pudo delimitar el cambio.')
log(`Se revisa ${alcance.rango}: ${alcance.archivos.length} archivos. ${alcance.intencion}`)

const contexto = `EL CAMBIO: ${alcance.rango} (diff completo: \`${alcance.comandoDiff}\`).
INTENCIÓN: ${alcance.intencion}
ARCHIVOS: ${alcance.archivos.map((f) => `${f.ruta} (${f.tipo}, ${f.lineas} líneas)`).join('; ')}
${pedido.foco ? `FOCO PEDIDO: ${pedido.foco}` : ''}`

// ── 2. Pruebas reales (en paralelo con la revisión) ─────────────────────────────────────────
const compuertasP = agent(
  `${contexto}

Corre DE VERDAD estas compuertas y copia la salida real; nunca digas que algo pasó sin haberlo corrido:
1. node --max-old-space-size=8192 ./node_modules/typescript/lib/tsc.js --noEmit -p .
2. npx eslint <cada archivo .ts/.tsx cambiado que exista>
3. npx vitest run <las carpetas de lib/ de los archivos cambiados> (si no hay ninguna, lib/ entero no: di no_corrio y por qué)
4. Si el cambio toca SQL o schema.prisma: npm run check:esquema
5. Si el cambio toca reuniones, tareas, cobranza o datos de clientes: npm run check:invariants (solo lee producción)
Si una compuerta no se puede correr, resultado "no_corrio" con el motivo en salida. Un error que ya existía antes del
cambio igual es rojo, y en culpaDelCambio dices si lo causa el cambio, con la evidencia en la salida:
- una prueba que falla por tiempo agotado (las que recorren el repo tardan bajo carga): córrela sola antes de llamarla rojo;
- una invariante en rojo: ¿toca datos o código del diff? Si no, "no", con el nombre de la invariante y por qué no;
- ante la duda, "no_se".`,
  { label: 'compuertas', phase: 'Pruebas reales', schema: COMPUERTAS },
)

// ── 3. Revisión + 4. verificación, en tubería ────────────────────────────────────────────────
const aplican = REVISORES.filter((r) => r.siempre || (r.cuando && r.cuando(alcance)))
log(`Revisores: ${aplican.map((r) => r.clave).join(', ')}. No aplican: ${REVISORES.filter((r) => !aplican.includes(r)).map((r) => r.clave).join(', ') || 'ninguno'}.`)

const LENTES = [
  { clave: 'reproducir', texto: 'Lee el código real (no solo el diff) y trata de demostrar que el escenario NO ocurre: una guarda antes, un llamador que nunca pasa ese valor, un tipo que lo impide. Si no puedes confirmarlo leyendo o corriendo algo, refutado=true.' },
  { clave: 'impacto', texto: 'Suponiendo que ocurre: ¿a alguien le pasa algo real (un dato mal, una fuga entre clientes, un error en pantalla, plata mal contada)? Si es teórico, de estilo o no lo nota nadie, refutado=true.' },
]

// Barrera a propósito: varios revisores encuentran el mismo defecto (en la primera corrida, cinco vieron el mismo), y
// verificarlo cinco veces es lo más caro de la revisión. Se juntan antes de verificar.
const porRevisor = (
  await parallel(
    aplican.map((r) => () =>
      agent(
        `Eres el revisor de ${r.clave} de un cambio de Nexus. Sé implacable con los defectos reales y no inventes.

${contexto}

${r.foco}

Lee el diff completo y, de cada archivo que toques, el código de alrededor. Cada hallazgo necesita un escenario concreto y la
línea citada. Si no hay hallazgos de tu riesgo, devuelve la lista vacía: es una respuesta válida.`,
        { label: `revisor:${r.clave}`, phase: 'Revisión', schema: HALLAZGOS },
      ).then((res) => (res ? { revisor: r.clave, revisados: res.revisados, hallazgos: res.hallazgos.map((h) => ({ ...h, revisor: r.clave })) } : null)),
    ),
  )
).filter(Boolean)

const PESO = { critico: 4, alto: 3, medio: 2, bajo: 1 }
const crudos = porRevisor.flatMap((x) => x.hallazgos)
// Juntar por cercanía de líneas perdía defectos distintos del mismo archivo (lo encontró /revisar sobre sí mismo): agrupa un
// agente que lee los títulos y escenarios, y solo junta lo que es el MISMO defecto. Un índice que no aparece queda solo.
const GRUPOS = {
  type: 'object',
  properties: { grupos: { type: 'array', items: { type: 'array', items: { type: 'number' } } } },
  required: ['grupos'],
}
const agrupado = crudos.length > 1
  ? await agent(
      `Agrupa los hallazgos de una revisión de código que describen EL MISMO defecto (misma causa y mismo arreglo). Dos
problemas distintos en el mismo archivo o en líneas cercanas van en grupos distintos. Ante la duda, sepáralos.
Devuelve los grupos como listas de índices; cada índice va en un solo grupo.

${crudos.map((h, i) => `[${i}] ${h.archivo}:${h.linea} (${h.gravedad}, ${h.revisor}) ${h.titulo} — ${h.escenario}`).join('\n')}`,
      { label: 'agrupar', phase: 'Revisión', schema: GRUPOS, effort: 'low' },
    )
  : null
const usados = new Set()
const unicos = []
for (const g of agrupado ? agrupado.grupos : []) {
  const miembros = g.filter((i) => Number.isInteger(i) && i >= 0 && i < crudos.length && !usados.has(i))
  if (!miembros.length) continue
  miembros.forEach((i) => usados.add(i))
  const [cabeza, ...resto] = miembros.map((i) => crudos[i]).sort((a, b) => PESO[b.gravedad] - PESO[a.gravedad])
  unicos.push({ ...cabeza, tambien: resto.map((r) => `${r.revisor}: ${r.titulo}`) })
}
crudos.forEach((h, i) => { if (!usados.has(i)) unicos.push({ ...h, tambien: [] }) })
if (crudos.length > unicos.length) log(`${crudos.length - unicos.length} hallazgos repetidos entre revisores se juntaron antes de verificar.`)

// Nivel «normal»: los críticos y altos pasan por los dos escépticos; los medios y bajos, por uno. «completo»: todos por dos.
const completo = pedido.nivel === 'completo'
const todos = (
  await parallel(
    unicos.map((h) => () => {
      const lentes = completo || PESO[h.gravedad] >= 3 ? LENTES : LENTES.slice(0, 1)
      return parallel(
        lentes.map((l) => () =>
          agent(
            `Verifica un hallazgo de una revisión de código de Nexus. ${l.texto}

${contexto}

HALLAZGO (${h.gravedad}) en ${h.archivo}:${h.linea}: ${h.titulo}
Escenario: ${h.escenario}
Evidencia: ${h.evidencia}`,
            { label: `verifica:${h.revisor}:${l.clave}`, phase: 'Verificación', schema: VEREDICTO },
          ),
        ),
      ).then((votos) => {
        const v = votos.filter(Boolean)
        const enPie = v.filter((x) => !x.refutado).length
        // Un verificador que se cayó no es un voto: si no votó nadie, el hallazgo queda en pie «sin verificar».
        // Un voto que falta no cuenta como refutación: sin todos los votos, nunca se descarta (lo encontró /revisar).
        const estado =
          v.length < lentes.length
            ? enPie > 0 ? 'plausible' : 'sin_verificar'
            : enPie === lentes.length ? 'confirmado' : enPie > 0 ? 'plausible' : 'descartado'
        return { ...h, estado, votos: v }
      })
    }),
  )
).filter(Boolean)
const descartados = todos.filter((h) => h.estado === 'descartado')
const sinVerificar = todos.filter((h) => h.estado === 'sin_verificar')
if (sinVerificar.length) log(`⚠ ${sinVerificar.length} hallazgos quedaron sin verificar (se cayeron sus verificadores): siguen en pie.`)
log(`Hallazgos: ${todos.length}; confirmados ${todos.filter((h) => h.estado === 'confirmado').length}, plausibles ${todos.filter((h) => h.estado === 'plausible').length}, descartados ${descartados.length}.`)

// Cobertura: ningún archivo de código queda sin que alguien diga que lo leyó.
// Las rutas se comparan normalizadas (Windows devuelve barras invertidas) y por ruta completa: un nombre corto como
// «ciclo.ts» no puede dar por leídos todos los archivos que se llaman igual.
const normal = (r) => String(r).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
const leidos = porRevisor.flatMap((x) => x.revisados).map(normal)
const sinLeer = alcance.archivos.filter((f) => {
  if (f.tipo === 'doc') return false
  const ruta = normal(f.ruta)
  return !leidos.some((l) => l === ruta || l.endsWith('/' + ruta))
})
if (sinLeer.length) log(`⚠ Ningún revisor dijo haber leído: ${sinLeer.map((f) => f.ruta).join(', ')}`)

// ── 5. Prueba de rojo: las pruebas nuevas tienen que fallar sin el cambio ────────────────────
let rojo = null
if (alcance.pruebasNuevas.length && !alcance.sinCommitear) {
  rojo = await agent(
    `${contexto}

Comprueba que las pruebas nuevas o cambiadas de verdad vigilan el cambio. Estás en una copia aislada del repo.
1. Corre cada una con npx vitest run <archivo>: anota conElCambio.
2. Devuelve a la versión de antes del cambio SOLO los archivos que no son pruebas (git checkout <base del rango> -- <archivos>).
3. Córrelas otra vez: anota sinElCambio. Lo esperado es rojo; si siguen verdes, la prueba no vigila el cambio: dilo en la nota.
   Si fallan porque no existe una función o un import nuevo (no por lo que comprueban), eso no prueba nada: vuelve a
   poner el cambio y quita SOLO la línea donde se usa la lógica nueva (el filtro, la condición); si así fallan, es rojo;
   si no se puede aislar, es no_concluyente.
No commitees nada.`,
    { label: 'prueba-de-rojo', phase: 'Prueba de rojo', schema: ROJO, isolation: 'worktree' },
  )
} else {
  log(alcance.pruebasNuevas.length ? 'Prueba de rojo: no corre sobre cambios sin commitear.' : 'Prueba de rojo: el cambio no trae pruebas nuevas.')
}

const compuertas = await compuertasP

// ── 6. Lo que esta revisión no garantiza ─────────────────────────────────────────────────────
const vacios = await agent(
  `Eres el crítico de la falsa seguridad. Una revisión que dice «todo bien» sin decir qué no miró es peor que ninguna.

${contexto}

Lo que se hizo: revisores ${aplican.map((r) => r.clave).join(', ')}; compuertas ${JSON.stringify(compuertas ? compuertas.corridas.map((c) => ({ comando: c.comando, resultado: c.resultado })) : 'no corrieron')};
prueba de rojo ${rojo ? JSON.stringify(rojo.pruebas.map((p) => ({ archivo: p.archivo, sinElCambio: p.sinElCambio }))) : 'no corrió'};
archivos que ningún revisor dijo leer: ${sinLeer.map((f) => f.ruta).join(', ') || 'ninguno'}.

Lista lo que esta revisión NO comprobó y que podría fallar igual: lo que solo se ve con sesión iniciada en el navegador (el
preview no está logueado), lo que solo pasa con datos reales de producción, los jobs que corren de noche, el SQL sin aplicar,
el deploy, las integraciones (HubSpot, Google, Odoo, Mercury), la IA con transcripciones reales, los caminos sin prueba y las
compuertas en rojo o que no corrieron. Cada uno con cómo comprobarlo. Solo lo que aplica a ESTE cambio.`,
  { label: 'no-garantiza', phase: 'Lo que no se garantiza', schema: VACIOS },
)

// ── 7. Informe ───────────────────────────────────────────────────────────────────────────────
phase('Informe')
const enPie = todos.filter((h) => h.estado !== 'descartado')
// El veredicto lo decide el guion, con una regla fija; el informe solo lo explica.
const graves = (h) => h.gravedad === 'critico' || h.gravedad === 'alto'
const rojosDelCambio = (compuertas ? compuertas.corridas : []).filter((c) => c.resultado === 'rojo' && c.culpaDelCambio !== 'no')
const veredicto = !compuertas || enPie.some((h) => graves(h) && h.estado === 'confirmado') || rojosDelCambio.length
  ? 'no_listo'
  : enPie.some(graves) || (rojo && rojo.pruebas.some((p) => p.sinElCambio !== 'rojo'))
    ? 'listo_con_cuidado'
    : 'listo'
const informe = await agent(
  `Escribe el informe de una revisión de código para Elías, el dueño de Nexus. No es programador de oficio: quiere entender qué
pasa sin leer código. Español, tuteo, frases cortas, sin jerga (si hace falta un término, explícalo en la misma frase).

${contexto}

DATOS (no inventes nada fuera de esto):
- Compuertas: ${JSON.stringify(compuertas)}
- Hallazgos en pie (confirmados, plausibles y sin verificar; un «sin verificar» se dice como tal, nunca como descartado): ${JSON.stringify(enPie)}
- Descartados por los verificadores: ${descartados.length}
- Prueba de rojo: ${JSON.stringify(rojo)}
- Lo que no se garantiza: ${JSON.stringify(vacios)}

Forma del informe:
1. Una línea de veredicto. Ya está decidido: «${veredicto === 'no_listo' ? 'No está listo' : veredicto === 'listo_con_cuidado' ? 'Listo, con cuidado' : 'Listo'}».
   Explica por qué en una frase. (La regla: «No está listo» con un crítico o alto confirmado, o una compuerta en rojo que
   causa el cambio o no se sabe; «Listo, con cuidado» con un crítico o alto plausible o sin verificar, o una prueba nueva
   que no se puso en rojo sin el cambio.) Un rojo que ya estaba se cuenta aparte, con su nombre, sin cambiar el veredicto.
2. «Qué cambia»: dos o tres frases de qué hace el cambio para el equipo.
3. «Lo que hay que arreglar»: cada hallazgo en pie, juntando los repetidos, del más grave al menos: qué pasa, a quién, en
   palabras de la pantalla; al final, entre paréntesis, archivo:línea y si está confirmado o es plausible.
4. «Lo que sí se comprobó»: cada compuerta con su resultado real, y la prueba de rojo.
5. «Lo que esta revisión no garantiza»: la lista del crítico, cada uno con cómo comprobarlo.
Sin adornos, sin felicitaciones, sin «todo se ve bien» si hay vacíos.`,
  { label: 'informe', phase: 'Informe', schema: INFORME },
)

return {
  veredicto,
  informe: informe ? informe.informe : 'No se pudo escribir el informe.',
  alcance,
  compuertas,
  hallazgos: enPie,
  descartados: descartados.length,
  pruebaDeRojo: rojo,
  noGarantiza: vacios ? vacios.noGarantiza : [],
  sinLeer: sinLeer.map((f) => f.ruta),
}
