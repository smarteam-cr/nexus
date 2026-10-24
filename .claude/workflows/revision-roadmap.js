export const meta = {
  name: 'revision-roadmap',
  description: 'Revisa el roadmap de Nexus y sus planes con ocho lentes, verifica cada propuesta y arma la lista de cambios',
  whenToUse: 'Cuando el roadmap cambió mucho o antes de empezar a programar una tanda grande. args: { contexto?: "qué viene y qué decidió Elías hace poco" }',
  phases: [
    { title: 'Lentes', detail: 'ocho revisores, cada uno con un ángulo distinto' },
    { title: 'Verificación', detail: 'un escéptico por lente revisa cada propuesta' },
    { title: 'Síntesis', detail: 'la lista final de cambios, sin repetidos ni choques' },
  ],
}

const DOCS = `docs/roadmap.md (el roadmap: el Resumen, la propuesta por áreas con «Orden sugerido», «Lo que decides tú», «Lo que configuras tú» y «Lo que falta, por tema»)
y cada plan que el roadmap nombra en «Los planes escritos» (léelos desde ahí: la lista cambia)`

const BASE = `Revisas el roadmap de Nexus y sus planes antes de que se empiece a programar en paralelo. SOLO LECTURA: no edites ningún
archivo (el roadmap lo edita la sesión principal). Los documentos: ${DOCS}.
${args && args.contexto ? `Contexto: ${args.contexto}` : 'Contexto: lo que dice el Resumen del roadmap sobre lo que sigue.'}
Cada propuesta tuya cita el texto actual tal cual (para ubicarlo) y dice el cambio exacto. Solo propuestas que mejoran algo
de verdad; si un documento está bien en tu lente, no inventes.`

const PROPUESTAS = {
  type: 'object',
  properties: {
    propuestas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          documento: { type: 'string' },
          ubicacion: { type: 'string', description: 'Área, ítem o sección (ej. «R1 etapa 4», «Orden sugerido, paso 3»)' },
          tipo: { type: 'string', enum: ['corregir', 'agregar', 'quitar', 'mover', 'juntar', 'preguntar_a_elias'] },
          gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          textoActual: { type: 'string', description: 'El texto actual citado tal cual, o vacío si es agregar' },
          cambio: { type: 'string', description: 'El texto nuevo o la acción exacta' },
          porque: { type: 'string', description: 'La razón, con la evidencia (otra línea citada, un archivo de código, una consulta)' },
        },
        required: ['documento', 'ubicacion', 'tipo', 'gravedad', 'textoActual', 'cambio', 'porque'],
      },
    },
  },
  required: ['propuestas'],
}

const VERIFICACION = {
  type: 'object',
  properties: {
    veredictos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indice: { type: 'number' },
          vale: { type: 'boolean', description: 'false si es incorrecta, no aporta, ya está resuelta en otro lado o el texto citado no existe' },
          razon: { type: 'string' },
          ajuste: { type: 'string', description: 'Si vale con un cambio, cuál; vacío si no' },
        },
        required: ['indice', 'vale', 'razon', 'ajuste'],
      },
    },
  },
  required: ['veredictos'],
}

const LENTES = [
  { clave: 'orden', foco: `ORDEN Y DEPENDENCIAS TÉCNICAS. Lee el «Orden sugerido» y los «Depende de» de cada ítem, y contrástalos con el código (prisma/schema.prisma, lib/). ¿Algo está antes de lo que necesita (una tabla, un módulo, una decisión)? ¿Algo podría ir antes y no va? Para el paso uno en paralelo: ¿qué archivos, tablas o modelos tocan a la vez Google (U1), HubSpot (U6), reuniones (T1, T2) y la empresa (R7, R10, R1, R2, R5)? Propón el reparto que evita choques (qué va primero, qué SQL se junta, quién toca FirefliesSession o Client).` },
  { clave: 'verdad', foco: `LO QUE DICE CONTRA EL CÓDIGO. Elige al menos 25 afirmaciones de «Hoy», «Existe a medias», «No existe» o números, repartidas en todas las áreas, y compruébalas contra el código (grep, lectura) y, si hace falta, contra la base en solo lectura (node con pg y DATABASE_URL del .env, solo SELECT). Propón corregir cada una que ya no es cierta, con la evidencia.` },
  { clave: 'division', foco: `DIVISIÓN Y SOLAPES. ¿Hay ítems que son lo mismo en dos áreas (por ejemplo T6 y U1, U12 y B3, H1 y P5, L1 y T2, B1 dentro de R1) sin decir cuál manda? ¿Áreas demasiado grandes para entregarse por partes, o ítems que deberían partirse o juntarse? ¿Numeración rota, referencias a planes o secciones que no existen, ítems en «Lo que falta» o «Más adelante» que ya tienen área?` },
  { clave: 'criterios', foco: `CRITERIOS DE ÉXITO. Cada tarjeta del Resumen y cada área tiene uno. ¿Es medible con un número que alguien puede sacar (con qué consulta, en qué pantalla)? ¿Mide uso real y no solo «está construido» (eso da falsa seguridad)? ¿Tiene su número de hoy? Propón el criterio corregido y cómo se mide, para los que fallan.` },
  { clave: 'ingenieria', foco: `BUENAS PRÁCTICAS DE INGENIERÍA EN CADA PLAN. Para cada plan: ¿dice qué cambia en el modelo de datos y con qué SQL aditivo, qué pruebas lleva (y de qué tipo), cómo se despliega sin romper lo de hoy (corte limpio, convivencia con lo viejo), cómo se vuelve atrás, qué se mide (costo de IA, jobs que avisan), y respeta el chokepoint de reuniones? Señala los planes a los que les falta algo de eso y propón el texto.` },
  { clave: 'coherencia', foco: `COHERENCIA DE DECISIONES. Busca contradicciones entre el roadmap, los planes y docs/DECISIONS.md (busca la sección con grep -n "^## " y lee solo la que corresponde). Especialmente las respuestas del 24 oct: vender por valor (las horas dan el precio mínimo), el CSE acepta y la CSL revisa, la escala se prueba con cualquier empresa, tres versiones del test, el usuario decide los datos de la empresa y escribe en HubSpot, el aviso de reunión sin texto va en la reunión. ¿Quedó texto viejo que dice otra cosa?` },
  { clave: 'faltantes', foco: `LO QUE FALTA. Riesgos sin nombrar, decisiones en «Lo que decides tú» que ya se resolvieron o que frenan el paso uno, pasos de configuración que faltan, partes sin plan, personas del equipo que tienen que validar algo y no están nombradas, y lo que el equipo pidió (feedback del 23 oct) que no quedó en ninguna área.` },
  { clave: 'lectura', foco: `QUE ELÍAS LO ENTIENDA FÁCIL. Elías quiere entender sin leer de más. Lee el Resumen y «Lo que importa esta semana» como lo leería él: ¿se entiende qué sigue, qué decidió y qué falta? ¿Hay jerga, frases muy largas, siglas sin explicar, tarjetas desordenadas respecto de la prioridad, información repetida? Propón reescrituras concretas y cortas, en español con tuteo.` },
]

phase('Lentes')
const resultados = await pipeline(
  LENTES,
  (l) => agent(`${BASE}\n\nTU LENTE: ${l.foco}`, { label: `lente:${l.clave}`, phase: 'Lentes', schema: PROPUESTAS }),
  (res, l) => {
    const ps = res ? res.propuestas : []
    if (!ps.length) return { lente: l.clave, propuestas: [] }
    return agent(
      `${BASE}\n\nEres el escéptico de la lente «${l.clave}». Revisa cada propuesta contra los documentos y el código. Marca vale=false si el texto citado no existe, si es incorrecta, si ya está resuelta en otro lugar del roadmap, o si no aporta. Por defecto, ante la duda, vale=false.\n\nPROPUESTAS:\n${ps.map((p, i) => `[${i}] ${p.documento} · ${p.ubicacion} · ${p.tipo} (${p.gravedad})\nActual: ${p.textoActual}\nCambio: ${p.cambio}\nPorque: ${p.porque}`).join('\n\n')}`,
      { label: `escéptico:${l.clave}`, phase: 'Verificación', schema: VERIFICACION },
    ).then((v) => {
      const porIndice = new Map((v ? v.veredictos : []).map((x) => [x.indice, x]))
      return { lente: l.clave, propuestas: ps.map((p, i) => ({ ...p, lente: l.clave, verificacion: porIndice.get(i) || null })) }
    })
  },
)

const todas = resultados.filter(Boolean).flatMap((r) => r.propuestas)
const validas = todas.filter((p) => p.verificacion && p.verificacion.vale)
log(`Propuestas: ${todas.length}; en pie después del escéptico: ${validas.length}.`)

phase('Síntesis')
const sintesis = await agent(
  `${BASE}\n\nJunta las propuestas que quedaron en pie después de la verificación en UNA lista de cambios para aplicar. Junta las repetidas, resuelve los choques entre lentes (di cuál gana y por qué) y aplica el ajuste del escéptico cuando lo hay. Ordénalas: primero lo que frena el paso uno, después lo de gravedad alta. Aparte, la lista corta de preguntas para Elías que de verdad no se pueden decidir sin él (en palabras simples). Devuelve markdown.\n\nPROPUESTAS EN PIE:\n${JSON.stringify(validas, null, 1)}`,
  { label: 'síntesis', phase: 'Síntesis' },
)

return { total: todas.length, enPie: validas.length, descartadas: todas.length - validas.length, sintesis, propuestas: validas }
