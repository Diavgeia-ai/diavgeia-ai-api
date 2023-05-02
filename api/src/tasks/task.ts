import { Pool, PoolClient } from "pg";
import Logger from "../logger";
import path from 'path';
import { options } from "yargs";
//@ts-ignore
import pgvector from 'pgvector/pg';
import { getDbPool } from "../db";

interface TaskFilter {
    type?: string;
    implementation?: string;
    name?: string;
    version?: number;
    status?: string;
}

type TaskStatus = 'running' | 'succeeded' | 'failed';
type TaskType = 'ingestor' | 'text-extractor' | 'embedder' | 'dimensionality-reducer' | 'summarizer';

abstract class Task {
    // Common properties and methods for all tasks
    id?: number;
    type: TaskType;
    implementation: string;
    name: string;
    version?: number;
    status?: string;
    createdAt?: Date;
    updatedAt?: Date;
    params?: object;
    metrics?: object;
    protected db: Pool;
    protected logger: Logger;

    protected abstract run(params: object): Promise<void>;

    constructor(type: TaskType, implementation: string, name: string) {
        this.type = type;
        this.implementation = implementation;
        this.name = name;

        this.logger = new Logger(implementation);
        this.db = getDbPool();
    }

    public async start(params: object, version?: number): Promise<string> {
        this.params = params;
        if (version) {
            this.version = version;
        } else {
            this.version = await this.getNextVersion();
        }

        const existingTask = await this.count({ type: this.type, implementation: this.implementation, name: this.name, version: this.version });
        if (existingTask > 0) {
            throw new Error(`A task with the same name and version already exists: ${this.identifier()}}`);
        }

        this.status = 'running';
        this.createdAt = new Date();
        this.updatedAt = new Date();

        await this.save();
        this.logger.info(`Started task ${this.identifier()}`);
        this.logger.info(`Params: ${JSON.stringify(params)}`);

        try {
            await this.run(params);
            this.status = 'succeeded';
        } catch (error) {
            this.logger.error(`Task ${this.identifier()} failed: ${error}`);
            this.status = 'failed';
            var err = error;
        } finally {
            this.updatedAt = new Date();
            this.logger.info(`Task ${this.identifier()} with id ${this.id} finished with status ${this.status}`);
            await this.save();
            if (err) throw err;
        }

        return this.id as unknown as string;
    }

    protected async updateMetrics(metrics: object) {
        this.metrics = metrics;
        this.updatedAt = new Date();
        this.logger.info(`New metrics: ${JSON.stringify(metrics)}`);
        await this.save();
    }

    protected identifier() {
        return `${this.type}/${this.implementation}/${this.name}#${this.version}`;
    }

    protected async count(filter: TaskFilter = {}): Promise<number> {
        const query = `
      SELECT COUNT(*) FROM tasks
      WHERE ($1::text IS NULL OR type = $1)
        AND ($2::text IS NULL OR implementation = $2)
        AND ($3::text IS NULL OR name = $3)
        AND ($4::int IS NULL OR version = $4)
        AND ($5::text IS NULL OR status = $5)
    `;

        const result = await this.db.query(query, [filter.type, filter.implementation, filter.name, filter.version, filter.status]);
        return result.rows[0].count;
    }

    protected async getTaskById(id: number): Promise<Task> {
        const result = await this.db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        return result.rows[0];
    }

    private async getNextVersion(): Promise<number> {
        const result = await this.db.query(
            'SELECT MAX(version) FROM tasks WHERE type = $1 AND implementation = $2 AND name = $3',
            [this.type, this.implementation, this.name]
        );

        const maxVersion = result.rows[0].max;
        if (maxVersion === null) {
            return 1;
        }

        return maxVersion + 1;
    }

    private async save() {
        let result = await this.db.query(
            'INSERT INTO tasks (type, implementation, name, version, status, created_at, updated_at, params, metrics) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (type, implementation, name, version) DO UPDATE SET status = $5, updated_at = $7, params = $8, metrics = $9 RETURNING id',
            [this.type, this.implementation, this.name, this.version, this.status, this.createdAt, this.updatedAt, this.params, this.metrics]
        );

        this.id = result.rows[0].id;

        this.logger.debug(`Saved task ${this.identifier()} with id ${this.id}`);
    }

    public async getLastTaskId(type: TaskType): Promise<number> {
        const result = await this.db.query(
            'SELECT MAX(id) FROM tasks WHERE type = $1',
            [type]
        );

        const maxId = result.rows[0].max;
        if (maxId === null) {
            return 1;
        }

        return maxId;
    }

    protected async getPgVectorAwareDbClient(): Promise<PoolClient> {
        let client = await this.db.connect();
        await pgvector.registerType(client);
        return client;
    }
}

export default Task;