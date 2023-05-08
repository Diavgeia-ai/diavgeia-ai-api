import Task from '../task';
import { Embedding } from './embedding';
//@ts-ignore
import pgvector from 'pgvector/pg';

export default abstract class Embedder extends Task {
    dbTypeRegistered = false;

    constructor(type: string, name: string) {
        super('embedder', type, name);
    }

    protected async saveEmbeddings(embeddings: Embedding[]) {
        let client = await this.getPgVectorAwareDbClient();
        this.logger.info(`Saving ${embeddings.length} embeddings...`);
        await client.query('START TRANSACTION');
        for (let embedding of embeddings) {
            await client.query('INSERT INTO embeddings (embedder_task_id, decision_ada, text_id, embedding_seq, embedding) VALUES ($1, $2, $3, $4, $5)', [
                this.id,
                embedding.decisionAda,
                embedding.textId,
                embedding.seq,
                pgvector.toSql(embedding.embedding)
            ]);
        }
        await client.query('COMMIT');
        client.release();
    }
}