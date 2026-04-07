import React from "react";
import { exportFile } from "../cad/workerClient.js";
import type { BaseType } from "../cad/bases/base.js";

interface Props {
  onEnsureRendered: () => Promise<void>;
  baseType: BaseType;
  width: number;
  spec: string;
}

/**
 * Build a descriptive filename from the label configuration.
 *
 * Format: {base}[-{width}u]-{spec}.{ext}
 * e.g.  "pred-3u-M5_nut.stl", "plain-Hello_World.step"
 */
function makeFilename(
  baseType: BaseType,
  width: number,
  spec: string,
  ext: string,
): string {
  // Bases that use a meaningful width parameter
  const hasWidth = baseType === "pred" || baseType === "predbox" || baseType === "modern";

  // Sanitise spec: strip fragment braces but keep content, collapse whitespace
  const label = spec
    .replace(/\{[|]?\}/g, "_")        // column dividers → underscore
    .replace(/[{}]/g, "")              // drop remaining braces
    .replace(/[<>]/g, "")             // drop alignment markers
    .replace(/\.\.\./g, "")           // drop spacer ellipsis
    .replace(/[/\\:*?"<>|]+/g, "_")   // filesystem-unsafe chars
    .replace(/\s+/g, "_")             // whitespace → underscore
    .replace(/_+/g, "_")              // collapse multiple underscores
    .replace(/^_|_$/g, "");           // trim leading/trailing underscores

  const parts: string[] = [baseType];
  if (hasWidth) parts.push(`${width}u`);
  if (label) parts.push(label);

  const stem = parts.join("-").slice(0, 80); // cap length
  return `${stem}.${ext}`;
}

export function DownloadButtons({ onEnsureRendered, baseType, width, spec }: Props) {
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async (format: "stl" | "step" | "svg") => {
    setExporting(true);
    try {
      await onEnsureRendered();
      const file = await exportFile(format);
      const filename = makeFilename(baseType, width, spec, format);
      const blob = new Blob([file.buffer], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const btnStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px 12px",
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    borderRadius: 4,
    cursor: exporting ? "not-allowed" : "pointer",
    fontSize: 13,
    opacity: exporting ? 0.5 : 1,
  };

  return (
    <div>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
        Export
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("stl")}
        >
          STL
        </button>
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("step")}
        >
          STEP
        </button>
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("svg")}
        >
          SVG
        </button>
      </div>
    </div>
  );
}
