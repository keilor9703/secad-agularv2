import { MenuNavigationTarget } from '../navigation/menu-destination';

export interface MenuItem {
  readonly id: number;
  readonly icon: string;
  readonly label: string;
  readonly target: MenuNavigationTarget;
  readonly route?: string;
  readonly children?: readonly MenuItem[];
}
