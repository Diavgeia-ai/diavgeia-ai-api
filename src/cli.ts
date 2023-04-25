import Logger from './logger';
import env from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

env.config();

let main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 <command> [options]')
    .command(
      'ingest',
      'Ingest decisions from diavgeia.gov.gr',
      (yargs) => {
        return yargs
          .option('impl', {
            type: 'string',
            description: 'Implementation of the ingestor',
            demandOption: true,
          })
          .option('name', {
            type: 'string',
            description: 'Human-friendly name for this task run',
            demandOption: true,
          })
          .option('startDate', {
            type: 'string',
            description: 'Start date in the format YYYY-MM-DD',
            demandOption: true,
          })
          .option('endDate', {
            type: 'string',
            description: 'End date (non-inclusive) in the format YYYY-MM-DD',
            demandOption: true,
          })
          .option('decisionTypes', {
            type: 'string',
            description: 'Comma-separated list of decision types',
            demandOption: true,
          });
      },
      async (argv) => {
        const { impl, name, startDate, endDate, decisionTypes } = argv;
        const ingestorCreatorPromise = await import('./tasks/ingestors/ingestors');
        const ingestors = await ingestorCreatorPromise.default;

        const ingestorConstructor = ingestors[impl as keyof typeof ingestors];
        if (!ingestorConstructor) {
          throw new Error(`Ingestor implementation not found: ${impl}. Available implementations: ${Object.keys(ingestors)}`);
        }

        const ingestor = ingestorConstructor.create(name);

        await ingestor.start({ startDate, endDate, decisionTypes });
      }
    )
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .argv;
};

main();
