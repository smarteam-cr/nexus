# Checklist de prueba clickeada — antes del deploy (2026-08-11)

37 commits sin subir, del 2026-08-06 al 2026-08-11. El gate automático ya pasó
(lint · 2.324 tests · tsc · build) y la auditoría adversarial encontró y arregló 8 defectos
reales. Lo que sigue es lo único que ningún test puede hacer: mirarlo con los ojos.

**Dónde probar:** `npm run dev:prod` (puerto **3004**, base de PRODUCCIÓN). Es el mismo dato
que vas a ver después del deploy, así que lo que funcione acá funciona allá.

> ⚠ Es la base real. Todo lo de abajo es seguro (genera propuestas, no aplica nada irreversible)
> salvo donde diga **ESCRIBE**.

---

## 1 · El cronograma — lo más tocado del rango

> ⚠ El estado real de Wherex cambia con cada regeneración de hoy, así que el ejemplo exacto de
> abajo puede no reproducirse igual — lo que importa es el COMPORTAMIENTO, no el título literal.

### 1.1 El aviso de tarea repetida (Sales Hub / Desarrollo)
1. Abrí Wherex → pestaña **Cronograma**.
2. **"Regenerar todo el cronograma"** → esperá la propuesta.
3. Recorré el acordeón buscando **cualquier tarea con chip ámbar** ("ya está hecha en «X»").
   - ✅ Si el agente propone una tarea cuyo TÍTULO EXACTO ya está hecha en otra fase, tiene que
     avisar. Si ese día no hay ninguna coincidencia exacta, no sale ningún chip — es correcto,
     no un fallo (la regla es conservadora a propósito: solo título idéntico, no "se parece").
4. Mirá las tareas que ya estaban **hechas** en cualquier fase.
   - ✅ Tienen que aparecer **pre-sembradas a la derecha** (preservadas), no como algo a descartar.

### 1.2 Las fases repetidas se anuncian
En el mismo Gantt de Wherex, mirá los nombres de las fases.
- ✅ *Service Hub* / *Capacitación y cierre Service* y *Marketing Hub* / *Configuración
  Marketing Hub* tienen que llevar cada una un chip **«¿repetida?»**; el tooltip nombra a la otra.
- ✅ **Ninguna otra fase** debe llevarlo — ni *Sales Hub* (comparte "Hub" con *Service Hub*, no
  cuenta), ni *Migración Salesforce* con *Sales Hub*, ni *Cierre y entrega* con nada (son dos
  falsos positivos que se encontraron y arreglaron probando contra los datos reales de hoy).
  Si ves el chip en una fase que no es una de esas dos parejas, avisame.

### 1.3 Un renombre no duplica *(la regresión que se revirtió hoy)*
1. En un proyecto con cronograma, regenerá el handoff.
2. Cuando la propuesta renombre una fase con un nombre **parecido** al que ya tenía:
   - ✅ Tiene que salir como **cambio de esa fase** (sugerencia en su fila).
   - ❌ NO como *fase nueva* + la vieja abajo. Si aparecen dos, avisame.
3. Apretá **"Aceptar todo"**, recargá.
   - ✅ La fase quedó **una sola**, con el nombre nuevo y **sus tareas y su progreso intactos**.

### 1.4 Pedir cambio con IA no pierde trabajo hecho **ESCRIBE**
Sobre un proyecto de prueba (no Wherex):
1. Marcá una tarea como **hecha** a mano.
2. **"Pedir cambio con IA"** → algo que reorganice esa fase
   (ej. *"reordená las tareas de Setup por prioridad"*).
3. En la propuesta:
   - ✅ La tarea hecha **sigue estando**.
   - ✅ Si el modelo se la había olvidado, arriba sale un aviso de que se conservó.
4. Aplicá.
   - ✅ Sin error 400. La tarea sigue **hecha**, y **no** aparece duplicada en otra fase.

### 1.5 Regenerar una sola fase
1. **"Regenerar"** en una fase que tenga tareas hechas.
2. ✅ Las hechas arrancan a la derecha; aplicar **no las borra**.

---

## 2 · El handoff por tipo *(lo que el deploy activa)*

> ⚠ Los 2 agentes tipados están en **DRAFT en producción** a propósito. Hasta correr el paso 3
> del deploy, un Desarrollo sigue usando el genérico — eso es lo esperado, no un fallo.

### 2.1 Antes de activar
1. Abrí `Conector SAAS posventa | Spectrum` → **Handoff**.
2. ✅ Dice **«Handoff del proyecto»** (no «Sales→CS») y ofrece generar.
3. En **Contexto**: ✅ la exclusión **nombra** a la implementación de Spectrum, no es genérica.

### 2.2 Después de activar los agentes *(paso 3 del deploy)*
1. Volvé a `Conector SAAS posventa | Spectrum` → **Handoff** → generar.
2. **Leelo con los ojos** — es la prueba de fondo:
   - ✅ Habla del **conector**; la implementación aparece solo como contexto de fondo.
   - ✅ Las secciones tienen contenido real, no todo «⚠ Por validar».
   - ✅ Las fases son de desarrollo (relevamiento → diseño → build → pruebas → entrega),
     **sin Semana 0** ni fases de adopción de hubs.
3. ✅ El cronograma de la **implementación** quedó exactamente igual que antes.

### 2.3 La puerta que se cerró hoy
1. Entrá a un proyecto de **Desarrollo** por la pantalla de **etapa 1 / paso 0**.
2. Si ofrece un bloque de handoff genérico y le das «Analizar»:
   - ✅ Tiene que **negarse** con un mensaje que te manda a la pestaña Handoff del proyecto.
   - ❌ Si genera igual, avisame: corre el prompt de Customer Success sobre un Desarrollo y le
     pisa los tags.

---

## 3 · Google Meet

1. **Integraciones** → tarjeta de Google Meet → **"Re-enriquecer todo"**.
   - ✅ Ahora abre un **confirm rojo** que dice cuántas sesiones toca y qué se pierde.
   - **Cancelá** — no hace falta correrlo.
2. ✅ **"Re-enriquecer sin transcript"** sigue funcionando sin confirm (no borra nada).

---

## 4 · Cobranza y cartera — regresión, no debe haber cambiado nada

1. **Cobranza** → el vencido total tiene que seguir dando **$60.997**.
2. **Cartera** → los proyectos, sus dueños y sus fechas: iguales.
3. Abrí **2 o 3 proyectos que no tocamos** (cualquiera que no sea Wherex ni Spectrum):
   - ✅ Cronograma, handoff y widget se ven **idénticos**.

---

## 5 · El PDF y la vista del cliente

1. Exportá el PDF del cronograma de un proyecto cualquiera.
   - ✅ Se ve igual que antes. **No** aparece ninguna fecha de cierre nueva ni el chip
     «¿repetida?» (eso es solo interno).
2. Abrí la landing publicada de un cliente.
   - ✅ Idéntica.

---

# Después de la prueba — el deploy

```bash
git push
```

En el VPS:

```bash
bash scripts/deploy.sh
```

Y desde esta máquina, **después** del deploy:

```bash
ALLOW_PROD_WRITE=1 npx tsx scripts/estado-handoff-por-tipo.ts --apply --estado ACTIVE
```

```bash
npx tsx scripts/check-invariants.ts
```

### Qué esperar de los invariantes

| Invariante | Estado esperado |
|---|---|
| INV15 | ✅ verde |
| INV2 | ❌ rojo **hasta correr el backfill DESPUÉS del deploy** (si lo corrés antes, prod lo revierte) |
| INV16(a) y (c) | ❌ rojos **a propósito** hasta drenar `scripts/recuperar-transcripts-meet.ts` |

**No hay migraciones SQL pendientes** — INV7 dio verde: las 3 columnas del rango ya están
aplicadas a producción.

**Ningún seed hay que re-correr.** El único que cambia compara antes de escribir.

### Si algo sale mal

`deploy.sh` **no revierte solo**: imprime el comando y sale con 1.

```bash
docker tag nexus:prev nexus:latest && docker compose up -d --no-build app
```
