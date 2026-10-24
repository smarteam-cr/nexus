# La empresa como objeto central — plan de arquitectura

> Pedido de Elías del 2026-10-23: que la empresa sea el centro de Nexus, como en un CRM profesional. Enriquecida con la
> investigación, el tamaño, la industria, el TAM, el perfil y la escala; sincronizada con HubSpot en los dos sentidos; con
> documentos que existan sin proyecto, y lista para vender, atender con IA y hacer venta cruzada. Revisado contra el
> esquema y la base de producción en solo lectura el mismo día. **Nada construido.** En el roadmap es el área R. El plano
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
- Nexus escribe sus 9 propiedades `nexus_*` de la ficha, los encargados, el siguiente paso y notas.
- Nexus nunca escribe la industria, los empleados, la facturación, el país ni el TAM.

**Un documento no puede existir sin proyecto:**
- Cada documento (`ProjectCanvas`) es de un proyecto o de una propuesta comercial.
- Un diagnóstico personalizado para un prospecto no se puede hacer hoy.
- El parche es «Información del cliente», un proyecto falso (`__strategy__`) que aparece en 32 archivos. Hay 94 para 88
  empresas (6 tienen dos) y arrastra canvases que no son suyos.

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
     estándar (industria, empleados) se escriben solo si en HubSpot están vacías, o con el sí del vendedor (B1).
3. **R3 · Los documentos de la empresa, con o sin proyecto.**
   - Cada documento lleva la empresa como dueña; el proyecto y la propuesta pasan a ser opcionales.
   - Con eso se puede hacer un diagnóstico personalizado para un prospecto, y el documento de resultados de la preventa
     (C5).
   - Lleva una carga inicial y una regla en la base, y toca los permisos y la vista que ve el cliente.
4. **R4 · Retirar «Información del cliente» como proyecto falso.**
   - Va después de R3: los procesos pasan a un documento de la empresa, se resuelven las 6 empresas con dos, y se limpian
     los canvases que no son suyos.
   - Mientras tanto, ordenar la búsqueda para que siempre tome el mismo.
5. **R5 · Las investigaciones son de la empresa.**
   - La investigación web (sector, herramientas, hitos, contrataciones) se guarda en la empresa con su fecha y sus
     fuentes, y la preventa la lee.
   - Se rehace cuando vence, no en cada preventa. Sirve a K3 y a la venta cruzada.
6. **R6 · Una persona del cliente, con su rol.**
   - Una tabla de personas por empresa (correo único por empresa, nombre, cargo, su contacto de HubSpot) y su rol:
     decide, influye, usa; interna o externa.
   - La alimentan los contactos de HubSpot; los cuestionarios y los participantes de las reuniones apuntan a ella. Los
     textos de la ficha y del handoff no se tocan al principio.
   - Sirve a K4, E2 y la atención con IA.
7. **R7 · Endurecer las llaves.**
   - La dueña de cada reunión (`resolvedClientId`) pasa a ser una relación de verdad (hoy no hay huérfanas).
   - La empresa de HubSpot pasa a ser única, después de fusionar el grupo duplicado.
   - Es de bajo riesgo y protege la invariante de no mezclar clientes.
8. **R8 · Limpiar lo viejo.**
   - Borrar los campos vacíos y vencidos (en un SQL aparte, revisado, porque es irreversible).
   - Quitar los escritores de `ClientContextCard`.
   - Pasar los lectores de `ClientCsSignals` a las tablas de HubSpot.
   - Partir la ruta `analyze` de 3.385 líneas.
9. **R9 · La historia de la ficha en una tabla:** los cambios y las propuestas de cada campo, no dentro de un Json de
   114 kB.
10. **R10 · Corregir ARCHITECTURE.md** donde ya no dice la verdad:
    - la regla de los estados: en la práctica son textos con su catálogo, no enums;
    - la deuda de §12 que ya cambió.
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

**Lo que no se hace:** renombrar `FirefliesSession` (176 archivos, poco beneficio) ni migrar los 104 estados de texto a
enums.

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
