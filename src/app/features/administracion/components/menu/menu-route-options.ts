import { APP_ROUTE_CATALOG } from '../../../../core/navigation/app-route-catalog';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

/** Adaptación visual del catálogo; las reglas de navegación permanecen en core. */
export const MENU_ROUTE_OPTIONS: readonly UiSelectOption<string>[] = APP_ROUTE_CATALOG.map(
  (item) => ({
    value: item.route,
    label: `${item.label} · ${item.route}`,
  }),
);
