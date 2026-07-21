import { validateVisualDataset } from './visual-dataset-validator';

async function main(): Promise<void> {
  try {
    const options = parseOptions(process.argv.slice(2));
    const report = await validateVisualDataset(options.rootDirectory);

    console.info(JSON.stringify(report, null, 2));

    if (!report.valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected Visual Dataset validation failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

interface VisualDatasetValidateCommandOptions {
  readonly rootDirectory: string;
}

function parseOptions(args: readonly string[]): VisualDatasetValidateCommandOptions {
  if (args.length === 0) {
    return {
      rootDirectory: '.data/visual-dataset',
    };
  }

  if (args.length !== 2 || args[0] !== '--root') {
    throw new Error('Usage: npm run visual-dataset:validate -- --root .data/visual-dataset');
  }

  const rootDirectory = args[1];

  if (rootDirectory === undefined || rootDirectory.trim().length === 0) {
    throw new Error('--root cannot be blank.');
  }

  return {
    rootDirectory,
  };
}

void main();
