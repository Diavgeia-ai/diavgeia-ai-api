import { Pool } from "pg";
import { ViewConfiguration } from "./types";

const getDbPool = (): Pool => {
    return new Pool({
        host: "db",
        port: parseInt(process.env.POSTGRES_PORT as string),
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    });
}

export const db = getDbPool();

export const createViewConfiguration = async (viewConfiguration: ViewConfiguration) => {
    let result = await db.query('INSERT INTO configurations (name, ingestor_task_id, text_extractor_task_id, summarizer_task_id, embedder_task_id, dimensionality_reducer_task_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [
            viewConfiguration.name,
            viewConfiguration.ingestorTaskId,
            viewConfiguration.textExtractorTaskId,
            viewConfiguration.summarizerTaskId,
            viewConfiguration.embedderTaskId,
            viewConfiguration.dimensionalityReducerTaskId
        ]
    );

    if (result.rowCount != 1) {
        throw new Error(`Expected 1 row to be inserted, got ${result.rowCount}`);
    }

    return result.rows[0].id;
}

export const getLatestConfiguration = async () => {
    const res = await db.query('SELECT id FROM configurations ORDER BY id DESC LIMIT 1');
    if (res.rows.length === 0) {
        throw new Error("No configuration found");
    }
    return res.rows[0].id;
}
