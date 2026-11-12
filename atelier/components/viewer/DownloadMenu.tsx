"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { downloadName, downloadUrl } from "@/lib/viewer/download";
import type { ViewerSlide } from "@/lib/viewer/viewer-types";
import { ModalShell } from "./ModalShell";

/**
 * Only rendered when the studio allowed downloads. It saves the current slide's pre-rendered picture; single pictures can be
 * saved from their full-size view. A download is a convenience, not protection: the files are public by URL (the studio's own
 * choice to allow it), and the dialog says so.
 */
export function DownloadMenu({ slide }: { slide: ViewerSlide | null }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const url = slide?.previewW1280 ?? null;
  return (
    <>
      <button type="button" className="vw-btn" aria-label="Download" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Download aria-hidden="true" size={18} strokeWidth={1.75} />
        <span className="vw-hide-sm">Download</span>
      </button>
      {open ? (
        <ModalShell label="Download" onClose={() => setOpen(false)} variant="center">
          <h2 className="vw-serif vw-h2">Download</h2>
          {url && slide ? (
            <button
              type="button"
              className="vw-btn vw-btn-primary"
              data-autofocus=""
              onClick={async () => {
                const r = await downloadUrl(url, downloadName(slide.name, url));
                setStatus(r === "saved" ? "Saved to your device." : "Opened in a new tab.");
              }}
            >
              <Download aria-hidden="true" size={18} strokeWidth={1.75} />
              Download this slide
            </button>
          ) : (
            <p className="vw-muted">Open a picture to download its original file.</p>
          )}
          <p className="vw-muted vw-small">Downloads are a convenience. The picture files can still be reached by anyone who has this link.</p>
          <p role="status" className="vw-small">
            {status}
          </p>
          <button type="button" className="vw-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </ModalShell>
      ) : null}
    </>
  );
}
