import type { ExtractionTarget } from '../../domain/extraction/extraction-target';

export class DuplicateExtractionTargetError extends Error {
  constructor(targetId: string) {
    super(`Duplicate extraction target: ${targetId}.`);
    this.name = 'DuplicateExtractionTargetError';
  }
}

export class ExtractionTargetNotFoundError extends Error {
  constructor(targetId: string) {
    super(`Extraction target not found: ${targetId}.`);
    this.name = 'ExtractionTargetNotFoundError';
  }
}

export class ExtractionTargetRegistry {
  private readonly targets: ReadonlyMap<string, ExtractionTarget>;

  constructor(targets: readonly ExtractionTarget[]) {
    this.targets = createTargetMap(targets);
  }

  listEnabled(): readonly ExtractionTarget[] {
    return [...this.targets.values()].filter((target) => target.enabled);
  }

  get(targetId: string): ExtractionTarget {
    const target = this.targets.get(targetId);

    if (target === undefined) {
      throw new ExtractionTargetNotFoundError(targetId);
    }

    return target;
  }

  filterEnabledByIds(targetIds: readonly string[]): readonly ExtractionTarget[] {
    const requestedIds = new Set(targetIds);

    return this.listEnabled().filter((target) => requestedIds.has(target.targetId));
  }
}

function createTargetMap(
  targets: readonly ExtractionTarget[],
): ReadonlyMap<string, ExtractionTarget> {
  const entries = new Map<string, ExtractionTarget>();

  for (const target of targets) {
    if (entries.has(target.targetId)) {
      throw new DuplicateExtractionTargetError(target.targetId);
    }

    entries.set(target.targetId, target);
  }

  return entries;
}
