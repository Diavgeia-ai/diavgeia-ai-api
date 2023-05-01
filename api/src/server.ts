import express from 'express';
import { generateCohereEmbedding } from './utils';
import { generateChromaQuery } from './generateQuery';
//@ts-expect-error no types
import throttle from 'express-throttle';
import { Response } from 'express';
import { ValueWithCost } from './types';
import apicache from 'apicache';
import path from 'path';
import dotenv from 'dotenv';
import { createViewConfiguration, getDbPool } from './db';
//@ts-ignore
import pgvector from 'pgvector/pg';
import bodyParser from 'body-parser';


//TODO: fix this
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const EMBEDDING_MODEL = "multilingual-22-12";
const DEFAULT_RESULT_COUNT = 25;

const app = express();
app.use(bodyParser.json());
const db = getDbPool();

let getQueryEmbedding = async (query: string): Promise<ValueWithCost<number[]>> => {
    return generateCohereEmbedding(EMBEDDING_MODEL, query);
};

let throttling = {
    "rate": "30/m",
    "key": () => "everyone",
    "on_throttled": (_: any, res: Response) => {
        res.status(503).send({ "error": "System is overloaded, please try again later" });
    }
};

let cache = apicache.options({
    defaultDuration: '1 hour',
    statusCodes: { include: [200] }
}).middleware

const emptyResponse = {
    ids: [[]],
    distances: [[]],
    metadatas: [[]],
    documents: [[]]
};

const getLatestConfiguration = async () => {
    const res = await db.query('SELECT id FROM configurations ORDER BY id DESC LIMIT 1');
    return res.rows[0].id;
}

app.get('/search', cache(), throttle(throttling), async (req, res) => {
    let query = req.query.q;
    let n = parseInt(req.query.n as string);
    let startTime = Date.now();
    let searchCost = 0;

    if (isNaN(n)) {
        n = DEFAULT_RESULT_COUNT;
    }

    if (query === undefined) {
        res.status(400).send("Missing query");
        return;
    }

    if (typeof query !== "string") {
        res.status(400).send("Query must be a string");
        return;
    }

    let queryToEmbed: string;
    let whereObj: { [key: string]: any } | undefined;
    try {
        let { cost, value } = await generateChromaQuery(query);
        [queryToEmbed, whereObj] = value;
        searchCost += cost;
    } catch (e) {
        res.status(500).send({ "error": "Failed to generate query" });
        return;
    }

    console.log(`Query to embed: ${queryToEmbed}`);
    const { cost, value: embedding } = await getQueryEmbedding(queryToEmbed);
    searchCost += cost;
    // decisionType is always "Δ.1" for the demo
    let whereDecisionType = whereObj.decisionType;
    delete whereObj.decisionType;

    let where = whereObj;
    console.log(JSON.stringify(where));

    const configurationId = await getLatestConfiguration();
    console.log(`Configuration ID: ${configurationId}`);
    let results = await db.query(
        `SELECT
            ada,
            decision_metadata,
            text,
            document_metadata,
            x, y,
            embedding <-> $2 AS distance
        FROM configuration_view($1)
        ORDER BY embedding <-> $2
        LIMIT $3`,
        [configurationId, pgvector.toSql(embedding), n]
    );

    //re-add the decision type
    whereObj.decisionType = whereDecisionType;

    let endTime = Date.now();
    let timeMs = endTime - startTime;
    res.send({
        queryMetadata: {
            resultCount: results.rows.length,
            semanticQuery: queryToEmbed,
            whereQuery: whereObj,
            cost: searchCost,
            timeMs,
            queryEmbedding: embedding
        },
        results: results.rows
    });
});

app.get('/status', async (req, res) => {
    res.send({
    });
});

app.get('/embed', async (req, res) => {
    let query = req.query.q;
    if (query === undefined) {
        res.status(400).send("Missing query");
        return;
    }

    try {
        var { cost, value } = await getQueryEmbedding(query as string);
    } catch (e) {
        console.log(e);
        res.status(500).send({ "error": "Failed to generate query" });
        return;
    }

    res.send({
        query: query,
        embedding: value,
        cost
    });
});

let getTaskId = async (taskType: string, taskName: string, taskVersion: string | undefined): Promise<string> => {
    var result;
    if (!taskVersion) {
        result = await db.query("SELECT id FROM tasks WHERE type = $1 AND name = $2 ORDER BY version DESC", [taskType, taskName]);
    } else {
        result = await db.query("SELECT id FROM tasks WHERE type = $1 AND name = $2 AND version = $3", [taskType, taskName, taskVersion]);
    }

    if (result.rows.length === 0) {
        throw new Error(`Task not found: ${taskType} ${taskName} ${taskVersion}`);
    }

    return result.rows[0].id;
}

app.post('/configuration', async (req, res) => {
    let { ingestorName, ingestorVersion } = req.body;
    let { textExtractorName, textExtractorVersion } = req.body;
    let { embedderName, embedderVersion } = req.body;
    let { dimensionalityReducerName, dimensionalityReducerVersion } = req.body;
    let { name } = req.body;

    if (!ingestorName || !textExtractorName || !embedderName || !dimensionalityReducerName) {
        res.status(400).send({ "error": "Missing required fields" });
        return;
    }

    try {
        var ingestorId = await getTaskId('ingestor', ingestorName, ingestorVersion);
        var textExtractorId = await getTaskId('text-extractor', textExtractorName, textExtractorVersion);
        var embedderId = await getTaskId('embedder', embedderName, embedderVersion);
        var dimensionalityReducerId = await getTaskId('dimensionality-reducer', dimensionalityReducerName, dimensionalityReducerVersion);
    } catch (e: any) {
        res.status(400).send({ "error": e.message });
        return;
    }

    let viewId = await createViewConfiguration(db, {
        name,
        ingestorTaskId: ingestorId,
        textExtractorTaskId: textExtractorId,
        embedderTaskId: embedderId,
        dimensionalityReducerTaskId: dimensionalityReducerId
    });

    res.send({
        id: viewId
    });
});

const start = async () => {
    let port = 3000;
    app.listen(port, () => {
        console.log(`Server started on port ${port}`);
    });
}

start();
