 ```diff
--- a/frontend/src/utils/diagnosticMetadata.ts
+++ b/frontend/src/utils/diagnosticMetadata.ts
@@ -1,12 +1,14 @@
 /**
- * Diagnostic metadata parser and viewer utilities.
+ * Diagnostic metadata parser, viewer, and comparison utilities.
  *
  * Handles the `build-<commit>-metadata.json` files produced by `build.py`.
  */
 
 export interface ArtifactInfo {
   path: string;
-  size: number;
+  size: number;
+  /** SHA-256 hash when available, used for change detection. */
+  hash?: string;
 }
 
 export interface ModuleResult {
@@ -15,6 +17,8 @@
   success: boolean;
   artifacts: ArtifactInfo[];
   durationMs: number;
+  /** Optional error message when success is false. */
+  error?: string;
 }
 
 export interface DiagnosticMetadata {
@@ -25,6 +29,8 @@
   commit: string;
   modules: ModuleResult[];
   encryptedLogPath: string;
+  /** Total artifact count across all modules. */
+  totalArtifacts: number;
 }
 
 /**
@@ -33,7 +39,7 @@
 export function parseDiagnosticMetadata(json: string): DiagnosticMetadata {
   const raw = JSON.parse(json);
 
-  // Normalise field names in case future build.py versions change casing.
+  // Normalise field names in case future build.py versions change casing.
   const modules: ModuleResult[] = (raw.modules ?? []).map((m: any) => ({
     name: m.name ?? m.moduleName ?? "unknown",
     language: m.language ?? "unknown",
@@ -41,6 +47,7 @@
     artifacts: (m.artifacts ?? []).map((a: any) => ({
       path: a.path ?? a.artifactPath ?? "",
       size: a.size ?? a.sizeBytes ?? 0,
+      hash: a.hash ?? undefined,
     })),
     durationMs: m.durationMs ?? m.duration_ms ?? 0,
   }));
@@ -51,5 +58,148 @@
     commit: raw.commit ?? raw.commitId ?? "unknown",
     modules,
     encryptedLogPath: raw.encryptedLogPath ?? raw.log_path ?? "",
+    totalArtifacts: modules.reduce((sum, m) => sum + m.artifacts.length, 0),
   };
 }
+
+// ---------------------------------------------------------------------------
+// Comparison types
+// ---------------------------------------------------------------------------
+
+export type ModuleStatus =
+  | "added"
+  | "removed"
+  | "changed"
+  | "failed"
+  | "recovered"
+  | "unchanged";
+
+export interface ModuleComparison {
+  name: string;
+  status: ModuleStatus;
+  baseline?: ModuleResult;
+  candidate?: ModuleResult;
+  /** Human-readable description of what changed. */
+  changeDescription: string;
+  /** Artifact-level diffs: path -> { baselineSize, candidateSize, changed } */
+  artifactDiffs: Record<
+    string,
+    { baselineSize: number; candidateSize: number; changed: boolean }
+  >;
+}
+
+export interface DiagnosticComparison {
+  baselineCommit: string;
+  candidateCommit: string;
+  modules: ModuleComparison[];
+  summary: {
+    added: number;
+    removed: number;
+    changed: number;
+    failed: number;
+    recovered: number;
+    unchanged: number;
+  };
+}
+
+/**
+ * Compare two diagnostic metadata objects and return a deterministic diff.
+ */
+export function compareDiagnostics(
+  baseline: DiagnosticMetadata,
+  candidate: DiagnosticMetadata
+): DiagnosticComparison {
+  const baselineMap = new Map(baseline.modules.map((m) => [m.name, m]));
+  const candidateMap = new Map(candidate.modules.map((m) => [m.name, m]));
+
+  const allNames = Array.from(
+    new Set([...baselineMap.keys(), ...candidateMap.keys()])
+  ).sort();
+
+  const modules: ModuleComparison[] = allNames.map((name) => {
+    const b = baselineMap.get(name);
+    const c = candidateMap.get(name);
+
+    if (!b) {
+      // Added in candidate
+      return {
+        name,
+        status: "added",
+        candidate: c,
+        changeDescription: `Module ${name} added in candidate build.`,
+        artifactDiffs: buildArtifactDiff(undefined, c!),
+      };
+    }
+
+    if (!c) {
+      // Removed in candidate
+      return {
+        name,
+        status: "removed",
+        baseline: b,
+        changeDescription: `Module ${name} removed in candidate build.`,
+        artifactDiffs: buildArtifactDiff(b, undefined),
+      };
+    }
+
+    const artifactDiffs = buildArtifactDiff(b, c);
+    const artifactsChanged = Object.values(artifactDiffs).some((d) => d.changed);
+
+    let status: ModuleStatus = "unchanged";
+    let changeDescription = `Module ${name} unchanged.`;
+
+    if (!b.success && c.success) {
+      status = "recovered";
+      changeDescription = `Module ${name} recovered: build now passes.`;
+    } else if (b.success && !c.success) {
+      status = "failed";
+      changeDescription = `Module ${name} newly failed: build now fails.`;
+    } else if (artifactsChanged || b.durationMs !== c.durationMs) {
+      status = "changed";
+      changeDescription = `Module ${name} changed: artifacts or duration differ.`;
+    }
+
+    return {
+      name,
+      status,
+      baseline: b,
+      candidate: c,
+      changeDescription,
+      artifactDiffs,
+    };
+  });
+
+  const summary = {
+    added: modules.filter((m) => m.status === "added").length,
+    removed: modules.filter((m) => m.status === "removed").length,
+    changed: modules.filter((m) => m.status === "changed").length,
+    failed: modules.filter((m) => m.status === "failed").length,
+    recovered: modules.filter((m) => m.status === "recovered").length,
+    unchanged: modules.filter((m) => m.status === "unchanged").length,
+  };
+
+  return {
+    baselineCommit: baseline.commit,
+    candidateCommit: candidate.commit,
+    modules,
+    summary,
+  };
+}
+
+function buildArtifactDiff(
+  baseline: ModuleResult | undefined,
+  candidate: ModuleResult | undefined
+): Record<string, { baselineSize: number; candidateSize: number; changed: boolean }> {
+  const baselineArtifacts = new Map(baseline?.artifacts.map((a) => [a.path, a]) ?? []);
+  const candidateArtifacts = new Map(candidate?.artifacts.map((a) => [a