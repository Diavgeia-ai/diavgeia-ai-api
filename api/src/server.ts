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
import { createViewConfiguration, db, getLatestConfiguration } from './db';
import bodyParser from 'body-parser';
import { Server } from "socket.io";
import http from "http";
import { onConnect } from './chat';
import search, { getQueryEmbedding } from './search';

//TODO: fix this
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const DEFAULT_RESULT_COUNT = 25;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { path: "/chat" });
app.use(bodyParser.json());


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



app.get('/search', cache(), throttle(throttling), async (req, res) => {
    let query = req.query.q;
    let n = parseInt(req.query.n as string);
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

    try {
        var searchResults = await search(query, n);
    } catch (e) {
        console.log(e);
        res.status(500).send({ "error": "Failed to generate query" });
        return;
    }

    res.send(searchResults);
});

app.get('/status', async (req, res) => {
    res.send({
        tasks: (await db.query("SELECT * FROM tasks ORDER BY id DESC")).rows,
        configurations: (await db.query("SELECT * FROM configurations ORDER BY id DESC")).rows,
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

app.get('/semantic-points', async (req, res) => {
    let configurationId = await getLatestConfiguration();
    let n = parseInt(req.query.n as string);
    if (isNaN(n)) {
        n = 500;
    }
    res.send({
        points: (await db.query("SELECT ada, x, y, summary, decision_metadata FROM configuration_view($1) ORDER BY RANDOM() LIMIT $2", [configurationId, n])).rows
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
    let { summarizerName, summarizerVersion } = req.body;
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
        var summarizerTaskId = await getTaskId('summarizer', summarizerName, summarizerVersion);
        var embedderId = await getTaskId('embedder', embedderName, embedderVersion);
        var dimensionalityReducerId = await getTaskId('dimensionality-reducer', dimensionalityReducerName, dimensionalityReducerVersion);
    } catch (e: any) {
        res.status(400).send({ "error": e.message });
        return;
    }

    let viewId = await createViewConfiguration({
        name,
        ingestorTaskId: ingestorId,
        textExtractorTaskId: textExtractorId,
        summarizerTaskId: summarizerTaskId,
        embedderTaskId: embedderId,
        dimensionalityReducerTaskId: dimensionalityReducerId
    });

    res.send({
        id: viewId
    });
});

io.on('connection', onConnect);

const start = async () => {
    let port = 3000;
    server.listen(port, () => {
        console.log(`Server started on port ${port}`);
    });
}

start();
