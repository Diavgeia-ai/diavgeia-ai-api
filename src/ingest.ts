import Logger from './logger';
import env from 'dotenv';
import { DiavgeiaQuery } from './utils';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import embedDiavgeia from './embedDiavgeia';

env.config();

let main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 --startDate <date> --endDate <date> --decisionTypes <types>')
    .option('startDate', {
      alias: 's',
      type: 'string',
      description: 'Start date in the format YYYY-MM-DD',
      demandOption: true,
    })
    .option('endDate', {
      alias: 'e',
      type: 'string',
      description: 'End date (non-inclusive) in the format YYYY-MM-DD',
      demandOption: true,
    })
    .option('decisionTypes', {
      alias: 'd',
      type: 'string',
      description: 'Comma-separated list of decision types',
      demandOption: true,
    })
    .check((argv : any) => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(argv.startDate)) {
        throw new Error('Invalid start date format. Use YYYY-MM-DD.');
      }
      if (!dateRegex.test(argv.endDate)) {
        throw new Error('Invalid end date format. Use YYYY-MM-DD.');
      }
      return true;
    })
    .argv;

  const config = {
    startDate: argv.startDate,
    endDate: argv.endDate,
    decisionTypes: argv.decisionTypes.split(','),
  };

  const diavgeiaQuery : DiavgeiaQuery = {
      decisionTypeUid: config.decisionTypes,
      issueDate: [
        `DT(${config.startDate}T00:00:00)`,
        `DT(${config.endDate}T00:00:00)`,
      ],
    };

  embedDiavgeia(diavgeiaQuery);
}

main();