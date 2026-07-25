import React from "react";
import { batchExport, type BatchFormat, type BatchMode } from "../cad/workerClient.js";
import { parseCSV, extractPlaceholders, type ParsedCsv } from "../cad/batch.js";
import { LabelStyle, FontStyle } from "../cad/options.js";
import type { BaseConfig, BaseType } from "../cad/bases/base.js";

interface Props {
  onClose: () => void;
  baseType: BaseType;
  width: number;
  height?: number;
  version?: string;
  depth: number;
  labelDepth: number;
  style: LabelStyle;
  font: string;
  /** Current label spec — used as the initial template. */
  initialTemplate: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const FORMATS: { value: BatchFormat; label: string }[] = [
  { value: "3mf", label: "3MF (multicolore)" },
  { value: "stl", label: "STL" },
  { value: "step", label: "STEP" },
  { value: "svg", label: "SVG" },
];

export function BatchPanel({
  onClose,
  baseType,
  width,
  height,
  version,
  depth,
  labelDepth,
  style,
  font,
  initialTemplate,
}: Props) {
  const [template, setTemplate] = React.useState(initialTemplate);
  const [csvText, setCsvText] = React.useState("");
  const [format, setFormat] = React.useState<BatchFormat>("3mf");
  const [mode, setMode] = React.useState<BatchMode>("individual");
  const [baseColor, setBaseColor] = React.useState("#9aa0a6");
  const [textColor, setTextColor] = React.useState("#1a1a1a");
  const [gapMm, setGapMm] = React.useState(2);
  const [columns, setColumns] = React.useState<number>(0);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const parsed: ParsedCsv = React.useMemo(() => {
    try {
      return parseCSV(csvText);
    } catch {
      return { headers: [], rows: [] };
    }
  }, [csvText]);

  const placeholders = React.useMemo(() => extractPlaceholders(template), [template]);
  const missingColumns = placeholders.filter((p) => !parsed.headers.includes(p));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
  };

  const handleGenerate = async () => {
    if (parsed.rows.length === 0) {
      setError("Aucune ligne de données. Collez ou importez un CSV avec une ligne d'en-têtes.");
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ done: 0, total: parsed.rows.length });
    try {
      const base: BaseConfig = { baseType, width, height, depth, labelDepth, version };
      const options = { font: { font, fontStyle: FontStyle.REGULAR, fontHeightExact: true } };
      const file = await batchExport(
        {
          template,
          rows: parsed.rows,
          base,
          style,
          options,
          format,
          mode,
          colors: { base: hexToRgb(baseColor), label: hexToRgb(textColor) },
          gapMm,
          columns: columns > 0 ? columns : undefined,
        },
        (done, total) => setProgress({ done, total }),
      );
      const blob = new Blob([file.buffer], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const previewRows = parsed.rows.slice(0, 5);
  const is3mf = format === "3mf";
  const isCombined = mode === "combined";

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#374151" };
  const fieldRow: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 10,
          width: 640,
          maxWidth: "92vw",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
          boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Génération en masse</h2>
          <button
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          Chaque ligne du CSV devient une étiquette. Utilisez <code>{"{{colonne}}"}</code> dans le
          template pour insérer les valeurs (la 1re ligne du CSV = les noms de colonnes).
        </p>

        {/* Template */}
        <div>
          <label style={labelStyle}>Template</label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", padding: 8, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
          />
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {placeholders.length > 0 ? (
              <>Variables : {placeholders.map((p) => <code key={p} style={{ marginRight: 6 }}>{`{{${p}}}`}</code>)}</>
            ) : (
              <>Aucune variable <code>{"{{…}}"}</code> détectée — toutes les étiquettes seraient identiques.</>
            )}
          </div>
        </div>

        {/* CSV */}
        <div>
          <label style={labelStyle}>Données CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ fontSize: 12, marginBottom: 6 }} />
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={4}
            placeholder={"taille,ref\nM3,Vis tête hex\nM4,Écrou nylstop"}
            style={{ width: "100%", boxSizing: "border-box", padding: 8, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
          />
          {parsed.rows.length > 0 && (
            <div style={{ marginTop: 8, overflowX: "auto" }}>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                {parsed.rows.length} ligne(s) · colonnes : {parsed.headers.join(", ")}
              </div>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>{parsed.headers.map((h) => <th key={h} style={cellStyle(true)}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}>{parsed.headers.map((h) => <td key={h} style={cellStyle(false)}>{r[h]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > previewRows.length && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>… +{parsed.rows.length - previewRows.length} autres</div>
              )}
            </div>
          )}
          {missingColumns.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#b45309" }}>
              ⚠ Variables sans colonne correspondante (seront vides) : {missingColumns.join(", ")}
            </div>
          )}
        </div>

        {/* Format + mode */}
        <div style={fieldRow}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as BatchFormat)} style={{ width: "100%", padding: "6px 8px" }}>
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Sortie</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as BatchMode)} style={{ width: "100%", padding: "6px 8px" }}>
              <option value="individual">Fichiers individuels (.zip)</option>
              <option value="combined">Planche combinée (fichier unique)</option>
            </select>
          </div>
        </div>

        {/* 3MF colours */}
        {is3mf && (
          <div>
            <div style={fieldRow}>
              <div>
                <label style={labelStyle}>Couleur base</label>
                <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} style={{ width: 60, height: 32 }} />
              </div>
              <div>
                <label style={labelStyle}>Couleur texte</label>
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} style={{ width: 60, height: 32 }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Le 3MF sépare la base et le texte en deux corps colorés à assigner aux filaments — sans peinture.
              {style === LabelStyle.DEBOSSED && (
                <span style={{ color: "#b45309" }}> Le style « debossed » creuse le texte (pas de corps texte à colorer) : préférez « embedded » ou « embossed ».</span>
              )}
            </div>
          </div>
        )}

        {/* Combined layout */}
        {isCombined && (
          <div style={fieldRow}>
            <div>
              <label style={labelStyle}>Écart (mm)</label>
              <input type="number" min={0} step={0.5} value={gapMm} onChange={(e) => setGapMm(Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 80, padding: "6px 8px" }} />
            </div>
            <div>
              <label style={labelStyle}>Colonnes (0 = auto)</label>
              <input type="number" min={0} step={1} value={columns} onChange={(e) => setColumns(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ width: 80, padding: "6px 8px" }} />
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: "#dc2626" }}>{error}</div>}

        {/* Progress */}
        {progress && (
          <div>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
              Rendu {progress.done} / {progress.total}…
            </div>
            <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: "#2563eb", transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "10px 16px", border: "1px solid #d1d5db", background: "#f9fafb", borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", fontSize: 14 }}>
            Fermer
          </button>
          <button
            onClick={handleGenerate}
            disabled={busy || parsed.rows.length === 0}
            style={{
              padding: "10px 20px",
              border: "none",
              background: busy || parsed.rows.length === 0 ? "#94a3b8" : "#2563eb",
              color: "#fff",
              borderRadius: 6,
              cursor: busy || parsed.rows.length === 0 ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {busy ? "Génération…" : `Générer ${parsed.rows.length || ""} étiquette(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function cellStyle(header: boolean): React.CSSProperties {
  return {
    border: "1px solid #e5e7eb",
    padding: "3px 8px",
    textAlign: "left",
    background: header ? "#f3f4f6" : "#fff",
    fontWeight: header ? 600 : 400,
    whiteSpace: "nowrap",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}
