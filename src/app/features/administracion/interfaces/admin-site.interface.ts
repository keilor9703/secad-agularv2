export type AdminSiteTone = 'access' | 'structure' | 'configuration' | 'reference';

export interface AdminSite {
  title: string;
  description: string;
  route: string;
  icon: string;
  area: string;
  tone: AdminSiteTone;
}
