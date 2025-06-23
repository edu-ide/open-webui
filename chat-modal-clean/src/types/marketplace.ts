export interface McpServerPackage {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  icon?: string;
  repository?: string;
  homepage?: string;
  downloadCount: number;
  rating: number;
  ratingCount: number;
  lastUpdated: string;
  config: {
    transport: 'sse' | 'websocket' | 'stdio';
    endpoint: string;
    auth?: {
      type: 'none' | 'bearer' | 'basic';
      token?: string;
      username?: string;
      password?: string;
    };
    options?: Record<string, any>;
  };
  isInstalled?: boolean;
  isOfficial?: boolean;
  documentation?: string;
  examples?: string[];
}

export interface MarketplaceFilters {
  category?: string;
  search?: string;
  sortBy?: 'name' | 'downloads' | 'rating' | 'updated';
  sortOrder?: 'asc' | 'desc';
  showInstalled?: boolean;
  showOfficial?: boolean;
}

export interface MarketplaceState {
  packages: McpServerPackage[];
  filters: MarketplaceFilters;
  loading: boolean;
  error?: string;
}