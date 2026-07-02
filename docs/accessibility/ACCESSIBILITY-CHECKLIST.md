# Checklist de Accesibilidad para Nuevos Componentes

## ✅ Antes de Hacer Commit

Usa este checklist para asegurarte de que tu nuevo componente respeta el sistema de accesibilidad:

### 1. ✅ Estilos SCSS

- [ ] **Todos los `font-size` usan `calc()`**
  ```scss
  ✅ font-size: calc(14px * var(--font-size-scale));
  ❌ font-size: 14px;
  ```

- [ ] **NO hay `!important` en font-size**
  ```scss
  ❌ font-size: 14px !important;
  ```

- [ ] **Si no necesitas tamaño específico, no definas font-size** (heredará del body)
  ```scss
  ✅ .mi-texto { color: #333; } // Sin font-size → hereda automáticamente
  ```

### 2. 🧪 Pruebas Manuales

- [ ] **Probar los 7 niveles de escala**
  - Abrir el menú de accesibilidad
  - Presionar A+ hasta nivel 6 (máximo)
  - Verificar que TODO el texto escala correctamente
  - Presionar A− hasta nivel 0 (mínimo)
  - Verificar que no hay desbordamientos o layouts rotos

- [ ] **Probar zoom del navegador**
  - Presionar Ctrl/Cmd + + varias veces
  - Verificar que el componente sigue funcionando
  - Presionar Ctrl/Cmd + − para restaurar

- [ ] **Probar en modo oscuro**
  - Activar modo oscuro desde el menú de accesibilidad
  - Verificar que los colores tienen suficiente contraste

### 3. 📱 Responsive

- [ ] **Desktop (1920px)**
  - Probar con escala máxima (nivel 6)
  - Verificar que no hay desbordamientos horizontales

- [ ] **Tablet (768px)**
  - Probar con escala normal (nivel 2) y grande (nivel 4)
  
- [ ] **Mobile (375px)**
  - Probar con escala normal (nivel 2)
  - Verificar que el texto es legible

### 4. 🔍 Revisión de Código

- [ ] **Buscar font-size sin calc() en tu archivo .scss**
  ```bash
  # En Git Bash o terminal:
  grep -n "font-size: [0-9]" tu-componente.scss
  ```
  
  Si encuentra resultados, agrégales `calc()` y `var(--font-size-scale)`.

- [ ] **Buscar !important en font-size**
  ```bash
  grep -n "font-size.*!important" tu-componente.scss
  ```
  
  Si encuentra resultados, **elimina el !important**.

### 5. 🎨 Casos Especiales

#### Iconos
```scss
// Decisión: ¿El icono debería escalar con el texto?

// SI es parte del texto (ej: íconos en botones)
✅ .btn i { font-size: calc(14px * var(--font-size-scale)); }

// NO es parte del texto (ej: iconos decorativos, logos)
✅ .logo { font-size: 48px; } // FIJO está bien
```

#### Imágenes y Media
```scss
// Las imágenes NO necesitan escalar con font-size
✅ img, video { /* Sin font-size */ }
```

#### Elementos de Layout Fijos
```scss
// Headers, footers con altura fija pueden mantener font-size fijo
// PERO el contenido de texto dentro DEBE usar calc()
.fixed-header {
  height: 70px; // Altura fija
  
  .header-title {
    font-size: calc(18px * var(--font-size-scale)); // ✅ Texto escalable
  }
}
```

## 🚀 Script de Verificación Rápida

### PowerShell (Windows)
```powershell
# Verificar font-size sin calc() en tu archivo
Select-String -Pattern "font-size:\s*\d+px" -Path ".\src\app\tu-ruta\*.scss" | 
  Where-Object { $_.Line -notmatch "calc\(" -and $_.Line -notmatch "//" }
```

### Bash (Linux/Mac)
```bash
# Verificar font-size sin calc() en tu archivo
grep -rn "font-size: [0-9]" ./src/app/tu-ruta/*.scss | 
  grep -v "calc(" | 
  grep -v "//"
```

Si estos scripts **no devuelven resultados**, tu componente está bien ✅

## 📊 Métricas de Calidad

### Cobertura de Accesibilidad

Tu componente tiene **100% de cobertura** si:

1. ✅ Todos los textos escalables usan `calc()`
2. ✅ Ningún font-size tiene `!important`
3. ✅ Funciona correctamente en los 7 niveles (0-6)
4. ✅ No hay desbordamientos en mobile con escala máxima
5. ✅ Los iconos relevantes escalan, los decorativos no

## 🆘 Cuando Pedir Ayuda

Contacta al equipo si:

- ❓ No estás seguro si un elemento debe escalar o no
- 🐛 El layout se rompe en escalas grandes (niveles 5-6)
- 🎨 Los estilos heredados de librerías externas causan conflictos
- 📱 El componente no es responsive con accesibilidad activada

## ✨ Bonus: Mejores Prácticas

### 1. Usa Variables Semánticas
```scss
// En lugar de repetir valores:
$texto-base: calc(14px * var(--font-size-scale));
$texto-pequeno: calc(12px * var(--font-size-scale));
$texto-grande: calc(18px * var(--font-size-scale));

.mi-componente {
  font-size: $texto-base;
}
```

### 2. Agrupa Conversiones
```scss
// Para componentes con muchos elementos
.mi-componente {
  // Tamaño base para todo el componente
  font-size: calc(14px * var(--font-size-scale));
  
  // Elementos hijos usan em para escalar relativamente
  .titulo { font-size: 1.5em; } // 1.5x el tamaño del componente
  .subtitulo { font-size: 1.2em; } // 1.2x el tamaño del componente
  .detalle { font-size: 0.85em; } // 0.85x el tamaño del componente
}
```

### 3. Documenta Excepciones
```scss
// Si DEBES usar font-size fijo, documenta el porqué
.logo-institucional {
  /* FIJO: El logo institucional debe mantener tamaño exacto por normativa */
  font-size: 48px;
}
```

---

**Recuerda**: La accesibilidad no es opcional, es un derecho. Cada componente accesible mejora la experiencia de todos los usuarios. 🌟
