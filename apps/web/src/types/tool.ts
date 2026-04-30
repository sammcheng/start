export type ToolCategory =
  | "nlp"
  | "computer_vision"
  | "data_analysis"
  | "automation"
  | "generation"
  | "other";

export type ToolStatus =
  | "draft"
  | "processing"
  | "live"
  | "paused"
  | "rejected";

export type OwnershipType = "royalty" | "full_sale";
export type InputType = "text" | "image" | "json" | "csv" | "url" | "file";
export type OutputType = "json" | "text" | "image" | "csv" | "file";

export interface SellerInfo {
  id: string;
  display_name: string;
  avatar_url: string | null;
  username: string;
}

export interface Tool {
  id: string;
  seller_id: string;
  seller: SellerInfo;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: ToolCategory;
  status: ToolStatus;
  ownership_type: OwnershipType;
  input_type: InputType;
  output_type: OutputType;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  /** Decimal serialised as string from Python */
  price_per_request: string;
  demo_url: string | null;
  api_endpoint: string | null;
  docker_image_uri: string | null;
  github_url: string | null;
  documentation: string | null;
  avg_response_time_ms: number | null;
  total_requests: number;
  uptime_percentage: string | null;
  is_featured: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface ToolListResponse {
  items: Tool[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export type SortBy = "popular" | "newest" | "price_low" | "price_high";

export interface ToolFilters {
  category?: ToolCategory;
  min_price?: number;
  max_price?: number;
  search?: string;
  sort_by?: SortBy;
}
