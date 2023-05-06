import Logger from './logger';
import env from 'dotenv';
import yargs, { number } from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import TaskConstructor from './tasks/taskConstructor';
import { createViewConfiguration } from './db';

env.config({ path: path.resolve(__dirname, '../../.env') });

let main = async () => {
  const ingestorCreatorPromise = await import('./tasks/ingestors/ingestors');
  const textExtractorCreatorPromise = await import('./tasks/textExtractors/textExtractors');
  const summarizerCreatorPromise = await import('./tasks/summarizers/summarizers');
  const embedderCreatorPromise = await import('./tasks/embedders/embedders');
  const dimensionalityReducerCreatorPromise = await import('./tasks/dimensionalityReducers/dimensionalityReducers');

  const ingestors = await ingestorCreatorPromise.default;
  const textExtractors = await textExtractorCreatorPromise.default;
  const summarizers = await summarizerCreatorPromise.default;
  const embedders = await embedderCreatorPromise.default;
  const dimensionalityReducers = await dimensionalityReducerCreatorPromise.default;


  let getTaskImplementation = (type: 'ingestor' | 'text-extractor' | 'embedder' | 'dimensionality-reducer' | 'summarizer', implementation: string): TaskConstructor => {
    var implementations;
    switch (type) {
      case 'ingestor':
        implementations = ingestors;
        break;
      case 'text-extractor':
        implementations = textExtractors;
        break;
      case 'embedder':
        implementations = embedders;
        break;
      case 'dimensionality-reducer':
        implementations = dimensionalityReducers;
        break;
      case 'summarizer':
        implementations = summarizers;
        break;
    }

    let impl = implementations[implementation as keyof typeof implementations];

    if (!impl) {
      throw new Error(`${type} implementation not found: ${implementation}. Available implementations: ${Object.keys(implementations)}`);
    }

    return impl;
  }


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
          })
          .option('only', {
            type: 'number',
            description: 'Only ingest the first N decisions',
            optional: true,
            demandOption: true,
          });
      },
      async (argv) => {
        const { impl, name, startDate, endDate, decisionTypes, only } = argv;

        const ingestorConstructor = getTaskImplementation('ingestor', impl);
        const ingestor = ingestorConstructor.create(name);
        await ingestor.start({ startDate, endDate, decisionTypes, only });
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

        const textExtractorConstructor = getTaskImplementation('text-extractor', impl);
        const textExtractor = textExtractorConstructor.create(name);
        await textExtractor.start({ ingestorTaskId });
      }
    )
    .command(
      'summarize',
      'Summarize texts',
      (yargs) => {
        return yargs
          .option('impl', {
            type: 'string',
            description: 'Implementation of the summarizer',
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

        const summarizerConstructor = getTaskImplementation('summarizer', impl);
        const summarizer = summarizerConstructor.create(name);
        if (!textExtractorTaskId) {
          textExtractorTaskId = (await summarizer.getLastTaskId('text-extractor')).toString();
        }

        await summarizer.start({ textExtractorTaskId });
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

        const embedderConstructor = getTaskImplementation('embedder', impl);
        const embedder = embedderConstructor.create(name);
        if (!textExtractorTaskId) {
          textExtractorTaskId = (await embedder.getLastTaskId('text-extractor')).toString();
        }

        await embedder.start({ textExtractorTaskId });
      }
    )
    .command(
      'reduce-dimensions',
      'Reduce the dimensionality of the embeddings to 2D semantic points',
      (yargs) => {
        return yargs
          .option('impl', {
            type: 'string',
            description: 'Implementation of the dimensionality reducer',
            demandOption: true,
          })
          .option('name', {
            type: 'string',
            description: 'Human-friendly name for this task run',
            demandOption: true,
          })
          .option('embedderTaskId', {
            type: 'string',
            description: 'Task ID of the embedder task to reduce the dimensionality of',
            optional: true
          });
      },
      async (argv) => {
        var { impl, name, embedderTaskId } = argv;

        const dimensionalityReducerConstructor = getTaskImplementation('dimensionality-reducer', impl);
        const dimensionalityReducer = dimensionalityReducerConstructor.create(name);
        if (!embedderTaskId) {
          embedderTaskId = (await dimensionalityReducer.getLastTaskId('embedder')).toString();
        }

        await dimensionalityReducer.start({ embedderTaskId });
      }
    )
    .command('pipeline',
      'Run the entire pipeline',
      (yargs) => {
        return yargs
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
          })
          .option('only', {
            type: 'number',
            description: 'Only run the first N decisions',
            optional: true,
          })
          .option('ingestorImpl', {
            type: 'string',
            description: 'Implementation of the ingestor',
            default: 'diavgeia-ingestor',
            demandOption: true,
          })
          .option('textExtractorImpl', {
            type: 'string',
            description: 'Implementation of the text extractor',
            default: 'simple-text-extractor',
            demandOption: true,
          })
          .option('summarizerImpl', {
            type: 'string',
            description: 'Implementation of the summarizer',
            default: 'gpt-summarizer',
            demandOption: true,
          })
          .option('embedderImpl', {
            type: 'string',
            description: 'Implementation of the embedder',
            default: 'cohere-embedder',
            demandOption: true,
          })
          .option('dimensionalityReducerImpl', {
            type: 'string',
            description: 'Implementation of the dimensionality reducer',
            default: 'umap-dimensionality-reducer',
            demandOption: true,
          })
          .option('skip', {
            type: 'string',
            description: 'Comma-separated list of tasks to skip',
            default: '',
            demandOption: true,
            optional: true
          });
      },
      async (argv) => {
        const { name, startDate, endDate, decisionTypes } = argv;
        const { ingestorImpl, textExtractorImpl, summarizerImpl, embedderImpl, dimensionalityReducerImpl } = argv;
        const { skip, only } = argv;
        let skipList = (skip as string).split(',');
        const ingestorConstructor = getTaskImplementation('ingestor', ingestorImpl);
        const textExtractorConstructor = getTaskImplementation('text-extractor', textExtractorImpl);
        const summarizerConstructor = getTaskImplementation('summarizer', summarizerImpl);
        const embedderConstructor = getTaskImplementation('embedder', embedderImpl);
        const dimensionalityReducerConstructor = getTaskImplementation('dimensionality-reducer', dimensionalityReducerImpl);

        let ingestorName = `${name}-ingestor`;
        let textExtractorName = `${name}-text-extractor`;
        let summarizerName = `${name}-summarizer`;
        let embedderName = `${name}-embedder`;
        let dimensionalityReducerName = `${name}-dimensionality-reducer`;

        const ingestor = ingestorConstructor.create(ingestorName);
        let ingestorTaskId = await ingestor.start({ startDate, endDate, decisionTypes, only });

        const textExtractor = textExtractorConstructor.create(textExtractorName);
        let textExtractorTaskId = (await textExtractor.start({ ingestorTaskId }));

        let summarizerPromise: Promise<string | undefined> = Promise.resolve(undefined);
        if (!skipList.includes('summarizer')) {
          const summarizer = summarizerConstructor.create(summarizerName);
          summarizerPromise = summarizer.start({ textExtractorTaskId });
        }
        let summarizerTaskId = await summarizerPromise;

        const embedder = embedderConstructor.create(embedderName);
        let embedderTaskId = (await embedder.start({ textExtractorTaskId }));

        const dimensionalityReducer = dimensionalityReducerConstructor.create(dimensionalityReducerName);
        let dimensionalityReducerTaskId = await dimensionalityReducer.start({ embedderTaskId });


        let viewId = await createViewConfiguration({
          name,
          ingestorTaskId: ingestorTaskId,
          textExtractorTaskId: textExtractorTaskId,
          summarizerTaskId: summarizerTaskId,
          embedderTaskId: embedderTaskId,
          dimensionalityReducerTaskId: dimensionalityReducerTaskId
        });

        console.log(`View configuration created with ID ${viewId}`);
      }

    )
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .argv;
};

main();
