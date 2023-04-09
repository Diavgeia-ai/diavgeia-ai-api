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

let fetchDiavgeia = async (diavgeiaQuery : DiavgeiaQuery, startPage = 0, pages = Infinity, pageSize = 500, sleepTimeMs = 1000) => {
    let decisions : Decision[] = [];
    for (let page = startPage; page < startPage + pages; page++) {
        let query = diavgeiaSearchQuery(diavgeiaQuery, page, pageSize);
        logger.log("info", `Fetching page ${page} (${query})...`);
        let response = await axios.get(query, {});
        let data = response.data;
        decisions = decisions.concat(data.decisions.map((d : {}) => new Decision(d)));

        if (data.info.actualSize === 0) {
            break;
        }

        await sleep(sleepTimeMs);
    }
    return decisions;
}

let initChromaClient = async (collectionName : string) => {
    let client = new ChromaClient();
    let collections = await client.listCollections();
    console.log(collections);

    return client.createCollection(collectionName);
}

let embedDiavgeia = async (diavgeiaQuery : DiavgeiaQuery, startPage = 0, pages = Infinity) => {
    let client = await initChromaClient(process.env.CHROMA_COLLECTION!);
    for (let page = startPage; page < startPage + pages; page++) {
        let decisions = await fetchDiavgeia(diavgeiaQuery, page, 1, 50);

        logger.log("info", `Loading documents for page ${page}, with ${decisions.length} decisions...`);
        await doWithPooling(decisions, (d) => d.loadDocument(), 10);

        logger.log("info", `Embedding documents for page ${page}, with ${decisions.length} decisions...`);
        let embeddings = await doWithPooling(decisions, (d) => d.generateEmbedding(), 10);

        logger.log("info", `Saving embeddings for page ${page}, with ${decisions.length} decisions...`);
        let res = await client.add(
            decisions.map((d) => d.metadata.ada),
            embeddings,
            decisions.map((d) => d.metadata),
            decisions.map((d) => d.documentText)
        );
        
        console.log("RESULTS:");
        console.log(res);
    }

}

export default embedDiavgeia;