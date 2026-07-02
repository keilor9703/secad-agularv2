export type NewsTag = 'Comunicado' | 'Servicio' | 'Importante';

export interface NewsItem {
  id: number;
  date: string;
  tag: NewsTag;
  title: string;
  lead: string;
  content: string;
  image: string;
  megusta: number;
}

export interface SocialLink {
  name: string;
  icon: string;
  url: string;
  color: string;
}
