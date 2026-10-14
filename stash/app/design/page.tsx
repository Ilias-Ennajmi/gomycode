import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/Toast";
import { DesignBoard } from "./DesignBoard";

export const metadata: Metadata = { title: "Design" };

export default function DesignPage() {
  return (
    <ToastProvider>
      <DesignBoard />
    </ToastProvider>
  );
}
