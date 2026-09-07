// ── Phase 3: Add Your Information (ONBOARDING_SPEC v1.1 §3.3, §4.2, §4.3) ────
// Four equal tiles plus the dropzone. Files run a visible per-file status
// pipeline (Queued → Reading → Extracting → Done/Failed+retry) and every
// extraction lands in the staging queue — never the record (§5.1). Photos
// and pasted text share the same §4.1 contract via src/lib/extraction.js,
// which owns the consent hard-block.

import { useEffect, useRef, useState } from "react";
import { MAX_FILE_MB, MAX_FILES_PER_BATCH, PASTE_CHAR_CAP, VISION_MAX_IMAGES_PER_DOC, SCANNED_PDF_FALLBACK_PAGE_CAP } from "../../config/onboardingConfig.js";
import { validateFiles, unpackZip, extractPdfText, isScannedPdf, scannedPageCapExceeded, renderPdfPagesToImages, downscaleImage, parsePageRange, fileExtension, PdfPasswordError } from "../../lib/onboardingIntake.js";
import { extractText, extractVision, EXTRACTION_MODE } from "../../lib/extraction.js";
import { stageExtractionResult, stagedCounts } from "../../lib/onboardingStaging.js";
import { renderFixtureDocImage, fixtureDocLines } from "../../lib/fixtureExtraction.js";
import { saveState, loadState } from "../../lib/onboardingState.js";

const tileStyle = (hover) => ({
  display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
  background: hover ? "var(--accent-tint)" : "var(--card)",
  border: `1px solid ${hover ? "var(--btn-p-bd)" : "var(--border)"}`,
  borderRadius: 12, padding: "18px 20px", cursor: "pointer", minHeight: 110,
  transition: "border-color .15s, background .15s",
});
const tileTitle = { fontSize: 15, fontWeight: 600, color: "var(--text-bright)" };
const tileSub = { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 };
const primaryBtn = { minHeight: "var(--touch-target)", padding: "10px 32px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 10, color: "var(--btn-p-fg)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { minHeight: "var(--touch-target)", padding: "10px 20px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: 13, cursor: "pointer" };
const linkBtn = { background: "none", border: "none", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-sans)", minHeight: 32 };
const modalWrap = { position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const modalCard = { background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 520 };
const inp = { width: "100%", minHeight: "var(--touch-target)", background: "var(--bg-deep)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 14, outline: "none", colorScheme: "var(--scheme)" };

let fileSeq = 1;

// ── Documents-module provenance entries (§4.3, §11.4) ────────────────────────
// The ORIGINAL upload (photo pixels, extracted PDF text, pasted text) is
// always what lands in Documents and backs the side-by-side panel — in
// fixture mode too, where the extraction RESULT is the demo dataset but the
// provenance must still be the user's real artifact. Only when no physical
// source exists (module-driven staging in tests) do rendered fixture pages
// stand in.
function upsertDocEntries(result, { extractedText, pageImages, source, uploadTitle }) {
  let docs;
  try { docs = JSON.parse(localStorage.getItem("mi_documents") || "[]"); } catch { docs = []; }
  const hasPhysical = (pageImages && pageImages.length > 0) || !!extractedText;
  let links;
  if (hasPhysical) {
    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: uploadTitle || result.documents?.[0]?.source_name || "Imported document",
      category: "clinical",
      addedAt: new Date().toISOString(),
      source: source || "Onboarding import",
      extractedText: extractedText || "",
      pageImages: pageImages || [],
    };
    docs.push(entry);
    links = (result.documents || []).map(() => ({ documentsModuleId: entry.id }));
  } else {
    links = (result.documents || []).map(d => {
      let entry = docs.find(x => x.source === "Onboarding fixture" && x.title === d.source_name);
      if (!entry) {
        entry = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          title: d.source_name,
          category: "clinical",
          addedAt: new Date().toISOString(),
          source: "Onboarding fixture",
          extractedText: fixtureDocLines(d).join("\n"),
          pageImages: [renderFixtureDocImage(d.source_name, d.doc_date || "date not found", fixtureDocLines(d))],
        };
        docs.push(entry);
      }
      return { documentsModuleId: entry.id };
    });
  }
  try { localStorage.setItem("mi_documents", JSON.stringify(docs)); } catch { /* quota */ }
  return links;
}

export default function Phase3AddData({ onContinue, onManualEntry, onSkipEverything, manualSummary }) {
  const [files, setFiles] = useState(() => {
    // §3.8: descriptors persisted across tab close — anything mid-pipeline
    // comes back as Failed-resumable (file bytes can't survive a reload).
    const prior = loadState()?.add_data_files || [];
    return prior.map(f => ["queued", "reading", "extracting"].includes(f.status)
      ? { ...f, status: "failed", reason: "Interrupted when the tab closed. Add this file again to retry." }
      : f);
  });
  const [counts, setCounts] = useState(() => stagedCounts());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [shots, setShots] = useState([]);
  const [passwordReq, setPasswordReq] = useState(null); // { fileName, isRetry, resolve }
  const [rangeReq, setRangeReq] = useState(null);       // { fileName, pageCount, resolve }
  const [dragOver, setDragOver] = useState(false);
  const [hoverTile, setHoverTile] = useState(null);
  const uploadRef = useRef(null);
  const photoRef = useRef(null);
  const fileObjects = useRef(new Map()); // id -> File (memory only, for retry)

  useEffect(() => {
    saveState({ add_data_files: files.map(({ id, name, size, status, reason }) => ({ id, name, size, status, reason })) });
  }, [files]);

  const patchFile = (id, patch) => setFiles(list => list.map(f => f.id === id ? { ...f, ...patch } : f));
  const refreshCounts = () => setCounts(stagedCounts());

  const askPassword = (fileName) => (isRetry) => new Promise(resolve => setPasswordReq({ fileName, isRetry, resolve }));
  const askRange = (fileName, pageCount) => new Promise(resolve => setRangeReq({ fileName, pageCount, resolve }));

  async function processFile(id) {
    const entry = fileObjects.current.get(id);
    const meta = files.find(f => f.id === id) || { name: entry?.name };
    if (!entry) { patchFile(id, { status: "failed", reason: "File is no longer available. Add it again." }); return; }
    try {
      patchFile(id, { status: "reading", reason: "" });
      const ext = fileExtension(entry.name);

      if (ext === "zip") {
        const { pdfs, skipped } = await unpackZip(entry);
        patchFile(id, { status: "done", reason: `Unpacked ${pdfs.length} PDF${pdfs.length !== 1 ? "s" : ""}${skipped.length ? ` · ${skipped.map(s => `${s.name} ${s.reason}`).join("; ")}` : ""}` });
        addFiles(pdfs, { fromZip: true });
        return;
      }

      if (ext === "pdf") {
        const { pageTexts, pageCount, doc } = await extractPdfText(entry, { askPassword: askPassword(entry.name) });
        if (!isScannedPdf(pageTexts)) {
          patchFile(id, { status: "extracting" });
          const result = await extractText({ sourceName: entry.name, pageTexts });
          const links = upsertDocEntries(result, { extractedText: pageTexts.join("\n\n"), source: "Onboarding import", uploadTitle: entry.name });
          const { itemCount } = stageExtractionResult(result, links);
          patchFile(id, { status: "done", reason: `${itemCount} items staged for your review` });
        } else {
          // §4.3 scanned-PDF fallback → vision
          let pages = Array.from({ length: pageCount }, (_, i) => i + 1);
          if (scannedPageCapExceeded(pageCount)) {
            const chosen = await askRange(entry.name, pageCount);
            if (!chosen) { patchFile(id, { status: "failed", reason: "No pages chosen. Retry to pick pages." }); return; }
            pages = chosen.slice(0, SCANNED_PDF_FALLBACK_PAGE_CAP);
          }
          patchFile(id, { status: "extracting", reason: "Scanned document: reading pages as images" });
          const images = await renderPdfPagesToImages(doc, pages);
          const result = await extractVision({ sourceName: entry.name, images });
          const links = upsertDocEntries(result, { pageImages: images, source: "Onboarding import", uploadTitle: entry.name });
          const { itemCount } = stageExtractionResult(result, links);
          patchFile(id, { status: "done", reason: `${itemCount} items staged for your review` });
        }
        refreshCounts();
        return;
      }

      // Plain image dropped into upload — single-photo document via vision.
      patchFile(id, { status: "reading" });
      const dataUrl = await downscaleImage(entry);
      patchFile(id, { status: "extracting" });
      const result = await extractVision({ sourceName: entry.name, images: [dataUrl] });
      const links = upsertDocEntries(result, { pageImages: [dataUrl], source: "Onboarding photo", uploadTitle: entry.name });
      const { itemCount } = stageExtractionResult(result, links);
      patchFile(id, { status: "done", reason: `${itemCount} items staged for your review` });
      refreshCounts();
    } catch (e) {
      const reason = e instanceof PdfPasswordError
        ? "Password didn't work. You can retry or skip this file."
        : (e?.message || "Something went wrong reading this file.");
      patchFile(id, { status: "failed", reason });
    }
  }

  function addFiles(fileList, { fromZip = false } = {}) {
    const { accepted, rejected } = fromZip ? { accepted: [...fileList], rejected: [] } : validateFiles(fileList);
    const newEntries = accepted.map(f => {
      const id = `f${fileSeq++}_${Date.now()}`;
      fileObjects.current.set(id, f);
      return { id, name: f.name, size: f.size, status: "queued", reason: "" };
    });
    const rejectedEntries = rejected.map(r => ({ id: `r${fileSeq++}_${Date.now()}`, name: r.name, size: 0, status: "failed", reason: r.reason }));
    setFiles(list => [...list, ...newEntries, ...rejectedEntries]);
    newEntries.forEach(e => processFile(e.id));
  }

  async function processPaste() {
    const text = pasteText.slice(0, PASTE_CHAR_CAP);
    setPasteOpen(false); setPasteText("");
    const id = `p${fileSeq++}_${Date.now()}`;
    setFiles(list => [...list, { id, name: "Pasted from portal", size: text.length, status: "extracting", reason: "" }]);
    try {
      const result = await extractText({ sourceName: "Pasted from portal", pageTexts: [text] });
      const links = upsertDocEntries(result, { extractedText: text, source: "Onboarding paste", uploadTitle: "Pasted from portal" });
      const { itemCount } = stageExtractionResult(result, links);
      patchFile(id, { status: "done", reason: `${itemCount} items staged for your review` });
      refreshCounts();
    } catch (e) {
      patchFile(id, { status: "failed", reason: e?.message || "Couldn't process the pasted text." });
    }
  }

  async function addShot(fileList) {
    const f = fileList?.[0];
    if (!f) return;
    try {
      const dataUrl = await downscaleImage(f);
      setShots(s => s.length >= VISION_MAX_IMAGES_PER_DOC ? s : [...s, dataUrl]);
    } catch (e) {
      alert(e?.message || "Couldn't read that photo.");
    }
  }

  async function processShots() {
    const images = shots;
    setPhotoOpen(false); setShots([]);
    const id = `ph${fileSeq++}_${Date.now()}`;
    setFiles(list => [...list, { id, name: `Photo document (${images.length} page${images.length !== 1 ? "s" : ""})`, size: 0, status: "extracting", reason: "" }]);
    try {
      const result = await extractVision({ sourceName: "Photo document", images });
      const links = upsertDocEntries(result, { pageImages: images, source: "Onboarding photo", uploadTitle: `Photo document (${images.length} page${images.length !== 1 ? "s" : ""})` });
      const { itemCount } = stageExtractionResult(result, links);
      patchFile(id, { status: "done", reason: `${itemCount} items staged for your review` });
      refreshCounts();
    } catch (e) {
      patchFile(id, { status: "failed", reason: e?.message || "Couldn't process the photos." });
    }
  }

  const totalStaged = Object.values(counts).reduce((a, b) => a + b, 0);
  const STATUS_LABEL = { queued: "Queued", reading: "Reading", extracting: "Extracting", done: "Done", failed: "Failed" };
  const STATUS_COLOR = { queued: "var(--text-dim)", reading: "var(--accent-soft)", extracting: "var(--accent-blue)", done: "var(--green)", failed: "var(--red)" };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--text-bright)", letterSpacing: "-0.5px" }}>
          Add your information
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          Documents, photos, or portal text. Everything is staged for your review before it touches your record.
        </p>
      </div>

      {manualSummary && (
        <div role="status" aria-live="polite" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12, fontFamily: "var(--font-mono)", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", color: "var(--green)" }}>
          ✓ {manualSummary}
        </div>
      )}

      {/* Four equal tiles (§3.3) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button style={tileStyle(hoverTile === 1)} onMouseEnter={() => setHoverTile(1)} onMouseLeave={() => setHoverTile(null)} onClick={() => uploadRef.current?.click()}>
          <span style={tileTitle}>📄 Upload documents</span>
          <span style={tileSub}>PDF, JPG, PNG, HEIC, or ZIP of PDFs. Up to {MAX_FILE_MB} MB each, {MAX_FILES_PER_BATCH} per batch.</span>
        </button>
        <button style={tileStyle(hoverTile === 2)} onMouseEnter={() => setHoverTile(2)} onMouseLeave={() => setHoverTile(null)} onClick={() => setPhotoOpen(true)}>
          <span style={tileTitle}>📷 Take a photo</span>
          <span style={tileSub}>Snap your med list or a lab printout. Up to {VISION_MAX_IMAGES_PER_DOC} pages as one document.</span>
          <span style={{ ...tileSub, color: "var(--text-dim)" }}>Photo on your phone but working here? Email it to yourself, open the email on this computer, and add the photo under Upload documents.</span>
        </button>
        <button style={tileStyle(hoverTile === 3)} onMouseEnter={() => setHoverTile(3)} onMouseLeave={() => setHoverTile(null)} onClick={() => setPasteOpen(true)}>
          <span style={tileTitle}>📋 Paste from your portal</span>
          <span style={tileSub}>Copy from MyChart or any patient portal and paste the text here.</span>
        </button>
        <button style={tileStyle(hoverTile === 4)} onMouseEnter={() => setHoverTile(4)} onMouseLeave={() => setHoverTile(null)} onClick={onManualEntry}>
          <span style={tileTitle}>⌨ Enter medications directly</span>
          <span style={tileSub}>No documents handy? This takes about ten minutes and unlocks your first report.</span>
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => uploadRef.current?.click()}
        role="button" tabIndex={0} aria-label="Drop files here or browse"
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") uploadRef.current?.click(); }}
        style={{ border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`, borderRadius: 12, padding: "26px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? "var(--accent-tint)" : "transparent" }}
      >
        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>Drag &amp; drop files here, or click to browse</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6, lineHeight: 1.6 }}>
          Good examples: clinic notes, after-visit summaries, medication lists, labs from the last 3–6 months, discharge summaries.
        </div>
      </div>
      <input ref={uploadRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.zip" style={{ display: "none" }}
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={e => { addShot(e.target.files); e.target.value = ""; }} />

      {/* Per-file status list (§3.3) */}
      {files.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "6px 0" }}>
          {files.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--divider)" }}>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              {f.reason && <span style={{ flex: 2, fontSize: 12, color: f.status === "failed" ? "var(--red)" : "var(--text-secondary)", lineHeight: 1.5 }}>{f.reason}</span>}
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: STATUS_COLOR[f.status] }}>{STATUS_LABEL[f.status]}</span>
              {f.status === "failed" && fileObjects.current.has(f.id) && (
                <button onClick={() => processFile(f.id)} style={{ ...linkBtn, color: "var(--accent-soft)" }}>Retry</button>
              )}
            </div>
          ))}
        </div>
      )}

      {totalStaged > 0 && (
        <div role="status" style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12, fontFamily: "var(--font-mono)", background: "var(--accent-tint)", border: "1px solid var(--banner-bd)", color: "var(--accent-soft)" }}>
          {totalStaged} item{totalStaged !== 1 ? "s" : ""} staged and waiting for your review in the next step.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onManualEntry} style={ghostBtn}>Skip for now</button>
          <button onClick={onContinue} style={primaryBtn}>I've added everything</button>
        </div>
        <button onClick={onSkipEverything} style={linkBtn}>Skip everything for now</button>
      </div>

      {/* ── Paste modal ── */}
      {pasteOpen && (
        <div style={modalWrap}>
          <div role="dialog" aria-modal="true" aria-label="Paste from your portal" style={modalCard}>
            <div style={{ fontSize: 16, color: "var(--text-bright)", fontWeight: 600, marginBottom: 8 }}>Paste from your portal</div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
              In MyChart, open your visit summary, medication list, or test results and copy the text.
              Paste it below: formatting doesn't matter.
            </p>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value.slice(0, PASTE_CHAR_CAP))}
              style={{ ...inp, height: 180, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", margin: "6px 0 14px" }}>
              {pasteText.length.toLocaleString()} / {PASTE_CHAR_CAP.toLocaleString()} characters
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPasteOpen(false)} style={ghostBtn}>Cancel</button>
              <button onClick={processPaste} disabled={!pasteText.trim()} style={{ ...primaryBtn, opacity: pasteText.trim() ? 1 : 0.5 }}>Process</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo modal (§3.3 multi-shot) ── */}
      {photoOpen && (
        <div style={modalWrap}>
          <div role="dialog" aria-modal="true" aria-label="Take a photo" style={modalCard}>
            <div style={{ fontSize: 16, color: "var(--text-bright)", fontWeight: 600, marginBottom: 8 }}>Photograph your document</div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
              Fill the frame with the page · avoid glare · one page per shot.
              Up to {VISION_MAX_IMAGES_PER_DOC} pages are treated as one document.
            </p>
            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7, marginBottom: 12 }}>
              Photo on your phone but working here? Email it to yourself, open the email on this
              computer, and add the photo under Upload documents.
            </p>
            {shots.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {shots.map((s, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={s} alt={`Page ${i + 1}`} style={{ width: 72, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border-strong)" }} />
                    <button aria-label={`Remove page ${i + 1}`} onClick={() => setShots(list => list.filter((_, j) => j !== i))}
                      style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => { setPhotoOpen(false); setShots([]); }} style={ghostBtn}>Cancel</button>
              <button onClick={() => photoRef.current?.click()} disabled={shots.length >= VISION_MAX_IMAGES_PER_DOC}
                style={{ ...ghostBtn, color: "var(--accent-soft)", opacity: shots.length >= VISION_MAX_IMAGES_PER_DOC ? 0.5 : 1 }}>
                {shots.length === 0 ? "Take / choose photo" : "Add another page"}
              </button>
              <button onClick={processShots} disabled={shots.length === 0} style={{ ...primaryBtn, opacity: shots.length ? 1 : 0.5 }}>
                Process this document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Encrypted-PDF password prompt (§3.3) ── */}
      {passwordReq && (
        <PasswordPrompt req={passwordReq} onClose={() => setPasswordReq(null)} />
      )}

      {/* ── Scanned-PDF page-range prompt (§4.3) ── */}
      {rangeReq && (
        <RangePrompt req={rangeReq} onClose={() => setRangeReq(null)} />
      )}
    </div>
  );
}

function PasswordPrompt({ req, onClose }) {
  const [pw, setPw] = useState("");
  const submit = () => { req.resolve(pw); onClose(); };
  const skip = () => { req.resolve(null); onClose(); };
  return (
    <div style={modalWrap}>
      <div role="dialog" aria-modal="true" aria-label="PDF password" style={modalCard}>
        <div style={{ fontSize: 15, color: "var(--text-bright)", fontWeight: 600, marginBottom: 8 }}>
          “{req.fileName}” is password-protected
        </div>
        {req.isRetry && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>That password didn't work. One more try.</div>}
        <input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="PDF password" style={inp} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={skip} style={ghostBtn}>Skip this file</button>
          <button onClick={submit} disabled={!pw} style={{ ...primaryBtn, opacity: pw ? 1 : 0.5 }}>Unlock PDF</button>
        </div>
      </div>
    </div>
  );
}

function RangePrompt({ req, onClose }) {
  const [range, setRange] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const pages = parsePageRange(range, req.pageCount);
    if (!pages) { setErr("Use page numbers like 1-5 or 2, 7, 9."); return; }
    req.resolve(pages); onClose();
  };
  return (
    <div style={modalWrap}>
      <div role="dialog" aria-modal="true" aria-label="Choose pages" style={modalCard}>
        <div style={{ fontSize: 15, color: "var(--text-bright)", fontWeight: 600, marginBottom: 8 }}>
          This looks like a scanned document. Choose the pages that matter most
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
          “{req.fileName}” has {req.pageCount} pages; scanned documents are read up to {SCANNED_PDF_FALLBACK_PAGE_CAP} pages at a time.
        </p>
        <input autoFocus value={range} onChange={e => { setRange(e.target.value); setErr(""); }}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. 1-10, or 1, 4, 12" style={inp} />
        {err && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={() => { req.resolve(null); onClose(); }} style={ghostBtn}>Skip this file</button>
          <button onClick={submit} style={primaryBtn}>Read these pages</button>
        </div>
      </div>
    </div>
  );
}
