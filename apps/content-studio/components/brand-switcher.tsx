"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { createBrand } from "@/lib/actions/brands";

type Brand = { id: string; slug: string; name: string };

export function BrandSwitcher({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("brand") ?? "general";
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  function go(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("brand", slug);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onSelect(value: string) {
    if (value === "__addnew__") {
      setAdding(true);
      return;
    }
    go(value);
  }

  function submitNewBrand() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const brand = await createBrand(name);
      setAdding(false);
      setNewName("");
      if (brand) go(brand.slug);
    });
  }

  if (adding) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNewBrand();
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="Nom de la marque"
          className="w-40 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <button
          onClick={submitNewBrand}
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-2 py-1 text-sm text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
    >
      {brands.map((b) => (
        <option key={b.id} value={b.slug}>
          {b.name}
        </option>
      ))}
      <option value="__addnew__">+ Nouvelle marque…</option>
    </select>
  );
}
