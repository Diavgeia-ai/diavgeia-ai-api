
import Decision from './decision';
import { DiavgeiaQuery, diavgeiaSearchQuery, sleep } from './utils';
import Logger from './logger';
import axios from 'axios';
import { doWithPooling } from './utils';
import { ChromaClient } from 'chromadb'
import dotenv from 'dotenv';
const client = new ChromaClient();

dotenv.config();
let logger = new Logger();
const DIAVGEIA_PAGE_SIZE = 50;

let fetchDiavgeiaPage = async (diavgeiaQuery : DiavgeiaQuery, page : number, pageSize = 500) : Promise<Decision[]> => {
    let query = diavgeiaSearchQuery(diavgeiaQuery, page, pageSize);
    logger.log("info", `Fetching diavgeia page ${page} (${query})...`);
    let response = await axios.get(query, {});

    let data = response.data;
    let decisions = data.decisions.map((d : {}) => new Decision(d));

    return decisions;
}

let getTotalDecisionCount = async (diavgeiaQuery : DiavgeiaQuery) => {
    let query = diavgeiaSearchQuery(diavgeiaQuery, 0, 1);
    logger.log("info", `Fetching diavgeia total count (${query})...`);
    let response = await axios.get(query, {});

    return response.data.info.total;
}

let initChromaClient = async (collectionName : string) => {
    let client = new ChromaClient();
    let collections = await client.listCollections();
    
    let collection;
    if (collections.map((c : any) => c.name).filter((n : string) => n === collectionName).length === 0) {
        logger.info(`Creating collection ${collectionName}`);
        collection = await client.createCollection(collectionName);
    } else {
        logger.info(`Getting collection ${collectionName}`);
        collection = await client.getCollection(collectionName);
    }

    return collection;
}

let embedDiavgeia = async (diavgeiaQuery : DiavgeiaQuery, startPage = 0, pages = Infinity) => {
    let [client, totalDecisions] = await Promise.all([
        initChromaClient(process.env.CHROMA_COLLECTION!),
        getTotalDecisionCount(diavgeiaQuery)]);

    logger.info(`${totalDecisions} total decision for query`);
    for (let page = startPage; page < startPage + pages; page++) {
        let decisions = await fetchDiavgeiaPage(diavgeiaQuery, page, DIAVGEIA_PAGE_SIZE);
        if (decisions.length === 0) {
            logger.info(`No more decisions, stopping...`);
            break;
        }

        logger.info(`Loading documents for page ${page}, with ${decisions.length} decisions...`);
        await doWithPooling(decisions, (d) => d.loadDocument(), 10);

        logger.info(`Embedding documents for page ${page}, with ${decisions.length} decisions...`);
        let embeddings = await doWithPooling(decisions, (d) => d.generateEmbedding(), 10);

        logger.info(`Saving embeddings for page ${page}, with ${decisions.length} decisions...`);
        await client.add(
            decisions.map((d) => d.metadata.ada),
            embeddings,
            decisions.map((d) => d.metadata),
            decisions.map((d) => d.documentText)
        );

        logger.info(`Progress: ${(page + 1) * DIAVGEIA_PAGE_SIZE} / ${totalDecisions} ingested [${((page + 1) * DIAVGEIA_PAGE_SIZE / totalDecisions * 100).toFixed(2)}%]]`);
    }
}

export default embedDiavgeia;