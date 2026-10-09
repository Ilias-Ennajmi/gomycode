import type { Metadata } from "next";
import { SpaceView } from "./SpaceView";

export const metadata: Metadata = { title: "Space" };

export default async function SpacePage({ params }: { params: Promise<{ space: string }> }) {
  const { space } = await params;
  return <SpaceView id={space} />;
}
