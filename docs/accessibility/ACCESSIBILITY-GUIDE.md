# Guía de Accesibilidad - Sistema de Escalado de Fuentes

## 🎯 Resumen

Este proyecto implementa un **sistema de 7 niveles de escalado de fuentes** que permite a los usuarios ajustar el tamaño del texto según sus necesidades de accesibilidad.

## 📊 Niveles de Escala

| Nivel | Etiqueta | Escala | Uso |
|-------|----------|--------|-----|
| **0** | Muy pequeña | 0.75x | Máxima densidad de información |
| **1** | Pequeña | 0.85x | Alta densidad |
| **2** | Normal ⭐ | 1.0x | **PREDETERMINADO** |
| **3** | Mediana | 1.15x | Legibilidad mejorada |
| **4** | Grande | 1.3x | Alta legibilidad |
| **5** | Muy grande | 1.5x | Accesibilidad estándar |
| **6** | Extra grande | 1.75x | Máxima accesibilidad |

## 🔧 Cómo Funciona

### 1. Variable CSS Global

El sistema usa una variable CSS en `:root`:
```css
:root {
  --font-size-scale: 1; /* Cambia dinámicamente entre 0.75 y 1.75 */
}
```

### 2. Aplicación en Body

El elemento `body` tiene el tamaño base responsive:
```css
body {
  font-size: calc(16px * var(--font-size-scale));
}
```

### 3. Servicio TypeScript

`AccessibilityService` modifica la variable CSS desde Angular:
```typescript
htmlElement.style.setProperty('--font-size-scale', '1.15');
```

## 📝 Para Nuevos Componentes

### ✅ CORRECTO - Usar calc() con la variable

```scss
// En tu archivo .scss
.mi-componente {
  font-size: calc(14px * var(--font-size-scale)); // Responsive ✅
}

.mi-texto {
  font-size: calc(1rem * var(--font-size-scale)); // También funciona con rem ✅
}

.mi-titulo {
  font-size: calc(24px * var(--font-size-scale)); // Títulos grandes ✅
}
```

### ✅ CORRECTO - Heredar del body (recomendado para texto normal)

```scss
// Si no especificas font-size, hereda automáticamente del body
.mi-parrafo {
  // No necesita font-size explícito
  // Heredará calc(16px * var(--font-size-scale)) del body ✅
  color: #333;
}
```

### ❌ EVITAR - Font-size fijo

```scss
// ❌ NO HACER ESTO - No responderá a accesibilidad
.texto-fijo {
  font-size: 14px; // FIJO, no escalará
}
```

### ❌ NUNCA - Usar !important

```scss
// ❌ NUNCA HACER ESTO - Bloqueará completamente la accesibilidad
.texto-bloqueado {
  font-size: 14px !important; // BLOQUEADO, imposible de escalar
}
```

## 🎨 Ejemplos por Tipo de Elemento

### Texto Body Normal (16px base)
```scss
p, span, div {
  // No especificar font-size → hereda del body automáticamente
}
```

### Labels y Textos Pequeños (12px)
```scss
.ui-label {
  font-size: calc(12px * var(--font-size-scale));
}
```

### Inputs y Controles (14px)
```scss
.ui-control {
  font-size: calc(14px * var(--font-size-scale));
}
```

### Botones (varía según tamaño)
```scss
.ui-btn {
  font-size: calc(14px * var(--font-size-scale)); // Normal
}

.ui-btn.sm {
  font-size: calc(13px * var(--font-size-scale)); // Pequeño
}

.ui-btn.lg {
  font-size: calc(15px * var(--font-size-scale)); // Grande
}
```

### Títulos (18-28px)
```scss
h1 { font-size: calc(28px * var(--font-size-scale)); }
h2 { font-size: calc(24px * var(--font-size-scale)); }
h3 { font-size: calc(20px * var(--font-size-scale)); }
h4 { font-size: calc(18px * var(--font-size-scale)); }
```

### Iconos (Opcional - solo si necesitan escalar)
```scss
.icon {
  // Iconos normalmente NO necesitan escalar
  font-size: 20px; // FIJO está bien para iconos

  // Pero si QUIERES que escalen:
  font-size: calc(20px * var(--font-size-scale));
}
```

## 🧪 Cómo Probar

### 1. En la Aplicación
- Inicia sesión
- Busca el menú de accesibilidad (botones flotantes)
- Presiona **A+** para aumentar
- Presiona **A−** para disminuir
- Observa cómo TODO el texto escala proporcionalmente

### 2. En DevTools
```javascript
// En la consola del navegador:
document.documentElement.style.setProperty('--font-size-scale', '1.5');
// Deberías ver TODO el texto escalar instantáneamente
```

### 3. Verificar localStorage
```javascript
// Ver configuración actual:
JSON.parse(localStorage.getItem('accessibility-settings'));
// Resultado: { darkMode: false, fontSize: 2 }
```

## 🔍 Troubleshooting

### Problema: "Mi texto no escala"

**Causa 1: Font-size fijo**
```scss
// ❌ Problema
.mi-texto { font-size: 14px; }

// ✅ Solución
.mi-texto { font-size: calc(14px * var(--font-size-scale)); }
```

**Causa 2: Usando !important**
```scss
// ❌ Problema
.mi-texto { font-size: 14px !important; }

// ✅ Solución - Eliminar !important
.mi-texto { font-size: calc(14px * var(--font-size-scale)); }
```

**Causa 3: Especificidad CSS**
```scss
// ❌ Problema - Selector muy específico sobrescribe
body .container .card .texto { font-size: 14px; }

// ✅ Solución - Usar calc() en el selector específico
body .container .card .texto { font-size: calc(14px * var(--font-size-scale)); }
```

### Problema: "La escala no persiste al recargar"

**Solución**: Verifica que AccessibilityService esté inyectado en el componente raíz (app.component.ts) para que se inicialice en cada carga.

## 🏗️ Arquitectura Técnica

### Flujo de Datos

```
Usuario → AccessibilityMenuComponent
           ↓
      AccessibilityService
           ↓
      BehaviorSubject (state$)
           ↓
      localStorage (persistencia)
           ↓
      document.documentElement.style.setProperty('--font-size-scale', ...)
           ↓
      Todos los elementos con calc(...var(--font-size-scale))
```

### Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `accessibility.service.ts` | Lógica de negocio, state management |
| `accessibility-menu.component.ts` | UI de controles (botones A+/A−) |
| `styles.scss` | Variable CSS global y documentación |
| Todos los `*.scss` | Implementación con calc() |

## 📚 Recursos Adicionales

### Estándares WCAG
- [WCAG 2.1 - Text Resize](https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html)
- Criterio de éxito: Nivel AA - El texto debe poder escalarse hasta 200% sin pérdida de funcionalidad

### Buenas Prácticas
1. ✅ Usar unidades relativas (rem, em) o calc() con px
2. ✅ Probar con zoom del navegador (Ctrl/Cmd + +/−)
3. ✅ Verificar que layouts no se rompan en escalas grandes (1.5x, 1.75x)
4. ✅ Mantener contraste de colores en todos los niveles

---

**Última actualización**: Marzo 8, 2026  
**Mantenedor**: Equipo de Frontend  
**Versión del sistema**: 7 niveles (0-6)
