import { notFound } from "next/navigation";
import { isInspectorEnabled } from "@/lib/inspector";
import { InspectorClient } from "./InspectorClient";

export const dynamic = "force-dynamic";

export default function InspectorPage() {
  if (!isInspectorEnabled()) {
    notFound();
  }
  return <InspectorClient />;
}
