# PoliciadevApp

> **👋 ¿Nuevo en el proyecto?** Lee primero el [**START-HERE.md**](docs/accessibility/START-HERE.md) para una introducción completa.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.2.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## ♿ Accessibility System

This project implements a **7-level font scaling system** for accessibility compliance (WCAG 2.1 Level AA).

### Features
- 🎯 **7 scaling levels** (0.75x to 1.75x)
- 💾 **Persistent settings** via localStorage
- 🌓 **Dark mode** integration
- 🔄 **Automatic migration** from legacy settings
- ✨ **Real-time updates** across all components

### For Developers

**When creating new components:**

✅ **DO**: Use `calc()` with the CSS variable
```scss
.my-component {
  font-size: calc(14px * var(--font-size-scale));
}
```

❌ **DON'T**: Use fixed font sizes
```scss
.my-component {
  font-size: 14px; // ❌ Won't scale
}
```

### Verify Your Code

Run the accessibility checker before committing:

```powershell
.\check-accessibility.ps1
```

### Documentation
- 🧭 [1-Minute Auto Flow](docs/accessibility/A11Y-AUTO-FLOW.md) - End-to-end automatic process
- ⚡ [Quick Reference](docs/accessibility/ACCESSIBILITY-QUICK-REF.md) - Cheat sheet for daily use
- 📖 [Complete Guide](docs/accessibility/ACCESSIBILITY-GUIDE.md) - How the system works
- ✅ [Checklist](docs/accessibility/ACCESSIBILITY-CHECKLIST.md) - Pre-commit verification guide

### VS Code Integration
- 🎨 **Snippets available**: Type `a11y-` and press Tab for auto-completion
- 🔍 **Auto-verification**: Run `npm run check:a11y` before committing
- 📝 **TODO highlighting**: Use `// A11Y:` for accessibility tasks

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
