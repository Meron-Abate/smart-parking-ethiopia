"use client";

import { useRouter } from "next/navigation";
import { DestinationSearch, type PlaceOption } from "./destination-search";

export function HomeSearch() {
  const router = useRouter();
  function go(p: PlaceOption) {
    const q = new URLSearchParams({ lat: String(p.latitude), lng: String(p.longitude), name: p.name });
    router.push(`/search?${q.toString()}`);
  }
  return <DestinationSearch onSelect={go} autoFocus />;
}
