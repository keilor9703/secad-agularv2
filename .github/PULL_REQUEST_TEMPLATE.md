# ♿ Accessibility PR Template

## 📝 Descripción

<!-- Describe brevemente los cambios realizados -->

## ✅ Accessibility Checklist

### 🎨 Estilos (SCSS)

- [ ] Todas las declaraciones `font-size` usan `calc(Npx * var(--font-size-scale))`
- [ ] No hay uso de `!important` en `font-size`
- [ ] Variables CSS están definidas correctamente
- [ ] Ejecuté `npm run check:a11y` y **pasó sin errores** ✅

**Resultado de verificación:**
```bash
# Pegar aquí la salida de: npm run check:a11y
```

### 🧪 Testing Manual

Probé los siguientes niveles de fuente:

- [ ] Nivel 0 (0.75x - Muy pequeña)
- [ ] Nivel 2 (1.0x - Normal / Default)
- [ ] Nivel 6 (1.75x - Extra grande)

**Navegadores probados:**
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (si aplica)

### 📱 Responsive

- [ ] Desktop (> 1024px)
- [ ] Tablet (768px - 1023px)
- [ ] Mobile (< 767px)

### 🎨 Temas

Si el proyecto tiene temas (dark mode, etc.):
- [ ] Light mode
- [ ] Dark mode

### 🖼️ Screenshots

**Antes de cambios (si aplica):**
<!-- Pegar screenshot -->

**Después de cambios - Nivel 2 (Normal):**
<!-- Pegar screenshot -->

**Después de cambios - Nivel 6 (Extra grande):**
<!-- Pegar screenshot -->

## 📦 Archivos Modificados

<!-- Lista de archivos SCSS/TS modificados -->

**Componentes SCSS:**
- [ ] `component-name.scss`
- [ ] ...

**TypeScript:**
- [ ] `component-name.ts`
- [ ] ...

## 🔄 Migración (si aplica)

<!-- Solo si tocaste AccessibilityService o localStorage -->

- [ ] No modifiqué `AccessibilityService`
- [ ] Modifiqué `AccessibilityService` y probé migración de datos antiguos

## 🐛 Problemas Conocidos

<!-- Lista cualquier limitación o problema conocido -->

- Ninguno

## 📚 Documentación

- [ ] Actualicé comentarios en código
- [ ] Agregué documentación en `*.md` (si aplica)
- [ ] Seguí el patrón de [ACCESSIBILITY-GUIDE.md](../docs/accessibility/ACCESSIBILITY-GUIDE.md)

## 🚀 Deployment

- [ ] Build pasa sin errores: `npm run build`
- [ ] Tests pasan: `npm test` (si aplica)
- [ ] Verification pasa: `npm run check:a11y` ✅

---

## 📋 Para Reviewers

### Verificación Rápida

```bash
# 1. Checkout del branch
git checkout <branch-name>

# 2. Instalar (si hay cambios en package.json)
npm install

# 3. Verificar accesibilidad
npm run check:a11y

# 4. Iniciar app
npm start

# 5. Probar menú de accesibilidad (A+/A−)
```

### Qué revisar

1. **Todos los `font-size` usan `calc()`**: Buscar manualmente en archivos SCSS
2. **No hay `!important`**: Verificar que no se fuerza tamaño fijo
3. **Script pasa**: `npm run check:a11y` debe dar ✅
4. **UI funciona**: Probar niveles 0, 2 y 6 en navegador

### Comandos de Revisión

```bash
# Buscar font-size sin calc (NO debería encontrar nada)
grep -r "font-size: [0-9]" src/ --include="*.scss" | grep -v "calc("

# Buscar !important en font-size (NO debería encontrar nada)
grep -r "font-size.*!important" src/ --include="*.scss"

# Verificar automáticamente
npm run check:a11y
```

---

## ✍️ Notas Adicionales

<!-- Cualquier información extra relevante -->

---

**Firmado**: @[tu-usuario]

**Fecha**: [fecha]

**Issue relacionado**: #[número] (si aplica)
