// ── File intake pipeline (ONBOARDING_SPEC v1.1 §3.3, §4.2, §4.3) ─────────────
// Validation, ZIP unpacking (PDFs only), pdf.js text extraction with the
// password callback, scanned-PDF detection, page rendering for the vision
// fallback, and photo downscaling. Pure logic separated from the Phase 3 UI.

import {
  MAX_FILE_MB, MAX_FILES_PER_BATCH,
  SCANNED_PDF_TEXT_YIELD_CHARS_PER_PAGE, SCANNED_PDF_FALLBACK_PAGE_CAP,
  VISION_LONGEST_EDGE_PX, VISION_JPEG_QUALITY,
} from "../config/onboardingConfig.js";
import { loadPdfjs } from "./pdfjs.js";

const ACCEPTED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "heic", "zip"];

export function fileExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

/** §3.3: types, 50 MB per file, 20 per batch. Pure — unit-tested. */
export function validateFiles(files) {
  const accepted = [];
  const rejected = [];
  [...files].forEach((f, i) => {
    const ext = fileExtension(f.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      rejected.push({ name: f.name, reason: `Unsupported type .${ext || "?"}: PDF, JPG, PNG, HEIC, or ZIP.` });
    } else if (f.size > MAX_FILE_MB * 1024 * 1024) {
      rejected.push({ name: f.name, reason: `Over the ${MAX_FILE_MB} MB per-file limit.` });
    } else if (accepted.length >= MAX_FILES_PER_BATCH) {
      rejected.push({ name: f.name, reason: `Batch limit is ${MAX_FILES_PER_BATCH} files. Add this one in the next batch.` });
    } else {
      accepted.push(f);
    }
  });
  return { accepted, rejected };
}

/**
 * §4.2 ZIP handling: unpack client-side, ingest contained PDFs only; other
 * entries get a per-entry "skipped (unsupported)" note; nested ZIPs ignored.
 */
export async function unpackZip(file) {
  const { default: JSZip } = await import("jszip");
  // ArrayBuffer works for browser File/Blob and Node's File alike.
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const pdfs = [];
  const skipped = [];
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const ext = fileExtension(entry.name);
    if (ext === "pdf") {
      const blob = await entry.async("blob");
      if (blob.size > MAX_FILE_MB * 1024 * 1024) {
        skipped.push({ name: entry.name, reason: `skipped (over ${MAX_FILE_MB} MB)` });
      } else {
        pdfs.push(new File([blob], entry.name.split("/").pop(), { type: "application/pdf" }));
      }
    } else {
      skipped.push({ name: entry.name, reason: ext === "zip" ? "skipped (nested ZIP ignored)" : "skipped (unsupported)" });
    }
  }
  return { pdfs, skipped };
}

export class PdfPasswordError extends Error {
  constructor() { super("Password didn't work. You can retry or skip this file."); this.name = "PdfPasswordError"; }
}

/**
 * pdf.js text extraction with §3.3 password behavior: `askPassword(isRetry)`
 * is awaited for encrypted files; a second wrong password fails the file.
 * @returns {{pageTexts: string[], pageCount: number, doc: object}}
 */
export async function extractPdfText(file, { askPassword } = {}) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  let attempts = 0;
  loadingTask.onPassword = async (updatePassword, reason) => {
    // reason 1 = NEED_PASSWORD (first ask), 2 = INCORRECT_PASSWORD (retry)
    attempts++;
    if (attempts > 2 || !askPassword) { loadingTask.destroy(); return; }
    const pw = await askPassword(reason === 2);
    if (pw == null) { loadingTask.destroy(); return; } // user skipped
    updatePassword(pw);
  };
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    if (/password/i.test(e?.name || "") || /password/i.test(e?.message || "")) throw new PdfPasswordError();
    throw e;
  }
  const pageTexts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map(it => it.str).join(" ").trim());
  }
  return { pageTexts, pageCount: doc.numPages, doc };
}

/** §4.3 scanned-PDF detection: average text yield below the threshold. */
export function isScannedPdf(pageTexts) {
  if (!pageTexts.length) return true;
  const avg = pageTexts.reduce((n, t) => n + t.length, 0) / pageTexts.length;
  return avg < SCANNED_PDF_TEXT_YIELD_CHARS_PER_PAGE;
}

export function scannedPageCapExceeded(pageCount) {
  return pageCount > SCANNED_PDF_FALLBACK_PAGE_CAP;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Render selected PDF pages to JPEG data URLs at ~150 dpi for vision mode.
 * Each page render is time-boxed — a pathological PDF must surface as a
 * Failed row with a retry (§3.3), never hang the pipeline silently.
 */
export async function renderPdfPagesToImages(doc, pageNumbers) {
  const images = [];
  for (const p of pageNumbers) {
    const page = await withTimeout(doc.getPage(p), 30000, `Page ${p} took too long to open. Try re-adding the file.`);
    const viewport = page.getViewport({ scale: 150 / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // intent: "print" — display-intent renders schedule on requestAnimationFrame,
    // which pauses in a background tab and hangs the pipeline; print-intent
    // renders run to completion regardless of tab visibility.
    await withTimeout(
      page.render({ canvasContext: canvas.getContext("2d"), viewport, intent: "print" }).promise,
      30000,
      `Page ${p} took too long to read. Try re-adding the file, or photograph the page instead.`
    );
    images.push(canvas.toDataURL("image/jpeg", VISION_JPEG_QUALITY));
  }
  return images;
}

/**
 * §4.3 photo path: downscale longest edge to 2000 px, JPEG q≈0.8. HEIC is
 * attempted through the browser's image decoder; most non-Safari browsers
 * cannot decode HEIC — those files fail with a clear reason.
 */
export async function downscaleImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(
        fileExtension(file.name) === "heic"
          ? "This browser can't read HEIC photos. Try uploading from your phone instead (iPhone converts automatically), or set your iPhone camera to Settings → Camera → Formats → Most Compatible so photos save as JPG."
          : "Couldn't read this image file."
      ));
      el.src = url;
    });
    const scale = Math.min(1, VISION_LONGEST_EDGE_PX / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", VISION_JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Parse "3-7" / "1,3,5" style page ranges against a page count. Pure — unit-tested. */
export function parsePageRange(input, pageCount) {
  const pages = new Set();
  for (const part of String(input || "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(t);
    if (range) {
      const a = parseInt(range[1], 10), b = parseInt(range[2], 10);
      if (a < 1 || b < a) return null;
      for (let p = a; p <= Math.min(b, pageCount); p++) pages.add(p);
    } else if (/^\d+$/.test(t)) {
      const p = parseInt(t, 10);
      if (p < 1) return null;
      if (p <= pageCount) pages.add(p);
    } else {
      return null;
    }
  }
  return pages.size ? [...pages].sort((a, b) => a - b) : null;
}
