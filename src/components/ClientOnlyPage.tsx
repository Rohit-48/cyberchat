"use client";

import dynamic from "next/dynamic";

const CyberchatApp = dynamic(() => import("@/components/CyberchatApp"), {
  ssr: false,
});

export default function ClientOnlyPage() {
  return <CyberchatApp />;
}
