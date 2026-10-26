# La empresa como objeto central — plan de arquitectura

> Pedido de Elías del 2026-10-23: que la empresa sea el centro de Nexus, como en un CRM profesional. Enriquecida con la
> investigación, el tamaño, la industria, el TAM, el perfil y la escala; sincronizada con HubSpot en los dos sentidos; con
> documentos que existan sin proyecto, y lista para vender, atender con IA y hacer venta cruzada. Revisado contra el
> esquema y la base de producción en solo lectura el mismo día. **Construido después, por partes (ver el estado de cada
> ítem en el área R del roadmap); R3 etapas 2 y 3, el 2026-10-27** (DECISIONS «El kickoff, la Planificación y los
> documentos de la empresa»). En el roadmap es el área R. El plano
> de hoy está en el artefacto «Lo que Nexus sabe de una empresa».

## Lo que se encontró

**Los datos de la empresa no tienen un solo dueño.** De 200 empresas (163 clientes y 35 prospectos):
- `tamUsd`, `notes` y `canvas` están vacíos en las 200.
- `industry` solo en 47.
- **La industria vive en cinco lugares:** la empresa, HubSpot (leído en vivo), la investigación de la preventa, una casilla
  de la preventa y la edición de la escala. No hay regla de cuál manda: los agentes leen la empresa y la preventa
  prefiere HubSpot.
- **El tamaño** (empleados y facturación) se lee de HubSpot en vivo y nunca se guarda. El único tamaño guardado está
  dentro de la preventa.
- **El perfil de negocio** está en la preventa, en la posición de la escala y en la ficha.
- **La investigación de la empresa** («Radiografía»: sector, herramientas, hitos) vive dentro de la preventa, no en la
  empresa.

**HubSpot va casi en un solo sentido:**
- Hay cinco listas distintas de propiedades que se leen.
- Nexus escribe las de la ficha (8 propiedades `nexus_*`, 7 de texto y una lista, y 2 notas), los encargados y el
  siguiente paso (`siguiente_paso_<equipo>` en empresas, negocios y proyectos).
- Nexus nunca escribe la industria, los empleados, la facturación, el país ni el TAM.

**Un documento no puede existir sin proyecto:**
- Cada documento (`ProjectCanvas`) es de un proyecto o de una propuesta comercial.
- Un diagnóstico personalizado para un prospecto no se puede hacer hoy.
- El parche es «Información del cliente», un proyecto falso (`__strategy__`) que aparece en 32 archivos. Hay 94 para 88
  empresas (tres tienen más de uno: Ministerio de Economía 5, AMC 2 y Librería 2) y arrastra canvases que no son suyos.

**Las personas del cliente están en cinco copias sin unir:**
- los contactos de HubSpot (1.419);
- las personas de los cuestionarios;
- los stakeholders del handoff y de la ficha (texto);
- las personas de la preventa (Json);
- los participantes de las reuniones: 1.612 correos, de los que solo 567 son contactos.

No hay una persona con su rol en la empresa.

**Lo viejo que sigue vivo:**
- campos sin uso (`isProspect`, con su fecha de borrado vencida; `Client.canvas`, `Project.canvas`,
  `lastSessionSummary`, `pendingItems`);
- `ClientContextCard`, con escritores vivos en una ruta de 3.385 líneas;
- `ClientCsSignals`, una copia en Json de lo que ya está en tablas;
- dos llaves sin su relación en la base: `resolvedClientId`, que sostiene la invariante de no mezclar clientes, y
  `hubspotCompanyId`, que no es único y tiene un grupo duplicado.

## Lo que se busca

1. **La empresa tiene sus datos en columnas,** cada uno con de dónde salió y cuándo. Una sola regla dice quién manda en
   cada dato: HubSpot, Nexus o una persona.
2. **HubSpot es un espejo en los dos sentidos:** lo que Nexus enriquece (TAM, tamaño, perfil, escala, tráfico, si
   califica para Insider) se escribe en la empresa de HubSpot, y lo que Ventas cambia allá se lee.
3. **Los documentos y las investigaciones son de la empresa;** el proyecto es opcional.
4. **Una persona del cliente es una sola,** con su rol en la empresa.
5. **Los agentes leen un solo contexto de la empresa** (IA first), y Nexus dice qué le falta comprar a cada una (venta
   cruzada) desde la escala y los casos de uso.

## Los cambios, por impacto

1. **R1 · Los datos de la empresa en columnas.**
   - Empleados, país, sitio web, industria (el código de HubSpot), TAM, perfil de negocio (cómo cierra y qué pasa
     después), edición de la escala, tráfico, base con consentimiento y si califica para Insider.
   - Cada uno con su fuente y su fecha.
   - SQL aditivo y una carga inicial desde las preventas y HubSpot. Es la base de B1, B2, N y O.
2. **R2 · Un solo módulo de la empresa de HubSpot** (`lib/hubspot/empresa.ts`).
   - Una tabla que dice, campo por campo, qué propiedad de HubSpot es, quién manda y en qué sentido va (leer, escribir o
     los dos).
   - Reemplaza las cinco listas de hoy y la escritura de la ficha.
   - Empieza escribiendo propiedades `nexus_*` (TAM, perfil, escala, tráfico, Insider), que no pisan a Ventas. Las
     estándar (industria, empleados) se escriben solo si en HubSpot están vacías, o cuando el usuario de Nexus que lo
     está usando, según su rol, usa o edita la propuesta (2026-10-24). El detalle, en
     `docs/empresa-datos-hubspot-plan.md`.
3. **R3 · Los documentos de la empresa, con o sin proyecto.**
   - Cada documento lleva la empresa como dueña; el proyecto y la propuesta pasan a ser opcionales.
   - Con eso se puede hacer un diagnóstico personalizado para un prospecto, y el documento de resultados de la preventa
     (C5).
   - Lleva una carga inicial y una regla en la base, y toca los permisos y la vista que ve el cliente.
4. **R4 · Retirar «Información del cliente» como proyecto falso.**
   - Etapa previa: unir los contenedores repetidos de las tres empresas que tienen más de uno, con su script en
     simulacro.
   - Va después de R3: los procesos pasan a un documento de la empresa y se limpian los canvases que no son suyos.
   - Mientras tanto, ordenar la búsqueda para que siempre tome el mismo.
5. **R5 · Las investigaciones son de la empresa.**
   - La investigación web (sector, herramientas, hitos, contrataciones y tamaño estimado) se guarda en la empresa con su
     fecha y sus fuentes (paso uno); que la preventa la lea de ahí va después de K7 y K1 en `main`, o en la misma sesión
     que K, porque comparten `lib/exploraciones/agente.ts` y `esquemas.ts`.
   - Se rehace cuando vence, no en cada preventa. Sirve a K3 y a la venta cruzada.
6. **R6 · Una persona del cliente, con su rol.**
   - Una tabla de personas por empresa (correo único por empresa, nombre, cargo, su contacto de HubSpot) y su rol:
     decide, influye, usa; interna o externa.
   - La alimentan los contactos de HubSpot; los cuestionarios y los participantes de las reuniones apuntan a ella. Los
     textos de la ficha y del handoff no se tocan al principio.
   - Sirve a K4, E2 y la atención con IA.
7. **R7 · Endurecer las llaves** (el día 0 del paso uno, en una sola sesión en `main`: es lo único que cambia a la vez
   `FirefliesSession` y `Client` en `schema.prisma`).
   - La dueña de cada reunión (`resolvedClientId`) pasa a ser una relación de verdad.
   - La empresa de HubSpot pasa a ser única, después de fusionar el grupo duplicado (Areyas y Areyá: «Lo que decides tú»
     23 del roadmap).
   - **Antes del SQL:** una consulta de solo lectura, **justo antes**, que busque `manualClientId` y `resolvedClientId`
     huérfanos y grupos con el mismo `hubspotCompanyId` (no se fijan ids hoy); y que `local-pull-context.ts` suelte o
     traiga al dueño de una reunión que no viene en el lote.
   - **El SQL se puede correr dos veces** (`DO $$ … IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`; `NOT VALID` y
     después `VALIDATE` es opcional).
   - **El `onDelete` se anota en DECISIONS antes del SQL.** Recomendado: `resolvedClientId` → Restrict (la invariante 1
     prefiere un error visible a reuniones sin dueño en silencio) y `manualClientId` → SetNull (es higiene: es la
     «lápida» de `app/api/clients/[id]/route.ts:116-128`).
   - La fusión de empresas sigue moviendo los dos punteros antes de borrar la empresa, con su prueba.
   - Una invariante comprueba que existen la llave foránea y el índice único, porque `check:esquema` no los ve.
   - Volver atrás: `DROP CONSTRAINT`.
   - Protege la invariante de no mezclar clientes.
8. **R8 · Limpiar lo viejo.**
   - Borrar los campos vacíos y vencidos (en un SQL aparte, revisado, porque es irreversible). `isProspect` todavía lo
     escribe `lib/clients/fusion-de-empresas.ts:421` y 9 empresas lo tienen en true: R8 quita ese escritor antes del
     DROP.
   - Quitar los escritores de `ClientContextCard`.
   - Pasar los lectores de `ClientCsSignals` a las tablas de HubSpot.
   - Partir la ruta `analyze` de 3.385 líneas.
9. **R9 · La historia de la ficha en una tabla:** los cambios y las propuestas de cada campo (hoy la historia suma
   9,6 kB y la ficha más grande pesa 23 kB). Es la tabla `PropuestaDeDato` de `docs/empresa-datos-hubspot-plan.md`.
10. **R10 · Corregir ARCHITECTURE.md** donde ya no dice la verdad:
    - la regla de los estados: en la práctica son textos con su catálogo, no enums;
    - la deuda de §12 que ya cambió;
    - lo medido el 2026-10-24: `analyze` tiene 3.385 líneas y `ProjectCanvasPanel` 1.364; hay 128 `page.tsx`, 512
      `route.ts`, 197 modelos, 92 enums y 89 carpetas en `lib/`; siguen sin existir `lib/api/parse.ts` y
      `lib/ai/parse-json-output.ts`.
11. **R11 · Un solo contexto de la empresa para los agentes.**
    - Un lector que arma, en un lugar: los datos de la empresa, la investigación, la posición en la escala, los casos de
      uso, las personas y la memoria de la cuenta.
    - Cada agente lo lee desde ahí, en vez de armarlo por su cuenta.
    - Es la base de la atención con IA y del agente por cliente (E2).
12. **R12 · Lo que le falta comprar a cada empresa** (venta cruzada).
    - Con la posición en la escala y los casos de uso (los vendidos, los sugeridos y los descartados), Nexus muestra por
      empresa qué casos la moverían y no tiene.
    - Ventas lo ve en la cuenta; el CSE, al cerrar un ciclo o una implementación.
    - Se puede escribir en HubSpot como propiedad de la empresa (el siguiente caso sugerido).
13. **R13 · Smarteam, la empresa que usa Nexus** (Elías, 2026-10-24: el cliente ideal, las buyer personas y lo demás de
    Smarteam tienen que estar bien armados en la arquitectura y fáciles de usar).
    - **Hoy:** Smarteam ya es un `Client` de tipo `INTERNO` (con su `hubspotCompanyId`). El cliente ideal (`IcpItem`, 44
      filas) y las buyer personas (`BuyerPersona`, 4) son tablas sueltas de Marketing, sin relación con esa ficha, y solo
      los leen `lib/marketing/agents/generate-ideas.ts` y `lib/documentacion/vivos.ts`.
    - **El perfil de la empresa que usa Nexus**, colgando de su ficha: el cliente ideal, las buyer personas, la propuesta
      de valor y el position statement (K3), los servicios y sus tarifas, los clientes de referencia por industria (K4) y
      el tono de la marca. Se edita en una pantalla; lo de hoy se muda sin perder nada (SQL aditivo y una carga con
      simulacro).
    - **Un solo lector** (`lib/smarteam/contexto.ts` o el que se elija) para la preventa, las propuestas, el analizador
      de reuniones de venta y Marketing: es la pieza de R11 que habla de Smarteam y no del cliente.
    - **El encaje con el cliente ideal:** cada empresa dice qué tanto se parece al cliente ideal, con su porqué, al lado
      de su TAM.
    - **Pensado para varias empresas:** el perfil es de la empresa que usa Nexus (hoy una sola), no una constante en el
      código; así no se cierra la puerta a un SaaS (ARCHITECTURE §0).

**Lo que no se hace:** renombrar `FirefliesSession` (176 archivos, poco beneficio) ni migrar los 104 estados de texto a
enums.

## Criterio de éxito

- **R7:** 0 reuniones huérfanas, 0 grupos con el mismo `hubspotCompanyId`, y la invariante de la llave en verde.
- **R10:** ARCHITECTURE leído contra el código en §2.6 y §12 (`doc-sync` no los cubre).
- **R1, R2 y R5:** el criterio de `docs/empresa-datos-hubspot-plan.md`.
- **R4:** «Información del cliente» baja de 94 a 0.

## Orden

1. **R7 y R10:** bajo riesgo, protegen lo que hay.
2. **R1 y R2:** con B1. Es lo que pide la escala 9.0 (el perfil y el tráfico) y la sincronización con HubSpot.
3. **R5 y R6:** antes de K3, K4 y E2.
4. **R3 y R4:** antes de C5 (el documento de resultados de la preventa).
5. **R11 y R12:** cuando estén R1, R5 y R6.
6. **R8 y R9:** cuando se toque cada parte; el borrado, en su propio SQL revisado.

## Cuidados

- Todo SQL es aditivo, salvo el borrado de R8, que va aparte, revisado y con simulacro.
- Escribir en HubSpot pisa lo que ve Ventas: solo propiedades `nexus_*` al principio, y las estándar con regla.
- R3 toca la vista externa y los permisos: se prueba con un diagnóstico de un prospecto y uno de un proyecto antes del
  deploy.
