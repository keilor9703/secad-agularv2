export interface SubMenuItem {
  id: number;
  label: string;
  route: string;
  isExternal?: boolean;
}

export interface MenuItem {
  id: number;
  icon: string;
  label: string;
  route?: string;
  isExternal?: boolean;
  submenu?: SubMenuItem[];
}
