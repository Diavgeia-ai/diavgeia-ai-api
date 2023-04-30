import Logger from './logger';
import env from 'dotenv';
import { ChromaClient } from 'chromadb';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getOrCreateChromaCollection } from './utils';

env.config();

let main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: --delete --collection <collectionName>')
    .option('collection', {
      alias: 'c',
      type: 'string',
      description: 'Name of a chroma collection',
      demandOption: true,
    })
    .option('get', {
        alias: 'g',
        type: 'string',
        description: 'Get a document from a chroma collection',
        demandOption: false,
    })
    .option('delete', {
      alias: 'd',
      type: 'boolean',
      description: 'Delete a chroma collection',
      demandOption: false,
      default: false
    })
    .option('count', {
        alias: 'n',
        type: 'boolean',
        description: 'Count the number of documents in a collection',
        demandOption: false,
    }).argv;

    if (argv.get) {
        let collection = await getOrCreateChromaCollection(argv.collection);
        let doc = await collection.get([argv.get]);
        let id = doc.ids[0];
        let metadata = doc.metadatas[0];
        let document = doc.documents[0];
        console.log(`ID: ${id}`);
        console.log(`Metadata: ${JSON.stringify(metadata)}`);
        console.log(`Document: ${document}`);
    } else if (argv.count) {
        let collection = await getOrCreateChromaCollection(argv.collection);
        let count = await collection.count();
        console.log(count);
        return;
    } else if (argv.delete) {
        let client = new ChromaClient();
        await client.deleteCollection(argv.collection);
        console.log(`Deleted collection ${argv.collection}`);
    }
}

main();