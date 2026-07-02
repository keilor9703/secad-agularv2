# Script de Verificación de Accesibilidad
# Verifica que todos los archivos SCSS sigan las mejores prácticas de accesibilidad

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   VERIFICADOR DE ACCESIBILIDAD OFTIC   " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$errorsFound = 0
$warningsFound = 0
$filesChecked = 0

# Directorios a verificar
$directories = @(
    ".\src\app\components",
    ".\src\app\pages",
    ".\src\app\layout"
)

Write-Host "🔍 Buscando archivos SCSS..." -ForegroundColor Yellow
Write-Host ""

foreach ($dir in $directories) {
    if (Test-Path $dir) {
        $scssFiles = Get-ChildItem -Path $dir -Filter "*.scss" -Recurse
        
        foreach ($file in $scssFiles) {
            $filesChecked++
            $relativePath = $file.FullName.Replace($PWD.Path + "\", "")
            $content = Get-Content $file.FullName -Raw
            
            # VERIFICACIÓN 1: font-size sin calc()
            $fixedFontSizes = Select-String -Pattern "font-size:\s*\d+(?:px|rem|em)" -Path $file.FullName | 
                Where-Object { 
                    $_.Line -notmatch "calc\(" -and 
                    $_.Line -notmatch "//" -and
                    $_.Line -notmatch "/\*" 
                }
            
            if ($fixedFontSizes) {
                Write-Host "❌ ERROR en $relativePath" -ForegroundColor Red
                foreach ($match in $fixedFontSizes) {
                    Write-Host "   Línea $($match.LineNumber): $($match.Line.Trim())" -ForegroundColor Red
                    Write-Host "   💡 Cambiar a: font-size: calc($($match.Matches.Value.Split(':')[1].Trim()) * var(--font-size-scale));" -ForegroundColor Yellow
                }
                $errorsFound++
                Write-Host ""
            }
            
            # VERIFICACIÓN 2: !important en font-size
            $importantFontSizes = Select-String -Pattern "font-size:.*!important" -Path $file.FullName
            
            if ($importantFontSizes) {
                Write-Host "🚨 CRÍTICO en $relativePath" -ForegroundColor Magenta
                foreach ($match in $importantFontSizes) {
                    Write-Host "   Línea $($match.LineNumber): $($match.Line.Trim())" -ForegroundColor Magenta
                    Write-Host "   💡 ELIMINAR !important - Bloquea completamente la accesibilidad" -ForegroundColor Yellow
                }
                $errorsFound++
                Write-Host ""
            }
            
            # VERIFICACIÓN 3: Advertencias - iconos o elementos especiales
            $allFontSizes = Select-String -Pattern "font-size:" -Path $file.FullName
            $totalFontSizes = $allFontSizes.Count
            $calcFontSizes = ($allFontSizes | Where-Object { $_.Line -match "calc\(" }).Count
            
            if ($totalFontSizes -gt 0) {
                $coverage = [math]::Round(($calcFontSizes / $totalFontSizes) * 100, 2)
                
                if ($coverage -lt 100 -and $coverage -gt 0) {
                    # Solo mostrar advertencia si hay mezcla de estilos
                    Write-Host "⚠️  ADVERTENCIA en $relativePath" -ForegroundColor Yellow
                    Write-Host "   Cobertura de accesibilidad: $coverage% ($calcFontSizes de $totalFontSizes)" -ForegroundColor Yellow
                    Write-Host "   Algunos font-size no usan calc(). Verifica si es intencional." -ForegroundColor Gray
                    $warningsFound++
                    Write-Host ""
                }
            }
        }
    }
}

# Verificar archivo principal styles.scss
Write-Host "🔍 Verificando archivo global styles.scss..." -ForegroundColor Yellow
$stylesPath = ".\src\styles.scss"

if (Test-Path $stylesPath) {
    $filesChecked++
    $stylesContent = Get-Content $stylesPath -Raw
    
    # Verificar que existe la variable --font-size-scale
    if ($stylesContent -match "--font-size-scale:\s*1;") {
        Write-Host "✅ Variable --font-size-scale encontrada en styles.scss" -ForegroundColor Green
    } else {
        Write-Host "❌ ERROR: Variable --font-size-scale NO encontrada en styles.scss" -ForegroundColor Red
        $errorsFound++
    }
    
    # Verificar que body usa calc()
    if ($stylesContent -match "body\s*\{[^}]*font-size:\s*calc\([^)]*var\(--font-size-scale\)") {
        Write-Host "✅ Body usa font-size con calc() correctamente" -ForegroundColor Green
    } else {
        Write-Host "❌ ERROR: Body no usa font-size con calc() y var(--font-size-scale)" -ForegroundColor Red
        $errorsFound++
    }
    Write-Host ""
}

# RESUMEN
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "              RESUMEN                    " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Archivos verificados: $filesChecked" -ForegroundColor White
Write-Host "Errores encontrados: $errorsFound" -ForegroundColor $(if ($errorsFound -eq 0) { "Green" } else { "Red" })
Write-Host "Advertencias: $warningsFound" -ForegroundColor $(if ($warningsFound -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($errorsFound -eq 0 -and $warningsFound -eq 0) {
    Write-Host "🎉 ¡EXCELENTE! Todos los archivos cumplen con las normas de accesibilidad." -ForegroundColor Green
    Write-Host ""
    exit 0
} elseif ($errorsFound -eq 0 -and $warningsFound -gt 0) {
    Write-Host "✅ No hay errores críticos, pero revisa las advertencias." -ForegroundColor Yellow
    Write-Host "   Las advertencias pueden ser aceptables si son intencionales (logos, iconos, etc.)" -ForegroundColor Gray
    Write-Host ""
    exit 0
} else {
    Write-Host "❌ Se encontraron errores. Por favor corrígelos antes de hacer commit." -ForegroundColor Red
    Write-Host ""
    Write-Host "📚 Consulta la guía completa en: docs/accessibility/ACCESSIBILITY-GUIDE.md" -ForegroundColor Cyan
    Write-Host "✅ Usa el checklist en: docs/accessibility/ACCESSIBILITY-CHECKLIST.md" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
