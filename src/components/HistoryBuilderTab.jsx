// History Builder UI (HISTORY_BUILDER_SPEC v1.1). One prompt card at a time,
// five areas, staged one-by-one review, attestations, gating per the existing
// extraction mode. All copy verbatim from spec section 11 via HB_COPY.
// No completeness percentage, progress bar, or fraction anywhere.
import { useMemo, useState } from "react";
import { HB_COPY } from "../config/historyBuilderCopy.js";
import {
  loadHbState, saveHbState, loadAttestations, setAttestation, readStores,
  computeGaps, computeReadiness, freshnessAges, rankPrompt, recordDismissal,
  getSessionId, pickUploadCopy, coordinatorPhonePresent,
} from "../lib/historyBuilder.js";
import { listStagedItems, acceptStagedItem, rejectStagedItem, proposeMedConditionMatch } from "../lib/stagedItems.js";
import { EXTRACTION_MODE } from "../lib/extraction.js";
import medConditionMap from "../config/medConditionMap.json";

const mono = "'DM Mono',monospace";
const card = { background: "#0b1220", border: "1px solid #111e30", borderRadius: 12, padding: "14px 16px", marginBottom: 12 };
const btn = { padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "'Sora',sans-serif", background: "rgba(79,142,247,.12)", border: "1px solid rgba(79,142,247,.3)", color: "#7eb8d8" };
const btnGhost = { ...btn, background: "transparent", border: "1px solid #1a2f4a", color: "#b0c4d8" };
const label = { fontSize: 10, color: "#a0b4c8", fontFamily: mono, letterSpacing: "0.8px", textTransform: "uppercase" };

function fmtDate(d) {
  const x = new Date(String(d) + "T12:00:00");
  return isNaN(x) ? String(d) : x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The single dismissible prompt card. Rendered on the builder home and
 *  mounted once on the Dashboard. */
export function HbPromptCard({ onOpenBuilder, refresh }) {
  const [, force] = useState(0);
  const sessionId = getSessionId();
  const stores = readStores();
  const attestations = loadAttestations();
  const hb = loadHbState();
  const pick = rankPrompt({ stores, attestations, hb, sessionId });
  if (!pick) return null;
  const c = HB_COPY[pick.promptId] || {};
  const suffix = pick.suffixId ? (HB_COPY[pick.suffixId]?.suffix || "") : "";
  const c16 = pick.suffixId === "C-16" && pick.c16Date ? HB_COPY["C-16"].suffix.replace("{date}", fmtDate(pick.c16Date)) : "";
  const sub = [c.sub, pick.suffixId === "C-16" ? c16 : suffix].filter(Boolean).join(" ");
  return (
    <div style={{ ...card, border: "1px solid rgba(79,142,247,.25)", background: "rgba(79,142,247,.05)" }}>
      <div style={{ ...label, color: "#4f8ef7", marginBottom: 6 }}>Next step</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#dde8f5", marginBottom: 3 }}>{c.title || c.text}</div>
      {sub && <div style={{ fontSize: 12, color: "#a8c4dc", marginBottom: 10 }}>{sub}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn} onClick={() => onOpenBuilder(pick.promptId)}>Open</button>
        <button style={btnGhost} onClick={() => { recordDismissal(pick.promptId, sessionId); (refresh || (() => force(x => x + 1)))(); }}>
          {HB_COPY["C-15"].button}
        </button>
      </div>
    </div>
  );
}

function ImportAffordances({ onNav, typeTarget }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      <button style={btnGhost} onClick={() => onNav("documents")}>{HB_COPY["C-17a"].button}</button>
      <button style={btnGhost} onClick={() => onNav("documents")}>{HB_COPY["C-17b"].button}</button>
      <button style={btnGhost} onClick={() => onNav(typeTarget)}>{HB_COPY["C-17c"].button}</button>
    </div>
  );
}

export default function HistoryBuilderTab({ onNavChange } = {}) {
  const onNav = (id) => { if (id && typeof onNavChange === "function") onNavChange(id); };
  const [tick, force] = useState(0);
  const refresh = () => force(x => x + 1);
  const sessionId = getSessionId();
  const stores = readStores();
  const attestations = loadAttestations();
  const hb = loadHbState();
  const readiness = computeReadiness(stores, attestations);
  const gaps = computeGaps(stores, attestations, hb);
  const ages = freshnessAges(stores);
  const staged = listStagedItems("proposed");

  // Session-start med-to-condition evaluation: at most one C-11 per session.
  const lookupProposal = useMemo(() => {
    try {
      if (sessionStorage.getItem("hb_lookup_done")) return null;
      sessionStorage.setItem("hb_lookup_done", "1");
      return proposeMedConditionMatch(stores.meds, stores.conditions, medConditionMap.mappings);
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time Emergency Packet ready card on the false-to-true transition.
  const showReadyCard = readiness.emergencyPacket && !hb.emergencyReadyShownAt;
  const softCoordinator = readiness.emergencyPacket && !coordinatorPhonePresent(stores);

  const uploadCopyId = pickUploadCopy(EXTRACTION_MODE);
  const upcoming = (stores.appointments || []).filter(a => a?.status === "upcoming")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const area = (title, body) => (
    <div key={title} style={card}>
      <div style={{ ...label, marginBottom: 8 }}>{title}</div>
      {body}
    </div>
  );
  const gapLine = (id) => {
    const g = HB_COPY[id];
    return <div style={{ fontSize: 12, color: "#a8c4dc", marginBottom: 4 }}>{g.title || g.text}</div>;
  };
  const has = (id) => gaps.some(g => g.promptId === id);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px", fontFamily: "'Sora',sans-serif" }} data-tick={tick}>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: "#dde8f5", marginBottom: 4 }}>History Builder</div>
      <div style={{ fontSize: 11, color: "#7eb8d8", fontFamily: mono, marginBottom: 16 }}>
        One useful next step at a time. Reports unlock as their pieces are in place.
      </div>

      {showReadyCard && (
        <div style={{ ...card, border: "1px solid rgba(16,185,129,.35)", background: "rgba(16,185,129,.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#10b981", marginBottom: 4 }}>{HB_COPY["C-08"].title}</div>
          <div style={{ fontSize: 12, color: "#a8c4dc", marginBottom: 10 }}>{HB_COPY["C-08"].body}</div>
          <button style={btnGhost} onClick={() => { saveHbState({ emergencyReadyShownAt: new Date().toISOString() }); refresh(); }}>OK</button>
        </div>
      )}
      {softCoordinator && !showReadyCard && (
        <div style={{ fontSize: 11, color: "#a0b4c8", fontFamily: mono, marginBottom: 12 }}>{HB_COPY["C-07"].text}</div>
      )}

      <HbPromptCard onOpenBuilder={() => {}} refresh={refresh} />

      {(lookupProposal || staged.length > 0) && (
        <div style={{ ...card, border: "1px solid rgba(245,158,11,.3)" }}>
          <div style={{ ...label, color: "#f59e0b", marginBottom: 8 }}>Review one by one</div>
          {listStagedItems("proposed").map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: "#c4d8ee" }}>
                {item.source === "lookup"
                  ? HB_COPY["C-11"].text.replace("{medication}", item.payload.medication).replace("{condition}", item.payload.name)
                  : `${item.type}: ${item.payload?.name || item.payload?.title || ""}`}
              </div>
              <button style={btn} onClick={() => { acceptStagedItem(item.id); refresh(); }}>
                {item.source === "lookup" ? HB_COPY["C-11"].add : HB_COPY["C-22"].add}
              </button>
              <button style={btnGhost} onClick={() => { rejectStagedItem(item.id); refresh(); }}>
                {item.source === "lookup" ? HB_COPY["C-11"].no : HB_COPY["C-22"].skip}
              </button>
            </div>
          ))}
        </div>
      )}

      {hb.goal === "appointment" && !hb.targetAppointmentId && (
        <div style={{ ...card, border: "1px solid rgba(79,142,247,.25)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#dde8f5" }}>{HB_COPY["C-28"].title}</div>
          <div style={{ fontSize: 11, color: "#a8c4dc", marginBottom: 8 }}>{HB_COPY["C-28"].sub}</div>
          {upcoming.map(a => (
            <button key={a.id} style={{ ...btnGhost, display: "block", width: "100%", textAlign: "left", marginBottom: 6 }}
              onClick={() => { saveHbState({ targetAppointmentId: a.id }); refresh(); }}>
              {fmtDate(a.date)}: {a.title} {a.provider ? `(${a.provider})` : ""}
            </button>
          ))}
          <button style={btn} onClick={() => onNav("appointments")}>Add an appointment</button>
        </div>
      )}

      {area("Current Health", (
        <div>
          {has("C-01") && gapLine("C-01")}
          {!has("C-01") && !attestations.medsCompleteAt && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#c4d8ee", marginBottom: 6 }}>{HB_COPY["C-02"].text}</div>
              <button style={btn} onClick={() => { setAttestation("medsCompleteAt"); refresh(); }}>{HB_COPY["C-02"].yes}</button>{" "}
              <button style={btnGhost} onClick={() => onNav("medications")}>{HB_COPY["C-02"].no}</button>
            </div>
          )}
          {has("C-03") && (
            <div style={{ marginBottom: 8 }}>
              {gapLine("C-03")}
              {(stores.allergies || []).length === 0
                ? <button style={btnGhost} onClick={() => { setAttestation("allergiesResolvedAt"); refresh(); }}>{HB_COPY["C-03"].emptyButton}</button>
                : <button style={btn} onClick={() => { setAttestation("allergiesResolvedAt"); refresh(); }}>Confirm allergies</button>}
            </div>
          )}
          {has("C-04") && gapLine("C-04")}
          {has("C-05") && (
            <div style={{ marginBottom: 8 }}>
              {gapLine("C-05")}
              <button style={btn} onClick={() => { setAttestation("conditionsReviewedAt"); refresh(); }}>Confirm conditions</button>
            </div>
          )}
          {has("C-06") && gapLine("C-06")}
          {has("C-09a") && gapLine("C-09a")}
          {has("C-10") && gapLine("C-10")}
          {ages.troughAgeDays != null && (
            <div style={{ fontSize: 12, color: "#8299ad", fontFamily: mono }}>{HB_COPY["C-23"].text.replace("{n}", String(ages.troughAgeDays))}</div>
          )}
          <ImportAffordances onNav={onNav} typeTarget="medications" />
        </div>
      ))}

      {area("Recent Care", (
        <div>
          {has("C-09b") && gapLine("C-09b")}
          <div style={{ fontSize: 11, color: "#7c92a6" }}>Labs before notes. Recent troughs, liver panels, then encounters and imaging.</div>
          <ImportAffordances onNav={onNav} typeTarget="labs" />
        </div>
      ))}

      {area("Transplant History", (
        <div>
          {has("C-18") && gapLine("C-18")}
          {!hb.s4Covered && gapLine("C-19")}
          {!hb.s4Covered && (
            <button style={btnGhost} onClick={() => { saveHbState({ s4Covered: true }); refresh(); }}>{HB_COPY["C-14"].button}</button>
          )}
          <ImportAffordances onNav={onNav} typeTarget="surgeries" />
        </div>
      ))}

      {area("Important Past History", (
        <div>
          {has("C-20") && gapLine("C-20")}
          <ImportAffordances onNav={onNav} typeTarget="records" />
        </div>
      ))}

      {area("Older Records", (
        <div>
          <div style={{ fontSize: 11, color: "#7c92a6", borderTop: "1px dashed #1a2f4a", paddingTop: 8 }}>{HB_COPY["C-21"].header}</div>
          <div style={{ fontSize: 11, color: "#a8c4dc", marginTop: 8 }}>{HB_COPY[uploadCopyId].text}</div>
          {uploadCopyId === "C-12" && (
            <div style={{ marginTop: 6 }}>
              <button style={btn} onClick={() => { /* opens staged review; extraction wiring is out of scope for WO 01 */ }}>{HB_COPY["C-12"].review}</button>{" "}
              <button style={btnGhost}>{HB_COPY["C-12"].notNow}</button>
            </div>
          )}
          <ImportAffordances onNav={onNav} typeTarget="documents" />
        </div>
      ))}
    </div>
  );
}
