"use client";

import { createContext, forwardRef, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { Camera } from "@/lib/engine/geometry/camera";
import type { CanvasObject, ImageObj, ObjectType } from "@/lib/engine/model/types";
import { DomImageLayer } from "@/lib/engine/render/dom-image-layer";
import type { ImageLayer } from "@/lib/engine/render/image-layer";
import { objectZ } from "@/lib/engine/render/image-items";
import type { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { LodContext, useLod } from "./lod";
import { buildRenderTree } from "./render-tree";
import { useDocObject } from "./useDocObject";
import { useImageLayerFeed } from "./useImageLayerFeed";
import { ArrowView } from "./objects/ArrowView";
import { FrameView } from "./objects/FrameView";
import { ShapeView } from "./objects/ShapeView";
import { StickyView } from "./objects/StickyView";
import { StrokeView } from "./objects/StrokeView";
import { TextView } from "./objects/TextView";
import { TypeSpecimenView } from "./objects/TypeSpecimenView";

let renderProbe: ((id: string) => void) | null = null;
/** Test hook: called with the id each time an object node renders. */
export function setObjectRenderProbe(fn: ((id: string) => void) | null): void {
  renderProbe = fn;
}

type NodeProps = { doc: BoardDoc; id: string; assets: AssetResolver };

/** Frame id -> ids drawn inside it. Only frames read this, so a change re-renders frames, not every object. */
const KidsContext = createContext<ReadonlyMap<string, readonly string[]>>(new Map());

function FrameChildren({ doc, id, assets }: NodeProps) {
  const kids = useContext(KidsContext).get(id);
  return (
    <>
      {(kids ?? []).map((k) => (
        <ObjectNode key={k} doc={doc} id={k} assets={assets} />
      ))}
    </>
  );
}

/** Everything a view of one object gets. `lod` is the camera zoom the layer was last settled at. */
export type ObjectViewProps<T extends CanvasObject = CanvasObject> = {
  obj: T;
  doc: BoardDoc;
  assets: AssetResolver;
  lod: number;
  /** Only frames receive children (the objects drawn inside them). */
  children?: ReactNode;
};

type ViewOf<K extends ObjectType> = ComponentType<ObjectViewProps<Extract<CanvasObject, { type: K }>>>;

/** Quiet grey box for a type whose real view is not available: nothing a newer board holds can crash the canvas. */
export function PlaceholderView() {
  return (
    <div
      aria-hidden="true"
      data-placeholder=""
      style={{ position: "absolute", inset: 0, background: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
    />
  );
}

const NoView = () => null;

/**
 * One view per object type. Later features replace their entry (video, link, embed, swatch, palette, type specimen);
 * the entries for types whose view is not built yet are the grey placeholder.
 */
export const OBJECT_VIEWS: { [K in ObjectType]: ViewOf<K> } = {
  // Images are drawn by the ImageLayer (see useImageLayerFeed), not by React.
  image: NoView,
  text: ({ obj, doc }) => <TextView doc={doc} obj={obj} />,
  sticky: ({ obj, doc }) => <StickyView doc={doc} obj={obj} />,
  shape: ({ obj, doc }) => <ShapeView doc={doc} obj={obj} />,
  stroke: ({ obj }) => <StrokeView obj={obj} />,
  arrow: ({ obj, doc }) => <ArrowView doc={doc} obj={obj} />,
  frame: ({ obj, doc, children }) => (
    <FrameView doc={doc} obj={obj}>
      {children}
    </FrameView>
  ),
  group: NoView,
  video: PlaceholderView,
  link: PlaceholderView,
  embed: PlaceholderView,
  swatch: PlaceholderView,
  palette: PlaceholderView,
  typeSpecimen: ({ obj }) => <TypeSpecimenView obj={obj} />,
};

const ObjectNode = memo(
  function ObjectNode({ doc, id, assets }: NodeProps) {
    const obj = useDocObject(doc, id);
    const { zoom } = useLod();
    renderProbe?.(id);
    if (!obj || obj.type === "group") return null;

    const View = (OBJECT_VIEWS[obj.type] ?? PlaceholderView) as ComponentType<ObjectViewProps>;
    const body: ReactNode = (
      <View obj={obj} doc={doc} assets={assets} lod={zoom}>
        {obj.type === "frame" ? <FrameChildren doc={doc} id={id} assets={assets} /> : undefined}
      </View>
    );

    // Arrows are drawn in absolute canvas coordinates, everything else is placed with its own box.
    const placed = obj.type !== "arrow";
    return (
      <div
        data-object-id={obj.id}
        data-object-type={obj.type}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: placed ? obj.w : 1,
          height: placed ? obj.h : 1,
          transformOrigin: "50% 50%",
          transform: placed ? `translate(${obj.x}px, ${obj.y}px) rotate(${obj.rotation}rad)` : undefined,
          opacity: obj.opacity < 1 ? obj.opacity : undefined,
          // Shared with the image layer so images and these objects interleave by their z-order.
          zIndex: objectZ(doc, obj),
        }}
      >
        {body}
      </div>
    );
  },
  (a, b) => a.doc === b.doc && a.id === b.id && a.assets === b.assets,
);

export type ObjectLayerView = { camera: Camera; viewport: { w: number; h: number } };

export type ObjectLayerProps = {
  doc: BoardDoc;
  /** Only `visible` is used. */
  index: Pick<SpatialIndex, "visible">;
  assets: AssetResolver;
  /** The camera and viewport the culling and level of detail are computed for (updated when the camera settles). */
  view: ObjectLayerView;
  dpr?: number;
  /** Margin around the viewport (screen px) within which objects stay mounted. */
  marginPx?: number;
  /** Draws the images. Default: a DomImageLayer of its own (the canvas passes the one it also drives while gesturing). */
  imageLayer?: ImageLayer;
  /** Credits overlay text per image (null = none). */
  captionFor?: (obj: ImageObj) => string | null;
};

/**
 * Mounts only the objects returned by `index.visible()`. The element itself is the camera layer: its `transform` is
 * written by the owner (CanvasView) directly, never through React state.
 */
export const ObjectLayer = forwardRef<HTMLDivElement, ObjectLayerProps>(function ObjectLayer(
  { doc, index, assets, view, dpr = 1, marginPx = 512, imageLayer, captionFor },
  ref,
) {
  const [version, setVersion] = useState(0);
  const computed = useMemo(() => {
    // `version` is only a recompute trigger.
    void version;
    const ids = index.visible(view.camera, view.viewport, marginPx);
    const tree = buildRenderTree(doc, ids);
    // Images are not React's: they go to the image layer, and only the rest is mounted as nodes.
    const imageIds = ids.filter((id) => doc.get(id)?.type === "image");
    if (imageIds.length === 0) return { ids, tree, imageIds, roots: tree.roots, kids: tree.kids };
    const isImage = new Set(imageIds);
    const kids = new Map<string, string[]>();
    for (const [frame, list] of tree.kids) kids.set(frame, list.filter((id) => !isImage.has(id)));
    return { ids, tree, imageIds, roots: tree.roots.filter((id) => !isImage.has(id)), kids };
  }, [doc, index, view, marginPx, version]);

  const ownLayer = useMemo(() => (imageLayer ? null : new DomImageLayer({ resolver: assets, inheritCamera: true })), [imageLayer, assets]);
  const layer = imageLayer ?? ownLayer!;
  const imageHost = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    layer.mount(imageHost.current!);
    return () => layer.destroy();
  }, [layer]);
  useImageLayerFeed({ doc, layer, assets, ids: computed.imageIds, camera: view.camera, viewport: view.viewport, dpr, captionFor });

  // Recompute when the doc changes in a way that alters what is mounted or how it nests; plain moves of mounted
  // objects only re-render those objects (see useDocObject).
  const known = useRef(computed.tree.signature);
  useEffect(() => {
    known.current = computed.tree.signature;
  }, [computed]);
  useEffect(
    () =>
      doc.onChange((changed) => {
        for (const id of changed) {
          const had = known.current.get(id);
          const obj = doc.get(id);
          if (had === undefined || !obj || had !== `${obj.parentId ?? ""}|${obj.index}`) {
            setVersion((v) => v + 1);
            return;
          }
        }
      }),
    [doc],
  );

  const lod = useMemo(() => ({ zoom: view.camera.z, dpr }), [view.camera.z, dpr]);
  const { roots, kids } = computed;

  return (
    <LodContext.Provider value={lod}>
      <KidsContext.Provider value={kids}>
        <div
          ref={ref}
          data-canvas-layer=""
          style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", pointerEvents: "none" }}
        >
          {/* No stacking context of its own: the images inside take part in this layer's z-order. */}
          <div ref={imageHost} data-image-layer="" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }} />
          {roots.map((id) => (
            <ObjectNode key={id} doc={doc} id={id} assets={assets} />
          ))}
        </div>
      </KidsContext.Provider>
    </LodContext.Provider>
  );
});
