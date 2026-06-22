/**
 * Diagnostic metadata parser and viewer utilities.
 *
 * Provides types and helpers to read `diagnostic/build-*.json` files,
 * render module/artifact status in the diagnostics viewer, and
 * compare two diagnostic metadata files to show changes between builds.
 */

export interface ArtifactInfo {
  path: string;
  /** Number of artifacts of this type. */
  count: number;
}

export interface DiagnosticMetadata {
  commit: string;
  timestamp: string;
  /** Module name -> status mapping. */
  modules: Record<string, ModuleStatus>;
}

  metadata: DiagnosticMetadata;
}

/** Parse a single diagnostic metadata JSON string. */
export function parseDiagnosticMetadata(json: string): ParsedDiagnostic {
  const data = JSON.parse(json);
  return {
  };
}

/** Render a single diagnostic metadata as a human-readable string. */
export function renderDiagnostic(meta: DiagnosticMetadata): string {
  const lines: string[] = [];
  lines.push(`Commit: ${meta.commit}`);
  }
  return lines.join('\n');
}

/** Comparison result categories for a module between two builds. */
export type ModuleChangeType =
  | 'added'
  | 'removed'
  | 'changed'
  | 'failed'
  | 'recovered'
  | 'unchanged';

export interface ModuleComparison {
  name: string;
  changeType: ModuleChangeType;
  baseline?: ModuleStatus;
  candidate?: ModuleStatus;
  /** Human-readable description of what changed. */
  description: string;
}

export interface DiagnosticComparison {
  baselineCommit: string;
  candidateCommit: string;
  modules: ModuleComparison[];
}

/**
 * Compare two diagnostic metadata objects and return a deterministic
 * comparison of module status changes.
 */
export function compareDiagnostics(
  baseline: DiagnosticMetadata,
  candidate: DiagnosticMetadata,
): DiagnosticComparison {
  const result: DiagnosticComparison = {
    baselineCommit: baseline.commit,
    candidateCommit: candidate.commit,
    modules: [],
  };

  const allModuleNames = new Set([
    ...Object.keys(baseline.modules),
    ...Object.keys(candidate.modules),
  ]);

  const sortedNames = Array.from(allModuleNames).sort();

  for (const name of sortedNames) {
    const baseMod = baseline.modules[name];
    const candMod = candidate.modules[name];

    if (!baseMod && candMod) {
      result.modules.push({
        name,
        changeType: 'added',
        candidate: candMod,
        description: `Module ${name} added (status: ${candMod.status})`,
      });
    } else if (baseMod && !candMod) {
      result.modules.push({
        name,
        changeType: 'removed',
        baseline: baseMod,
        description: `Module ${name} removed (was: ${baseMod.status})`,
      });
    } else if (baseMod && candMod) {
      const failed = candMod.status === 'failed' && baseMod.status !== 'failed';
      const recovered = baseMod.status === 'failed' && candMod.status !== 'failed';
      const changed = baseMod.status !== candMod.status || baseMod.artifacts.length !== candMod.artifacts.length;

      let changeType: ModuleChangeType = 'unchanged';
      let description = `Module ${name} unchanged`;

      if (failed) {
        changeType = 'failed';
        description = `Module ${name} newly failed (was: ${baseMod.status}, now: ${candMod.status})`;
      } else if (recovered) {
        changeType = 'recovered';
        description = `Module ${name} recovered (was: ${baseMod.status}, now: ${candMod.status})`;
      } else if (changed) {
        changeType = 'changed';
        description = `Module ${name} changed (was: ${baseMod.status}, now: ${candMod.status}; artifacts: ${baseMod.artifacts.length} -> ${candMod.artifacts.length})`;
      }

      result.modules.push({ name, changeType, baseline: baseMod, candidate: candMod, description });
    }
  }

  return result;
}

/** Render a diagnostic comparison as a human-readable string. */
export function renderComparison(comparison: DiagnosticComparison): string {
  const lines: string[] = [];
  lines.push(`Baseline:  ${comparison.baselineCommit}`);
  lines.push(`Candidate: ${comparison.candidateCommit}`);
  lines.push('');

  const significant = comparison.modules.filter(m => m.changeType !== 'unchanged');
  if (significant.length === 0) {
    lines.push('No changes detected between builds.');
    return lines.join('\n');
  }

  for (const mod of significant) {
    lines.push(`[${mod.changeType.toUpperCase()}] ${mod.name}`);
    lines.push(`  ${mod.description}`);
    if (mod.baseline && mod.candidate) {
      const baseArts = mod.baseline.artifacts.map(a => `${a.path} (count: ${a.count})`).join(', ');
      const candArts = mod.candidate.artifacts.map(a => `${a.path} (count: ${a.count})`).join(', ');
      if (baseArts !==itsu !== candArts) {
        lines.push(`  Artifacts changed: ${baseArts} -> ${candArts}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}