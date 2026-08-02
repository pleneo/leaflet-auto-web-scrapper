import type {
  ExtractionLeafletState,
  ExtractionStateSnapshot,
  ExtractionTargetState,
  ExtractionUnitState,
  ExtractionUnitStateStatus,
} from '../../domain/extraction/extraction-state';
import type {
  PlaywrightExtractionOutput,
  PlaywrightExtractionUnitOutput,
} from '../ports/playwright-extraction-strategy';
import type { ExtractionStateRepository } from '../ports/extraction-state-repository';

export interface ExtractionStateChangeSummary {
  readonly targetId: string;
  readonly unitsProcessed: number;
  readonly newLeaflets: number;
  readonly unchangedLeaflets: number;
  readonly removedLeaflets: number;
  readonly failedUnits: number;
  readonly emptyUnits: number;
}

export class ExtractionStateService {
  private readonly repository: ExtractionStateRepository;

  constructor(repository: ExtractionStateRepository) {
    this.repository = repository;
  }

  async recordOutput(
    output: PlaywrightExtractionOutput,
    observedAtIso: string,
  ): Promise<ExtractionStateChangeSummary> {
    const snapshot = await this.repository.load();
    const target = snapshot.targets.find(
      (candidateTarget) => candidateTarget.targetId === output.targetId,
    );
    const comparison = compareTargetState(output, target, observedAtIso);
    const nextTarget = createNextTargetState(output, target, observedAtIso, comparison.units);
    const nextSnapshot = replaceTarget(snapshot, nextTarget);

    await this.repository.save(nextSnapshot);

    return comparison.summary;
  }
}

interface UnitComparison {
  readonly unit: ExtractionUnitState;
  readonly newLeaflets: number;
  readonly unchangedLeaflets: number;
  readonly removedLeaflets: number;
}

interface TargetComparison {
  readonly units: readonly UnitComparison[];
  readonly summary: ExtractionStateChangeSummary;
}

function compareTargetState(
  output: PlaywrightExtractionOutput,
  previousTarget: ExtractionTargetState | undefined,
  observedAtIso: string,
): TargetComparison {
  const previousUnits = new Map((previousTarget?.units ?? []).map((unit) => [unit.unitId, unit]));
  const unitComparisons = output.units.map((unit) =>
    compareUnitState(unit, previousUnits.get(unit.unitId), observedAtIso),
  );

  return {
    units: unitComparisons,
    summary: {
      targetId: output.targetId,
      unitsProcessed: output.units.length,
      newLeaflets: sum(unitComparisons, (unit) => unit.newLeaflets),
      unchangedLeaflets: sum(unitComparisons, (unit) => unit.unchangedLeaflets),
      removedLeaflets: sum(unitComparisons, (unit) => unit.removedLeaflets),
      failedUnits: output.units.filter((unit) => unit.status === 'failed').length,
      emptyUnits: output.units.filter((unit) => unit.status === 'empty').length,
    },
  };
}

function compareUnitState(
  currentUnit: PlaywrightExtractionUnitOutput,
  previousUnit: ExtractionUnitState | undefined,
  observedAtIso: string,
): UnitComparison {
  if (currentUnit.status === 'failed') {
    return {
      unit: createFailedUnitState(currentUnit, previousUnit, observedAtIso),
      newLeaflets: 0,
      unchangedLeaflets: 0,
      removedLeaflets: 0,
    };
  }

  const previousLeaflets = new Map(
    (previousUnit?.leaflets ?? [])
      .filter((leaflet) => leaflet.status === 'active')
      .map((leaflet) => [leaflet.leafletKey, leaflet]),
  );
  const currentLeafletKeys = new Set(currentUnit.leaflets.map((leaflet) => leaflet.leafletKey));
  const activeLeaflets = currentUnit.leaflets.map((leaflet) => {
    const previousLeaflet = previousLeaflets.get(leaflet.leafletKey);

    return {
      leafletKey: leaflet.leafletKey,
      title: leaflet.title,
      contentSignature: leaflet.contentSignature,
      artifactCount: leaflet.artifactCount,
      sourceUrl: leaflet.sourceUrl,
      firstSeenAtIso: previousLeaflet?.firstSeenAtIso ?? observedAtIso,
      lastSeenAtIso: observedAtIso,
      status: 'active',
    } satisfies ExtractionLeafletState;
  });
  const removedLeaflets = [...previousLeaflets.values()]
    .filter((leaflet) => !currentLeafletKeys.has(leaflet.leafletKey))
    .map(
      (leaflet) =>
        ({
          ...leaflet,
          lastSeenAtIso: observedAtIso,
          status: 'removed',
        }) satisfies ExtractionLeafletState,
    );

  const unitStatus: ExtractionUnitStateStatus =
    currentUnit.status === 'empty' || currentUnit.leaflets.length === 0 ? 'empty' : 'succeeded';
  const newLeaflets = activeLeaflets.filter(
    (leaflet) => previousLeaflets.get(leaflet.leafletKey) === undefined,
  ).length;
  const unchangedLeaflets = activeLeaflets.length - newLeaflets;

  return {
    unit: {
      unitId: currentUnit.unitId,
      unitName: currentUnit.unitName,
      sourceUrl: currentUnit.sourceUrl,
      status: unitStatus,
      lastSeenAtIso: observedAtIso,
      lastSuccessfulSeenAtIso: observedAtIso,
      errorMessage: null,
      leaflets: [...activeLeaflets, ...removedLeaflets],
    },
    newLeaflets,
    unchangedLeaflets,
    removedLeaflets: removedLeaflets.length,
  };
}

function createFailedUnitState(
  currentUnit: PlaywrightExtractionUnitOutput,
  previousUnit: ExtractionUnitState | undefined,
  observedAtIso: string,
): ExtractionUnitState {
  return {
    unitId: currentUnit.unitId,
    unitName: currentUnit.unitName,
    sourceUrl: currentUnit.sourceUrl,
    status: 'failed',
    lastSeenAtIso: observedAtIso,
    lastSuccessfulSeenAtIso: previousUnit?.lastSuccessfulSeenAtIso ?? null,
    errorMessage: currentUnit.errorMessage ?? 'Extraction unit failed.',
    leaflets: previousUnit?.leaflets ?? [],
  };
}

function createNextTargetState(
  output: PlaywrightExtractionOutput,
  previousTarget: ExtractionTargetState | undefined,
  observedAtIso: string,
  unitComparisons: readonly UnitComparison[],
): ExtractionTargetState {
  return {
    targetId: output.targetId,
    supermarketId: output.supermarketId,
    lastRunAtIso: observedAtIso,
    lastSuccessfulRunAtIso:
      output.status === 'failed' ? (previousTarget?.lastSuccessfulRunAtIso ?? null) : observedAtIso,
    units: unitComparisons.map((comparison) => comparison.unit),
  };
}

function replaceTarget(
  snapshot: ExtractionStateSnapshot,
  target: ExtractionTargetState,
): ExtractionStateSnapshot {
  const targets = snapshot.targets.filter(
    (candidateTarget) => candidateTarget.targetId !== target.targetId,
  );

  return {
    version: 1,
    targets: [...targets, target],
  };
}

function sum(
  values: readonly UnitComparison[],
  selector: (value: UnitComparison) => number,
): number {
  return values.reduce((total, value) => total + selector(value), 0);
}
