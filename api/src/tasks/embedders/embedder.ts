import Task from '../task';
import { Embedding } from './embedding';
//@ts-ignore
import pgvector from 'pgvector/pg';

export default abstract class Embedder extends Task {
    constructor(type: string, name: string) {
        super('embedder', type, name);
    }

    protected async saveEmbeddings(embeddings: Embedding[]) {
        this.logger.info(`Saving ${embeddings.length} embeddings...`);
        let client = await this.db.connect();
        await pgvector.registerType(client);
        await this.db.query('START TRANSACTION');
        for (let embedding of embeddings) {
            await this.db.query('INSERT INTO embeddings (embedder_task_id, text_id, embedding_seq, embedding) VALUES ($1, $2, $3, $4)', [
                this.id,
                embedding.textId,
                embedding.seq,
                pgvector.toSql(embedding.embedding)
            ]);
        }
        await this.db.query('COMMIT');
    }
}