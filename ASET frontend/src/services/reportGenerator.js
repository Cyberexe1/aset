import { jsPDF } from "jspdf";

const C = {
  bg: [255, 255, 255],
  textPrimary: [30, 41, 59],      // Slate 800
  textSecondary: [71, 85, 105],   // Slate 600
  textMuted: [148, 163, 184],     // Slate 400
  border: [226, 232, 240],        // Slate 200
  accent: [15, 118, 110],         // Teal 700
  supported: [16, 185, 129],      // Emerald 500
  contradicted: [239, 68, 68],    // Red 500
  inconclusive: [245, 158, 11],   // Amber 500
  unverifiable: [148, 163, 184],  // Slate 400
};

function getVerdictColor(verdict) {
  const v = (verdict || "").toLowerCase();
  if (v.includes("contradict")) return C.contradicted;
  if (v.includes("inconclusive")) return C.inconclusive;
  if (v.includes("supported")) return C.supported;
  return C.unverifiable;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchClaim(flatWords, claim) {
  const cw = claim.split(/\s+/).filter(Boolean);
  const cn = cw.map(normalize);
  const wn = cw.length;
  if (!wn) return null;

  let best = 0, bestI = -1;
  for (let i = 0; i <= flatWords.length - wn; i++) {
    let hits = 0;
    for (let j = 0; j < wn; j++) {
      if (normalize(flatWords[i + j]) === cn[j]) hits++;
    }
    const sc = hits / wn;
    if (sc > best) { best = sc; bestI = i; }
  }
  return best >= 0.48 ? { start: bestI, end: bestI + wn } : null;
}

function buildHighlightMap(flatWords, claims) {
  const map = {};
  if (!claims) return map;
  claims.forEach((item, ci) => {
    const m = matchClaim(flatWords, item.claim);
    if (!m) return;
    const color = getVerdictColor(item.verdict);
    for (let i = m.start; i < m.end; i++) {
      if (!map[i]) map[i] = { color, idx: ci + 1 };
    }
  });
  return map;
}

function drawRing(doc, cx, cy, r, score, color) {
  const steps = 60;
  const s0 = -Math.PI / 2;
  const s1 = s0 + (score / 100) * 2 * Math.PI;

  doc.setDrawColor(...C.border);
  doc.setLineWidth(3.5);
  doc.circle(cx, cy, r, "S");

  doc.setDrawColor(...color);
  doc.setLineWidth(3.5);
  for (let i = 0; i < steps; i++) {
    const a1 = s0 + (i / steps) * (s1 - s0);
    const a2 = s0 + ((i + 1) / steps) * (s1 - s0);
    doc.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1),
             cx + r * Math.cos(a2), cy + r * Math.sin(a2));
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...color);
  doc.text(`${score}%`, cx, cy + 1.5, { align: "center", baseline: "middle" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...C.textMuted);
  doc.text("TRUST SCORE", cx, cy + 6, { align: "center", baseline: "middle" });
}

export function generateVerificationReport(result) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  buildReport(doc, result);
  const safeName = (result.filename || result.videoId || "report").replace(/[^a-z0-9]/gi, "_").substring(0, 40);
  doc.save(`ASET_Report_${safeName}_${Date.now()}.pdf`);
}

export function generateVerificationReportBlob(result) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  buildReport(doc, result);
  return doc.output("blob");
}

function buildReport(doc, result) {
  const PW = 210, PH = 297;
  const ML = 20, MR = 20, MT = 25, MB = 25;
  const CW = PW - ML - MR;
  let y = MT + 12; // Start content below the header
  let pageNum = 1;

  const generatedAt = new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  const drawHeader = () => {
    // Left accent bar
    doc.setFillColor(...C.accent);
    doc.rect(0, 0, 4, 25, "F");

    // Logo dots
    const dots = [
      [0,0,0,1,2,3],[0,0,1,1,2,2],[0,0,1,1,2,2],
      [0,1,1,1,2,2],[0,1,1,0,0,0],[0,0,0,0,0,0],
    ];
    dots.forEach((row, ri) => row.forEach((val, ci) => {
      if (!val) return;
      const color = val === 3 ? C.accent : val === 2 ? [20, 184, 166] : C.textMuted;
      doc.setFillColor(...color);
      doc.circle(ML + ci * 2.3, 8 + ri * 2.3, 1.5 * (val / 3), "F");
    }));

    // ASET wordmark
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...C.textPrimary);
    doc.text("ASET", ML + 18, 8, { baseline: "top" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text("Academic Safety & Evidencing Truth", ML + 18, 14, { baseline: "top" });

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(ML, 25, PW - MR, 25);
  };

  const drawFooter = () => {
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(ML, PH - MB + 5, PW - MR, PH - MB + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text(`Generated: ${generatedAt}`, ML, PH - MB + 8, { baseline: "top" });
    doc.text(`Page ${pageNum}`, PW - MR, PH - MB + 8, { align: "right", baseline: "top" });
  };

  const checkBreak = (h) => {
    if (y + h > PH - MB) {
      drawFooter();
      doc.addPage();
      pageNum++;
      drawHeader();
      y = MT + 12; // Reset content below the header on new pages
      return true;
    }
    return false;
  };

  // Start building
  drawHeader();

  // COVER PAGE / SUMMARY
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...C.textPrimary);
  const titleStr = result.filename || result.videoId || "Verification Report";
  
  // Reserve space on the right for the graph
  const maxTitleW = CW - 50;
  const title = doc.splitTextToSize(titleStr, maxTitleW);
  doc.text(title, ML, y, { baseline: "top" });
  
  // Draw Graph on the right
  const score = result.overallTrustScore || 0;
  let scoreColor;
  if (score >= 70) scoreColor = C.supported;
  else if (score >= 40) scoreColor = C.inconclusive;
  else scoreColor = C.contradicted;
  
  drawRing(doc, PW - MR - 20, y + 16, 15, score, scoreColor);
  
  y += Math.max(title.length * 9, 32) + 8;

  // Stats
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C.textSecondary);
  doc.text(`Total Claims Identified: ${result.totalClaims || 0}`, ML, y, { baseline: "top" });
  y += 6;
  
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...scoreColor);
  doc.text(`Overall Trust Score: ${score}%`, ML, y, { baseline: "top" });
  y += 14;

  // CLAIMS SECTION
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.textPrimary);
  doc.text("Verified Claims", ML, y, { baseline: "top" });
  y += 6;
  
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.5);
  doc.line(ML, y, ML + 35, y);
  y += 8;

  if (result.verifiedClaims && result.verifiedClaims.length > 0) {
    result.verifiedClaims.forEach((item, idx) => {
      // Pre-calculate heights and text
      const indexText = `#${idx + 1}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const indexW = doc.getTextWidth(indexText);
      
      const verdictStr = `${item.verdict || "Unverifiable"} ${item.score ? item.score + '%' : ''}`;
      doc.setFontSize(8);
      const verdictW = doc.getTextWidth(verdictStr);
      
      const claimX = ML + indexW + 4;
      const claimW = (PW - MR - verdictW - 10) - claimX;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const claimLines = doc.splitTextToSize(item.claim, claimW);
      
      const claimH = claimLines.length * 4.5;
      const rowH = Math.max(claimH, 8); // Ensure minimum height
      
      // Check for page break BEFORE drawing the row
      checkBreak(rowH + 10);
      
      // Draw Index
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...C.textPrimary);
      doc.text(indexText, ML, y, { baseline: "top" });
      
      // Draw Verdict Badge
      const vColor = getVerdictColor(item.verdict);
      doc.setFillColor(...vColor);
      doc.roundedRect(PW - MR - verdictW - 6, y - 1, verdictW + 6, 6, 1, 1, "F");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(verdictStr, PW - MR - verdictW - 3, y + 0.5, { baseline: "top" });

      // Draw Claim Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...C.textSecondary);
      doc.text(claimLines, claimX, y, { baseline: "top" });
      
      y += rowH + 4;
      
      // Separator line
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(ML, y, PW - MR, y);
      y += 6;
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...C.textMuted);
    doc.text("No claims could be verified in this document.", ML, y, { baseline: "top" });
    y += 10;
  }

  y += 8;

  // ANNOTATED DOCUMENT
  checkBreak(30); // Need at least 30mm for the section header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.textPrimary);
  doc.text("Annotated Document", ML, y, { baseline: "top" });
  y += 6;
  
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.5);
  doc.line(ML, y, ML + 45, y);
  y += 8;

  const fullText = (result.extractedText || (result.verifiedClaims || []).map(c => c.claim).join("\n\n"))
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const tokens = [];
  fullText.split(/\n+/).forEach((para, pi) => {
    if (pi > 0) tokens.push({ word: "", isBreak: true });
    para.split(/\s+/).filter(Boolean).forEach(w => tokens.push({ word: w, isBreak: false }));
  });

  const flatWords = tokens.filter(t => !t.isBreak).map(t => t.word);
  const hlMap = buildHighlightMap(flatWords, result.verifiedClaims);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const LH = 5.5; // Line height
  const SPW = doc.getTextWidth(" "); // Exact space width
  let x = ML;
  let wordIdx = 0;

  tokens.forEach(token => {
    if (token.isBreak) {
      y += LH * 1.5; // Paragraph spacing
      x = ML;
      checkBreak(LH * 2);
      return;
    }

    const word = token.word;
    const hl = hlMap[wordIdx];
    const ww = doc.getTextWidth(word);

    // Line wrapping logic
    if (x + ww > PW - MR) {
      y += LH;
      x = ML;
      checkBreak(LH * 2);
    }

    // Draw Highlight Background
    if (hl) {
      doc.setFillColor(...hl.color);
      doc.setGState(new doc.GState({ opacity: 0.15 }));
      doc.roundedRect(x - 0.5, y - 0.5, ww + 1, LH - 0.5, 0.5, 0.5, "F");
      doc.setGState(new doc.GState({ opacity: 1 }));
    }

    // Draw Word Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (hl) {
      // Darken text color for better contrast on highlight
      doc.setTextColor(Math.max(0, hl.color[0] - 60), Math.max(0, hl.color[1] - 60), Math.max(0, hl.color[2] - 60));
    } else {
      doc.setTextColor(...C.textPrimary);
    }
    doc.text(word, x, y, { baseline: "top" });

    // Draw Index Badge
    const nextHl = hlMap[wordIdx + 1];
    if (hl && (!nextHl || nextHl.idx !== hl.idx)) {
      const bx = x + ww + 1;
      const by = y - 1.5;
      doc.setFillColor(...hl.color);
      doc.roundedRect(bx, by, 4.5, 3.5, 0.5, 0.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.text(String(hl.idx), bx + 2.25, by + 1.75, { align: "center", baseline: "middle" });
      doc.setFontSize(10);
      x += 5.5; // Add space after the badge
    }

    x += ww + SPW;
    wordIdx++;
  });

  // Render final footer if on the last page
  drawFooter();
}
