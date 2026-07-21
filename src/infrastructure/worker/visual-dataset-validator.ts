import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

type JsonPrimitive = string | number | boolean | null;

interface PartialPixelBox extends Readonly<Record<string, JsonPrimitive | undefined>> {
  readonly xMin?: JsonPrimitive;
  readonly yMin?: JsonPrimitive;
  readonly xMax?: JsonPrimitive;
  readonly yMax?: JsonPrimitive;
  readonly width?: JsonPrimitive;
  readonly height?: JsonPrimitive;
}

interface PartialNormalizedBox extends Readonly<Record<string, JsonPrimitive | undefined>> {
  readonly xCenter?: JsonPrimitive;
  readonly yCenter?: JsonPrimitive;
  readonly width?: JsonPrimitive;
  readonly height?: JsonPrimitive;
}

interface PartialVisualDatasetTarget {
  readonly label?: JsonPrimitive;
  readonly viewportBox?: PartialPixelBox;
  readonly documentBox?: PartialPixelBox;
  readonly normalizedDocumentBox?: PartialNormalizedBox;
}

interface PartialVisualDatasetAnnotation {
  readonly sampleId?: JsonPrimitive;
  readonly runId?: JsonPrimitive;
  readonly supermarketId?: JsonPrimitive;
  readonly stateName?: JsonPrimitive;
  readonly pageUrl?: JsonPrimitive;
  readonly screenshotPath?: JsonPrimitive;
  readonly target?: PartialVisualDatasetTarget;
}

const validStateNames = new Set([
  'ANCHOR_PAGE',
  'STORE_SELECTION',
  'LEAFLETS_PAGE',
  'LEAFLET_MODAL',
  'PDF_DOWNLOAD',
  'IMAGE_GALLERY',
  'ERROR_RECOVERY',
]);

const validLabels = new Set([
  'open_leaflets_page_button',
  'open_leaflet_modal_button',
  'download_pdf_button',
  'open_pdf_link',
  'select_store_button',
  'select_region_button',
  'extract_leaflet_image',
  'next_gallery_image_button',
  'previous_gallery_image_button',
  'close_modal_button',
]);

export interface VisualDatasetValidationIssue {
  readonly annotationPath: string;
  readonly message: string;
}

export interface VisualDatasetValidationReport {
  readonly rootDirectory: string;
  readonly annotationsChecked: number;
  readonly screenshotsChecked: number;
  readonly issues: readonly VisualDatasetValidationIssue[];
  readonly valid: boolean;
}

export class VisualDatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisualDatasetValidationError';
  }
}

export async function validateVisualDataset(
  rootDirectory: string,
): Promise<VisualDatasetValidationReport> {
  const trimmedRootDirectory = rootDirectory.trim();

  if (trimmedRootDirectory.length === 0) {
    throw new VisualDatasetValidationError('rootDirectory cannot be blank.');
  }

  const annotationPaths = await findAnnotationPaths(trimmedRootDirectory);
  const issues: VisualDatasetValidationIssue[] = [];
  let screenshotsChecked = 0;

  for (const annotationPath of annotationPaths) {
    const annotation = parseAnnotation(annotationPath, await readFile(annotationPath, 'utf8'));
    const annotationIssues = await validateAnnotation(annotationPath, annotation);
    screenshotsChecked += hasString(annotation, 'screenshotPath') ? 1 : 0;
    issues.push(...annotationIssues);
  }

  return {
    rootDirectory: trimmedRootDirectory,
    annotationsChecked: annotationPaths.length,
    screenshotsChecked,
    issues,
    valid: issues.length === 0,
  };
}

async function findAnnotationPaths(rootDirectory: string): Promise<readonly string[]> {
  const entries = await readdir(rootDirectory, {
    withFileTypes: true,
  }).catch(() => {
    throw new VisualDatasetValidationError(`Cannot read Visual Dataset root: ${rootDirectory}.`);
  });
  const annotationPaths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(rootDirectory, entry.name);

    if (entry.isDirectory()) {
      annotationPaths.push(...(await findAnnotationPaths(entryPath)));
      continue;
    }

    if (entry.name === 'annotation.json') {
      annotationPaths.push(entryPath);
    }
  }

  return annotationPaths.sort();
}

function parseAnnotation(annotationPath: string, content: string): PartialVisualDatasetAnnotation {
  try {
    return JSON.parse(content) as PartialVisualDatasetAnnotation;
  } catch (error) {
    if (error instanceof VisualDatasetValidationError) {
      throw error;
    }

    throw new VisualDatasetValidationError(`Cannot parse annotation JSON: ${annotationPath}.`);
  }
}

async function validateAnnotation(
  annotationPath: string,
  annotation: PartialVisualDatasetAnnotation,
): Promise<readonly VisualDatasetValidationIssue[]> {
  const issues: VisualDatasetValidationIssue[] = [];

  requireString(issues, annotationPath, annotation, 'sampleId');
  requireString(issues, annotationPath, annotation, 'runId');
  requireString(issues, annotationPath, annotation, 'supermarketId');
  requireString(issues, annotationPath, annotation, 'pageUrl');
  validateStateName(issues, annotationPath, annotation);
  await validateScreenshotPath(issues, annotationPath, annotation);
  validateTarget(issues, annotationPath, annotation);

  return issues;
}

function validateStateName(
  issues: VisualDatasetValidationIssue[],
  annotationPath: string,
  annotation: PartialVisualDatasetAnnotation,
): void {
  const stateName = annotation.stateName;

  if (typeof stateName !== 'string' || !validStateNames.has(stateName)) {
    issues.push({
      annotationPath,
      message: 'stateName is missing or invalid.',
    });
  }
}

async function validateScreenshotPath(
  issues: VisualDatasetValidationIssue[],
  annotationPath: string,
  annotation: PartialVisualDatasetAnnotation,
): Promise<void> {
  const screenshotPath = annotation.screenshotPath;

  if (typeof screenshotPath !== 'string' || screenshotPath.trim().length === 0) {
    issues.push({
      annotationPath,
      message: 'screenshotPath is missing or blank.',
    });
    return;
  }

  await access(screenshotPath).catch(() => {
    issues.push({
      annotationPath,
      message: 'screenshotPath does not exist.',
    });
  });
}

function validateTarget(
  issues: VisualDatasetValidationIssue[],
  annotationPath: string,
  annotation: PartialVisualDatasetAnnotation,
): void {
  const target = annotation.target;

  if (target === undefined) {
    issues.push({
      annotationPath,
      message: 'target is missing or invalid.',
    });
    return;
  }

  const label = target.label;

  if (typeof label !== 'string' || !validLabels.has(label)) {
    issues.push({
      annotationPath,
      message: 'target.label is missing or invalid.',
    });
  }

  validatePixelBox(issues, annotationPath, target, 'viewportBox');
  validatePixelBox(issues, annotationPath, target, 'documentBox');
  validateNormalizedBox(issues, annotationPath, target);
}

function validatePixelBox(
  issues: VisualDatasetValidationIssue[],
  annotationPath: string,
  target: PartialVisualDatasetTarget,
  key: 'viewportBox' | 'documentBox',
): void {
  const box = target[key];

  if (box === undefined) {
    issues.push({
      annotationPath,
      message: `target.${key} is missing or invalid.`,
    });
    return;
  }

  const xMin = readNumber(box, 'xMin');
  const yMin = readNumber(box, 'yMin');
  const xMax = readNumber(box, 'xMax');
  const yMax = readNumber(box, 'yMax');
  const width = readNumber(box, 'width');
  const height = readNumber(box, 'height');

  if (
    xMin === null ||
    yMin === null ||
    xMax === null ||
    yMax === null ||
    width === null ||
    height === null ||
    xMin < 0 ||
    yMin < 0 ||
    xMax <= xMin ||
    yMax <= yMin ||
    width <= 0 ||
    height <= 0
  ) {
    issues.push({
      annotationPath,
      message: `target.${key} has invalid dimensions.`,
    });
  }
}

function validateNormalizedBox(
  issues: VisualDatasetValidationIssue[],
  annotationPath: string,
  target: PartialVisualDatasetTarget,
): void {
  const box = target.normalizedDocumentBox;

  if (box === undefined) {
    issues.push({
      annotationPath,
      message: 'target.normalizedDocumentBox is missing or invalid.',
    });
    return;
  }

  for (const key of ['xCenter', 'yCenter', 'width', 'height'] as const) {
    const value = readNumber(box, key);

    if (value === null || value < 0 || value > 1) {
      issues.push({
        annotationPath,
        message: `target.normalizedDocumentBox.${key} must be between 0 and 1.`,
      });
    }
  }
}

function requireString(
  issues: VisualDatasetValidationIssue[],
  annotationPath: string,
  annotation: PartialVisualDatasetAnnotation,
  key: keyof Pick<
    PartialVisualDatasetAnnotation,
    'sampleId' | 'runId' | 'supermarketId' | 'pageUrl'
  >,
): void {
  if (!hasString(annotation, key)) {
    issues.push({
      annotationPath,
      message: `${key} is missing or blank.`,
    });
  }
}

function hasString(
  annotation: PartialVisualDatasetAnnotation,
  key: keyof Pick<
    PartialVisualDatasetAnnotation,
    'sampleId' | 'runId' | 'supermarketId' | 'pageUrl' | 'screenshotPath'
  >,
): boolean {
  const value = annotation[key];

  return typeof value === 'string' && value.trim().length > 0;
}

function readNumber(
  object: PartialPixelBox | PartialNormalizedBox,
  key: keyof PartialPixelBox | keyof PartialNormalizedBox,
): number | null {
  const value = object[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
