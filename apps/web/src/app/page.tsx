import type { Metadata } from "next";
import { api, buildQuery } from "@/lib/api";
import type { Tool, ToolListResponse } from "@/types/tool";
import LandingPage from "./LandingPage";

export const metadata: Metadata = {
  title: "Hackmarket — AI Tool Marketplace",
  description:
    "Every hackathon builds tools that die on GitHub. Hackmarket brings them back to life. A curated API marketplace where developers sell their AI tools and companies use them with one API call.",
};

export default async function Home() {
  let featuredTools: Tool[] = [];

  try {
    const data = await api.get<ToolListResponse>(
      `/tools${buildQuery({ is_featured: "true", limit: 4, sort_by: "popular" })}`,
      { next: { revalidate: 300 } }
    );
    featuredTools = data.items;
  } catch {
    // Fallthrough — LandingPage renders placeholder cards
  }

  return <LandingPage featuredTools={featuredTools} />;
}
