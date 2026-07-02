# ⚡ Accesibilidad - Referencia Rápida

## 🎯 Regla de Oro

```scss
✅ font-size: calc(14px * var(--font-size-scale));
❌ font-size: 14px;
```

## 📝 Snippets de VS Code

| Atajo | Resultado |
|-------|-----------|
| `a11y-font-px` | `font-size: calc(14px * var(--font-size-scale));` |
| `a11y-font-rem` | `font-size: calc(1rem * var(--font-size-scale));` |
| `a11y-component` | Estructura completa de componente accesible |
| `a11y-headings` | Jerarquía h1-h6 accesible |
| `todo-a11y` | Marca TODO de accesibilidad |

## 🚀 Comandos

```bash
# Verificar accesibilidad antes de commit
npm run check:a11y

# O directamente con PowerShell
.\check-accessibility.ps1
```

## 📊 Niveles de Escala

| Nivel | Escala | Uso |
|-------|--------|-----|
| 0 | 0.75x | Máxima densidad |
| 1 | 0.85x | Alta densidad |
| 2 ⭐ | 1.0x | **NORMAL (default)** |
| 3 | 1.15x | Legibilidad mejorada |
| 4 | 1.3x | Alta legibilidad |
| 5 | 1.5x | Accesibilidad estándar |
| 6 | 1.75x | Máxima accesibilidad |

## 🎨 Tamaños Comunes

```scss
// Labels y textos pequeños
.label { font-size: calc(12px * var(--font-size-scale)); }

// Texto body normal  
.text { font-size: calc(14px * var(--font-size-scale)); }

// Texto grande
.large { font-size: calc(16px * var(--font-size-scale)); }

// Títulos
h1 { font-size: calc(28px * var(--font-size-scale)); }
h2 { font-size: calc(24px * var(--font-size-scale)); }
h3 { font-size: calc(20px * var(--font-size-scale)); }
```

## 🔍 Excepciones (Cuándo NO usar calc)

```scss
// ✅ Logos institucionales
.logo { font-size: 48px; } // Tamaño fijo por normativa

// ✅ Iconos decorativos
.icon-decorative { font-size: 24px; }

// ⚠️ Documentar con comentario:
/* FIJO: Logo debe mantener tamaño exacto por diseño institucional */
.brand-logo { font-size: 48px; }
```

## 🧪 Cómo Probar

1. **En la app**: Usar botones A+ / A− del menú de accesibilidad
2. **DevTools Console**:
   ```javascript
   // Probar escala máxima
   document.documentElement.style.setProperty('--font-size-scale', '1.75');
   
   // Restaurar normal
   document.documentElement.style.setProperty('--font-size-scale', '1');
   ```
3. **Zoom del navegador**: Ctrl/Cmd + +/−

## 🚨 Errores Comunes

### ❌ Font-size fijo
```scss
.texto { font-size: 14px; } // No escalará
```

### ❌ Usar !important
```scss
.texto { font-size: 14px !important; } // Bloquea accesibilidad
```

### ❌ Olvidar var()
```scss
.texto { font-size: calc(14px * --font-size-scale); } // Falta var()
```

## ✅ Soluciones Correctas

### ✅ Con calc()
```scss
.texto { font-size: calc(14px * var(--font-size-scale)); }
```

### ✅ Heredar del body
```scss
.texto {
  // Sin font-size = hereda del body automáticamente
  color: #333;
}
```

### ✅ Con unidades relativas
```scss
.componente {
  font-size: calc(14px * var(--font-size-scale));
  
  // Hijos usan em para escalar relativamente
  .titulo { font-size: 1.5em; }
  .subtitulo { font-size: 1.2em; }
}
```

## 📚 Más Información

- 🧭 [Flujo Automatico 1 Minuto](A11Y-AUTO-FLOW.md)
- 📖 [Guía Completa](ACCESSIBILITY-GUIDE.md)
- ✅ [Checklist Pre-Commit](ACCESSIBILITY-CHECKLIST.md)
- 🔍 [Script de Verificación](../../check-accessibility.ps1)

## 💡 Tips Pro

1. **Usa snippets**: Escribe `a11y-font-px` + Tab en VS Code
2. **Verifica antes de commit**: `npm run check:a11y`
3. **Documenta excepciones**: Siempre comenta por qué un font-size es fijo
4. **Prueba en extremos**: Verifica niveles 0 y 6 en mobile
5. **Herencia inteligente**: Si no necesitas tamaño específico, no definas font-size

---

**Recuerda**: Si usas `calc()` en todos tus font-sizes, la accesibilidad funciona automáticamente. 🎉
