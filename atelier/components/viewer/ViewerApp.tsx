"use client";

import { Eye, EyeOff, Hand, LayoutGrid, WifiOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { slideAnnouncement } from "@/lib/engine/present/slides";
import type { SharePageData } from "@/lib/viewer/page-data";
import { frameIdOf, imageAt } from "@/lib/viewer/scene";
import { markWelcomeSeen, welcomeSeen } from "@/lib/viewer/welcome";
import { createViewerApi, GoneError, type ViewerApi } from "@/lib/viewer/viewer-client";
import { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import type { ViewerBoard, ViewerObject } from "@/lib/viewer/viewer-types";
import { DownloadMenu } from "./DownloadMenu";
import { ErrorScreen, PasswordGate, Unavailable } from "./Gate";
import { ImageLightbox } from "./ImageLightbox";
import { SlideDeck } from "./SlideDeck";
import { ThumbStrip } from "./ThumbStrip";
import { ViewerCanvas } from "./ViewerCanvas";
import { Watermark } from "./Watermark";
import { WelcomeCard } from "./WelcomeCard";

/** What the page reports about a visit. Task 18 (link analytics) turns these into beacons; nothing is sent from here. */
export type ViewEvent = { type: "open" } | { type: "slide"; frameId: string; index: number } | { type: "mode"; mode: "slides" | "canvas" };

export interface ViewerAppProps {
  token: string;
  initial: SharePageData;
  /** Tests pass a fake; the page uses the real one. */
  api?: ViewerApi;
  onView?: (e: ViewEvent) => void;
}

type Phase = "gone" | "password" | "error" | "ready";
type Ready = Extract<SharePageData, { kind: "ready" }>;

/** What the review controls (Task 15) read: the API, the board, and how to end the visit when the link dies. */
export interface ViewerContextValue {
  api: ViewerApi;
  board: ViewerBoard;
  resolver: ViewerResolver;
  visitorName: string | null;
  setVisitorName: (n: string) => void;
  markGone: () => void;
  online: boolean;
}
const ViewerCtx = createContext<ViewerContextValue | null>(null);
export function useViewer(): ViewerContextValue {
  const v = useContext(ViewerCtx);
  if (!v) throw new Error("useViewer outside ViewerApp");
  return v;
}

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const useOnline = (): boolean =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

/** The pictures that share a frame with `objId` (the whole board's free pictures when it is in none), in reading order. */
export function contextImages(objects: readonly ViewerObject[], objId: string): Extract<ViewerObject, { type: "image" }>[] {
  const home = frameIdOf(objects, objId);
  const list = objects.filter((o): o is Extract<ViewerObject, { type: "image" }> => o.type === "image" && frameIdOf(objects, o.id) === home);
  return list.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function ViewerApp({ token, initial, api: apiProp, onView }: ViewerAppProps) {
  const api = useMemo(() => apiProp ?? createViewerApi(token), [apiProp, token]);
  const [phase, setPhase] = useState<Phase>(initial.kind === "ready" ? "ready" : initial.kind === "error" ? "error" : initial.kind);
  const [data, setData] = useState<Ready | null>(initial.kind === "ready" ? initial : null);
  const studioName = initial.kind === "ready" || initial.kind === "password" ? initial.studioName : "";
  const linkKey = initial.kind === "ready" || initial.kind === "password" ? initial.linkKey : "";
  const [sessionState, setSessionState] = useState<"ok" | "pending" | "busy" | "error">(initial.kind === "ready" && initial.hasSession ? "ok" : "pending");
  const online = useOnline();
  const markGone = useCallback(() => setPhase("gone"), []);

  // ---- a session for links without a password: asked for after hydration (a page cannot set a cookie while rendering) ----
  const asking = useRef(false);
  const startSession = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      const r = await api.session();
      if (r.ok) {
        setData((d) => (d ? { ...d, hasSession: true, visitorName: r.name } : d));
        setSessionState("ok");
      } else if (r.reason === "gone") setPhase("gone");
      else if (r.reason === "password") setPhase("password");
      else setSessionState(r.reason === "busy" ? "busy" : "error");
    } catch {
      setSessionState("error");
    } finally {
      asking.current = false;
    }
  }, [api]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asks the server for this visit's session once the page is interactive; state changes only after the response
    if (phase === "ready" && sessionState === "pending" && data && !data.hasSession) void startSession();
  }, [phase, sessionState, data, startSession]);

  const unlock = useCallback(
    async (password: string) => {
      const r = await api.unlock(password);
      if (r.ok) {
        try {
          const board = await api.board();
          setData({ kind: "ready", studioName, linkKey, hasSession: true, visitorName: board.visitor.name, title: board.board.title, board });
          setSessionState("ok");
          setPhase("ready");
        } catch (e) {
          setPhase(e instanceof GoneError ? "gone" : "error");
        }
      } else if (r.reason === "gone") setPhase("gone");
      return r;
    },
    [api, studioName, linkKey],
  );

  if (phase === "gone") return <Unavailable />;
  if (phase === "password") return <PasswordGate studioName={studioName} onUnlock={unlock} />;
  if (phase === "error" || !data) return <ErrorScreen offline={!online} onRetry={() => window.location.reload()} />;

  return (
    <Viewer
      key={data.board.visitor.id || "first"}
      data={data}
      api={api}
      online={online}
      sessionState={sessionState}
      retrySession={() => {
        setSessionState("pending");
        void startSession();
      }}
      markGone={markGone}
      setVisitorName={(n) => setData((d) => (d ? { ...d, visitorName: n } : d))}
      onView={onView}
    />
  );
}

function Viewer({
  data,
  api,
  online,
  sessionState,
  retrySession,
  markGone,
  setVisitorName,
  onView,
}: {
  data: Ready;
  api: ViewerApi;
  online: boolean;
  sessionState: "ok" | "pending" | "busy" | "error";
  retrySession: () => void;
  markGone: () => void;
  setVisitorName: (n: string) => void;
  onView?: (e: ViewEvent) => void;
}) {
  const { board } = data;
  const resolver = useMemo(() => new ViewerResolver(board), [board]);
  const n = board.slides.length;
  const [mode, setMode] = useState<"slides" | "canvas">(n > 0 ? "slides" : "canvas");
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev" | "none">("none");
  const [credits, setCredits] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [lightbox, setLightbox] = useState<{ id: string; index: number } | null>(null);
  const [welcome, setWelcome] = useState(false);
  const slide = board.slides[index] ?? null;

  // The welcome note, once per link and browser.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads this browser's storage, which only exists after hydration
    if (board.options.welcomeNote && data.linkKey && !welcomeSeen(data.linkKey)) setWelcome(true);
  }, [board.options.welcomeNote, data.linkKey]);

  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    onView?.({ type: "open" });
  }, [onView]);

  const goto = useCallback(
    (i: number, how: "key" | "ui" = "ui") => {
      const next = Math.min(Math.max(0, i), Math.max(0, n - 1));
      setIndex((cur) => {
        if (cur === next) return cur;
        setDir(how === "key" ? "none" : next > cur ? "next" : "prev");
        return next;
      });
    },
    [n],
  );

  const firstAnnounce = useRef(true);
  useEffect(() => {
    if (!slide) return;
    if (firstAnnounce.current) {
      firstAnnounce.current = false;
      return;
    }
    setAnnounce(slideAnnouncement(index, n, slide.name));
    onView?.({ type: "slide", frameId: slide.id, index });
  }, [index, slide, n, onView]);

  // Arrow keys, Home and End move between slides (not while typing, with a dialog open, or while zoomed in: the picture pans then).
  useEffect(() => {
    if (mode !== "slides") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[data-modal-layer]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goto(index + 1, "key");
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goto(index - 1, "key");
      else if (e.key === "Home") goto(0, "key");
      else if (e.key === "End") goto(n - 1, "key");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, index, n, goto]);

  const setModeTo = (m: "slides" | "canvas") => {
    setMode(m);
    onView?.({ type: "mode", mode: m });
  };

  const lightboxImages = useMemo(() => (lightbox ? contextImages(board.objects, lightbox.id) : []), [lightbox, board.objects]);
  const openImage = useCallback(
    (id: string) => {
      const list = contextImages(board.objects, id);
      setLightbox({ id, index: Math.max(0, list.findIndex((o) => o.id === id)) });
    },
    [board.objects],
  );

  const value = useMemo<ViewerContextValue>(
    () => ({ api, board, resolver, visitorName: data.visitorName, setVisitorName, markGone, online }),
    [api, board, resolver, data.visitorName, setVisitorName, markGone, online],
  );

  const changedTotal = board.changed ? Object.values(board.changed.byFrame).reduce((a, c) => a + c.added + c.changed, 0) : 0;
  const roundLine = board.round ? (board.round.label.trim() ? board.round.label : `Round ${board.round.number}`) : null;
  const canvasFocus = slide ? { rect: { x: slide.x, y: slide.y, w: slide.w, h: slide.h }, key: slide.id } : null;

  return (
    <ViewerCtx.Provider value={value}>
      <div className="vw-root">
        <header className="vw-top">
          <div className="vw-titlewrap">
            {data.studioName ? <p className="vw-eyebrow">{data.studioName}</p> : null}
            <h1 className="vw-serif vw-title">{board.board.title}</h1>
            {roundLine || changedTotal > 0 ? (
              <p className="vw-sub">
                {roundLine}
                {roundLine && changedTotal > 0 ? " · " : ""}
                {changedTotal > 0 ? `${changedTotal} updated since your last visit` : ""}
              </p>
            ) : null}
          </div>
          <div className="vw-actions">
            {n > 0 ? (
              <button type="button" className="vw-btn" aria-pressed={mode === "canvas"} onClick={() => setModeTo(mode === "canvas" ? "slides" : "canvas")}>
                {mode === "canvas" ? <LayoutGrid aria-hidden="true" size={18} strokeWidth={1.75} /> : <Hand aria-hidden="true" size={18} strokeWidth={1.75} />}
                Free roam
              </button>
            ) : null}
            {board.options.showCredits ? (
              <button type="button" className="vw-btn" aria-label="Credits" aria-pressed={credits} onClick={() => setCredits((c) => !c)}>
                {credits ? <EyeOff aria-hidden="true" size={18} strokeWidth={1.75} /> : <Eye aria-hidden="true" size={18} strokeWidth={1.75} />}
                <span className="vw-hide-sm">Credits</span>
              </button>
            ) : null}
            {board.options.allowDownload ? <DownloadMenu slide={mode === "slides" ? slide : null} /> : null}
          </div>
        </header>

        {!online ? (
          <p className="vw-banner" role="status">
            <WifiOff aria-hidden="true" size={16} strokeWidth={1.75} /> You&apos;re offline. This page will carry on when your connection is back.
          </p>
        ) : null}
        {sessionState === "busy" || sessionState === "error" ? (
          <p className="vw-banner" role="alert">
            {sessionState === "busy" ? "Lots of visitors just now." : "We couldn’t start your visit."}{" "}
            <button type="button" className="vw-link" onClick={retrySession}>
              Try again
            </button>
          </p>
        ) : null}

        <main id="vw-main" className="vw-main">
          {n === 0 && board.objects.length === 0 ? (
            <div className="vw-center">
              <p className="vw-muted">There&apos;s nothing on this board yet.</p>
            </div>
          ) : mode === "slides" && n > 0 ? (
            <SlideDeck board={board} resolver={resolver} index={index} dir={dir} onIndex={(i) => goto(i)} credits={credits} onOpenImage={openImage} />
          ) : (
            <ViewerCanvas
              objects={board.objects}
              resolver={resolver}
              credits={credits}
              focus={canvasFocus}
              label="Board. Drag to move around, pinch or use the zoom buttons to zoom."
              onTap={({ point, target }) => {
                if (target instanceof Element && target.closest("button, a, video, [data-no-tap]")) return;
                const hit = imageAt(board.objects, point);
                if (hit) openImage(hit.id);
              }}
            />
          )}
        </main>

        {n > 0 ? (
          <footer className="vw-bottom">
            <ThumbStrip board={board} index={index} onSelect={(i) => goto(i)} />
            <div className="vw-nav">
              <button type="button" className="vw-btn" onClick={() => goto(index - 1)} disabled={index === 0} aria-label="Previous slide">
                Previous
              </button>
              <p className="vw-count" aria-hidden="true">
                {index + 1} / {n}
                {slide ? <span className="vw-count-name"> {slide.name}</span> : null}
              </p>
              <button type="button" className="vw-btn" onClick={() => goto(index + 1)} disabled={index >= n - 1} aria-label="Next slide">
                Next
              </button>
            </div>
          </footer>
        ) : null}

        <p className="vw-sr" role="status" aria-live="polite">
          {announce}
        </p>
        {board.options.watermark ? <Watermark studio={data.studioName} name={data.visitorName} /> : null}

        {lightbox ? (
          <ImageLightbox
            images={lightboxImages}
            index={lightbox.index}
            onIndex={(i) => setLightbox({ id: lightboxImages[i]?.id ?? lightbox.id, index: i })}
            onClose={() => setLightbox(null)}
            resolver={resolver}
            credits={credits}
            allowDownload={board.options.allowDownload}
            title={board.board.title}
          />
        ) : null}
        {welcome ? (
          <WelcomeCard
            studioName={data.studioName}
            title={board.board.title}
            note={board.options.welcomeNote}
            onClose={() => {
              markWelcomeSeen(data.linkKey);
              setWelcome(false);
            }}
          />
        ) : null}
      </div>
    </ViewerCtx.Provider>
  );
}
