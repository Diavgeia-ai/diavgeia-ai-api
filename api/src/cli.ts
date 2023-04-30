import Logger from './logger';
import env from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';

env.config({ path: path.resolve(__dirname, '../../.env') });

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
    .command(
      'extract-text',
      'Extract text from decisions',
      (yargs) => {
        return yargs
          .option('impl', {
            type: 'string',
            description: 'Implementation of the extractor',
            demandOption: true,
          })
          .option('name', {
            type: 'string',
            description: 'Human-friendly name for this task run',
            demandOption: true,
          })
          .option('ingestorTaskId', {
            type: 'string',
            description: 'Task ID of the ingestor task to extract text from (defaults to the last ingestor task)',
            optional: true
          });
      },
      async (argv) => {
        var { impl, name, ingestorTaskId } = argv;
        const textExtractorCreatorPromise = await import('./tasks/textExtractors/textExtractors');
        const textExtractors = await textExtractorCreatorPromise.default;

        const textExtractorConstructor = textExtractors[impl as keyof typeof textExtractors];
        if (!textExtractorConstructor) {
          throw new Error(`Text extractor implementation not found: ${impl}. Available implementations: ${Object.keys(textExtractors)}`);
        }

        const textExtractor = textExtractorConstructor.create(name);
        if (!ingestorTaskId) {
          ingestorTaskId = (await textExtractor.getLastTaskId('ingestor')).toString();
        }

        await textExtractor.start({ ingestorTaskId });
      }
    )
    .command(
      'embed',
      'Create embeddings for decisions',
      (yargs) => {
        return yargs
          .option('impl', {
            type: 'string',
            description: 'Implementation of the embedder',
            demandOption: true,
          })
          .option('name', {
            type: 'string',
            description: 'Human-friendly name for this task run',
            demandOption: true,
          })
          .option('textExtractorTaskId', {
            type: 'string',
            description: 'Task ID of the text extractor task to extract text from',
            optional: true
          });
      },
      async (argv) => {
        var { impl, name, textExtractorTaskId } = argv;
        const embedderCreatorPromise = await import('./tasks/embedders/embedders');
        const embedders = await embedderCreatorPromise.default;

        const embedderConstructor = embedders[impl as keyof typeof embedders];
        if (!embedderConstructor) {
          throw new Error(`Embedder implementation not found: ${impl}. Available implementations: ${Object.keys(embedders)}`);
        }

        const embedder = embedderConstructor.create(name);
        if (!textExtractorTaskId) {
          textExtractorTaskId = (await embedder.getLastTaskId('text-extractor')).toString();
        }

        await embedder.start({ textExtractorTaskId });
      }
    )
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .argv;
};

main();
