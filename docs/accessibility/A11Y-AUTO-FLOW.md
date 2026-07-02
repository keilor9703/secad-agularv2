# A11Y Auto Flow (1 minuto)

Este es el flujo automatico completo del sistema de accesibilidad.

```mermaid
flowchart TD
    U[Usuario presiona A+ o A-] --> M[AccessibilityMenuComponent]
    M --> S[AccessibilityService increase/decrease]
    S --> V{Nivel valido 0..6}
    V -->|No| D[Usa default nivel 2]
    V -->|Si| N[Usa nuevo nivel]

    D --> P[updateSettings]
    N --> P[updateSettings]

    P --> L[saveSettings en localStorage]
    P --> C[applySettings al DOM]
    P --> B[accessibility$ next estado]

    C --> R[setProperty --font-size-scale en root]
    R --> X[CSS recalcula font-size con calc y var]
    X --> Y[UI escala en tiempo real]

    B --> Z[Componentes suscritos actualizan estado visual]

    A[Inicio de app] --> T[loadSettings]
    T --> G{Dato antiguo string}
    G -->|Si| H[Migracion small/normal/large a numero]
    G -->|No| I[Validar tipo y rango]
    H --> I
    I --> J[applySettings inicial]
    J --> Y
```

## Resumen rapido

1. El menu dispara el cambio de nivel.
2. El servicio valida, guarda y aplica al DOM.
3. Cambia `--font-size-scale` en `:root`.
4. Cualquier `font-size: calc(... * var(--font-size-scale))` responde solo.
5. En arranque, `loadSettings()` migra formatos viejos y evita errores.

## Guard rails automaticos

- Script: `npm run check:a11y`
- Bloquea errores tipicos: `font-size` fijo y `!important` en fuentes.
- Checklist y template de PR fuerzan verificacion antes de merge.
