# COMPRAS FPTI-PY — Gestión de Procesos v2.0

## Estructura de Archivos

```
compras-fpti/
├── index.html              ← Punto de entrada principal (SPA)
├── assets/
│   ├── styles.css          ← Estilos completos + @media print
│   └── app.js              ← Lógica: DataStore, Router, UI, Autosave
├── data/
│   └── data.json           ← Base de datos inicial (seed)
├── pages/
│   ├── reportes.html       ← Placeholder para futuros reportes
│   └── configuracion.html  ← Placeholder para configuración
└── README.md               ← Este archivo
```

## Instrucciones de Uso

### 1. Cómo Abrir

**Opción A — Con Live Server (RECOMENDADO):**
- Abrí la carpeta en VS Code.
- Clic derecho en `index.html` → "Open with Live Server".
- Esto permite cargar automáticamente `data/data.json` al iniciar.

**Opción B — Doble clic (file://):**
- Funciona, pero el navegador bloquea `fetch()` de archivos locales.
- Al abrir, usá **"Importar JSON"** desde el sidebar para cargar `data/data.json` manualmente.

**Opción C — Servidor simple:**
```bash
cd compras-fpti
python -m http.server 8080
# Abrir http://localhost:8080
```

### 2. Dónde se Guardan los Datos

Los datos se persisten en **IndexedDB** del navegador:
- Base: `compras_fpti_v2`
- Store: `procesos`
- Los datos sobreviven al cerrar/reabrir el navegador.
- **IMPORTANTE:** Son locales a ese navegador y origen (dominio/ruta).

### 3. Importar / Exportar

**Exportar JSON:**
- Sidebar → "Exportar JSON" o botón en el header.
- Descarga un archivo `data_compras_YYYYMMDD.json` con el estado completo.
- Este archivo se puede copiar junto con la carpeta del proyecto como respaldo.

**Importar JSON:**
- Sidebar → "Importar JSON" o botón en el header.
- **REEMPLAZA** todos los datos actuales con el contenido del archivo.
- Se muestra confirmación antes de sobrescribir.

**Importar Excel (compatibilidad):**
- Sidebar → "Importar Excel".
- Compatible con archivos exportados desde la versión anterior.
- Si el Excel tiene una hoja "DATA" con JSON, la usa completa.
- Si no, parsea la hoja ÍNDICE para extraer los procesos.

### 4. Autosave en Detalle

- Cada campo en la pantalla de Detalle se **guarda automáticamente** al salir del campo (evento `blur`).
- Se muestra un indicador discreto arriba a la derecha: "Guardando…" → "✓ Guardado".
- El botón "💾 Guardar" sigue disponible para guardado explícito.
- No se pierde información al navegar de vuelta al índice.

### 5. Imprimir

**Imprimir Resumen:**
- Desde el Índice: botón "🖨 Imprimir" en la barra de filtros o Sidebar → "Imprimir Resumen".
- Imprime la tabla con los filtros activos.
- Incluye encabezado con fecha/hora y filtros aplicados.

**Imprimir Detalle:**
- Desde la vista de Detalle: botón "🖨 Imprimir" en el header del proceso.
- Imprime toda la información del proceso en formato limpio.

**Formato:** A4 horizontal, sin sidebar ni controles de navegación.

### 6. Navegación

- **Sidebar izquierdo** con secciones: Principal, Datos, Imprimir, Más.
- En móvil: sidebar se oculta y se accede con el botón ☰.
- Links a `/pages/reportes.html` y `/pages/configuracion.html` preparados para futuras funcionalidades.
- La navegación principal (Índice ↔ Detalle) es por hash (#/) como SPA.

### 7. Portabilidad

Para mover el proyecto a otra PC:
1. Exportá el JSON ("Exportar JSON").
2. Copiá toda la carpeta `compras-fpti/` incluyendo el JSON exportado dentro de `data/`.
3. En la otra PC, abrí con Live Server o importá el JSON manualmente.

## Cambios respecto a la versión anterior

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Archivos | Un solo `index.html` monolítico | Estructura modular (HTML + CSS + JS + JSON) |
| Persistencia principal | IndexedDB | IndexedDB + JSON exportable como respaldo |
| Autosave | No tenía | Guarda al salir de cada campo (blur) |
| Impresión | No tenía | @media print con encabezado y formato |
| Navegación | Solo header | Sidebar con secciones y páginas futuras |
| Tema | Claro | Claro mejorado con mejor jerarquía visual |
| Mobile | Básico | Sidebar colapsable, responsive completo |
| Import | Solo Excel | JSON (principal) + Excel (compatibilidad) |

## Reglas de Negocio (sin cambios)

- Tipos: CLP / CPP
- Identificador único: Tipo + Proceso (NNN/AAAA)
- Rango ±30%: Mín = Ref × 0.70, Máx = Ref × 1.30
- Clasificación automática: Sí solo si Sobre1=Sí Y Sobre2=Sí
- Adjudicación por ítem
- Leyenda de colores: Verde=Cumple, Rojo=Descalificado, Azul=Dentro de rango, Amarillo=Adjudicado, Naranja=Fuera de rango
