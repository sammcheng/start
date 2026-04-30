import type { Metadata } from "next";
import { api, buildQuery } from "@/lib/api";
import type { ToolListResponse } from "@/types/tool";
import MarketplaceClient from "./MarketplaceClient";

export const metadata: Metadata = {
  title: "Marketplace — Hackmarket",
  description:
    "Discover, integrate, and scale with production-ready AI tools. Browse by category, filter by price, and start building in minutes.",
};

export default async function MarketplacePage() {
  let initialData: ToolListResponse | null = null;

  try {
    initialData = await api.get<ToolListResponse>(
      `/tools${buildQuery({ limit: 20, sort_by: "newest" })}`,
      { next: { revalidate: 60 } }
    );
  } catch {
    // Client component handles the empty / error state
  }

  return <MarketplaceClient initialData={initialData} />;
}
