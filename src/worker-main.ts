import { loadEnvironmentConfig } from './infrastructure/config/environment-config';
import { ConsoleLogger } from './infrastructure/logging/console-logger';

function main(): void {
  const config = loadEnvironmentConfig(process.env);
  const logger = new ConsoleLogger(config.logLevel);

  logger.info('Extraction worker bootstrap completed.', {
    appEnv: config.appEnv,
    storageDriver: config.storageDriver,
  });
}

main();
