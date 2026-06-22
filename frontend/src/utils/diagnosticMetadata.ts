import { compareDiagnostics, ComparisonResult, ModuleStatusChange } from './diagnosticCompare';

/**
 * Types for diagnostic metadata JSON structure
 */
  modules: ModuleResult[];
}

export interface ComparisonViewState {
  baseline: ParsedDiagnostic | null;
  candidate: ParsedDiagnostic | null;
  result: ComparisonResult | null;
}

/**
 * Legacy single-file parse mode
 * @deprecated Use parseComparisonMode for compare functionality
 */
export function parseDiagnosticMetadata(json: string): ParsedDiagnostic {
  const data = JSON.parse(json) as DiagnosticMetadata;
  
    modules: data.modules || [],
  };
}

/**
 * Parse a single diagnostic metadata file for comparison mode
 */
export function parseDiagnosticFile(json: string): ParsedDiagnostic {
  return parseDiagnosticMetadata(json);
}

/**
 * Compare two diagnostic metadata files and return detailed changes
 */
export function compareDiagnosticFiles(
  baselineJson: string,
  candidateJson: string
): ComparisonResult {
  const baseline = parseDiagnosticFile(baselineJson);
  const candidate = parseDiagnosticFile(candidateJson);
  
  return compareDiagnostics(baseline, candidate);
}

/**
 * Format a module status change for display
 */
export function formatStatusChange(change: ModuleStatusChange): string {
  const parts: string[] = [];
  
  if (change.type === 'added') {
    parts.push(`[ADDED] ${change.moduleName}`);
    parts.push(`  Status: ${change.candidateStatus}`);
    if (change.artifactDiff) {
      parts.push(`  Artifacts: ${change.artifactDiff.candidateCount} files`);
    }
  } else if (change.type === 'removed') {
    parts.push(`[REMOVED] ${change.moduleName}`);
    parts.push(`  Previous status: ${change.baselineStatus}`);
  } else if (change.type === 'changed') {
    parts.push(`[CHANGED] ${change.moduleName}`);
    parts.push(`  ${change.baselineStatus} → ${change.candidateStatus}`);
    if (change.artifactDiff) {
      const { added, removed } =PF change.artifactDiff;
      if (added.length > 0) {
        parts.push(`  + Artifacts added: ${added.join(', ')}`);
      }
      if (removed.length > 0) {
        parts.push(`  - Artifacts removed: ${removed.join(', ')}`);
      }
    }
  } else if (change.type === 'failed') {
    parts.push(`[FAILED] ${change.moduleName}`);
    parts.push(`  Was: ${change.baselineStatus}`);
    parts.push(`  Now: ${change.candidateStatus}`);
  } else if (change.type === 'recovered') {
    parts.push(`[RECOVERED] ${change.moduleName}`);
    parts.push(`  Was: ${change.baselineStatus}`);
    parts.push(`  Now: ${change.candidateStatus}`);
    if (change.artifactDiff) {
      parts.push(`  Artifacts: ${change.artifactDiff.candidateCount} files`);
    }
  }
  
  return parts.join('\n');
}

export { ComparisonResult, ModuleStatusChange } from './diagnosticCompare';