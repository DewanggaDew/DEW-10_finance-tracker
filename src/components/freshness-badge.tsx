import { Freshness } from "@/core/freshness";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// PRD §6.2: every displayed price carries its freshness.
const STYLES: Record<Freshness, string> = {
  "LIVE~": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  EOD: "",
  STALE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  return (
    <Badge
      variant="secondary"
      className={cn("font-mono text-[10px]", STYLES[freshness])}
      title={
        freshness === "LIVE~"
          ? "Near-real-time (delayed ~15–20 min)"
          : freshness === "EOD"
            ? "Last close"
            : "Older than 24h or source failing"
      }
    >
      {freshness}
    </Badge>
  );
}
