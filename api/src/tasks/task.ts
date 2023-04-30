import { Pool, PoolClient } from "pg";
import Logger from "../logger";
import path from 'path';
import { options } from "yargs";

interface TaskFilter {
    type?: string;
    implementation?: string;
    name?: string;
    version?: number;
    status?: string;
}

type TaskStatus = 'running' | 'succeeded' | 'failed';
type TaskType = 'ingestor' | 'text-extractor' | 'embedder' | 'reducer';

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
        this.db = new Pool({
            host: "db",
            port: parseInt(process.env.POSTGRES_PORT as string),
            database: process.env.POSTGRES_DB,
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
        });
    }

    public async start(params: object, version?: number): Promise<void> {
        this.params = params;
        if (version) {
            this.version = version;
        } else {
            console.log("getting next v");
            this.version = await this.getNextVersion();
            console.log("got next v");
        }

        console.log("getting task");
        const existingTask = await this.count({ type: this.type, implementation: this.implementation, name: this.name, version: this.version });
        console.log("got task");
        if (existingTask > 0) {
            throw new Error(`A task with the same name and version already exists: ${this.identifier()}}`);
        }

        this.status = 'running';
        this.createdAt = new Date();
        this.updatedAt = new Date();

        console.log("saving");
        await this.save();
        console.log("saved");
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
}

export default Task;