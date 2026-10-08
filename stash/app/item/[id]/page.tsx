import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemView } from "./ItemView";

export const metadata: Metadata = { title: "Item" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ItemView id={id} />
    </Suspense>
  );
}
