export interface SocialDockAccount {
  id: number;
  networkName: string;
  accountName: string;
  icon: string;
  url: string;
  color: string;
  handle?: string;
  avatarUrl?: string;
  notifications?: number;
}

export interface SocialDockGroup {
  networkName: string;
  icon: string;
  color: string;
  accounts: SocialDockAccount[];
}
