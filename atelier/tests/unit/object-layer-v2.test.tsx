import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { OBJECT_TYPES, type NewObject, type ObjectType } from "@/lib/engine/model/types";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { ObjectLayer } from "@/components/canvas/ObjectLayer";

const noAssets: AssetResolver = { url: () => null, available: () => null };

describe("ObjectLayer with the v2 object types", () => {
  it("mounts one element per object of every type without crashing", () => {
    const doc = new BoardDoc();
    const types = OBJECT_TYPES.filter((t) => t !== "group" && t !== "arrow") as ObjectType[];
    types.forEach((t, i) => doc.create({ ...defaultsFor(t), id: `o-${t}`, x: i * 50, y: 0, w: 40, h: 40 } as NewObject));
    const { container } = render(
      <ObjectLayer
        doc={doc}
        index={{ visible: () => types.map((t) => `o-${t}`) }}
        assets={noAssets}
        view={{ camera: { x: 0, y: 0, z: 1 }, viewport: { w: 2000, h: 800 } }}
      />,
    );
    for (const t of types) {
      expect(container.querySelector(`[data-object-id="o-${t}"][data-object-type="${t}"]`), t).not.toBeNull();
    }
    // Types whose view is not built yet show the grey placeholder.
    expect(container.querySelector('[data-object-type="swatch"] [data-placeholder]')).not.toBeNull();
  });
});
