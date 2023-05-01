import Embedder from './embedder';
import dotenv from 'dotenv';
import { generateCohereEmbedding, sleep } from '../../utils';
import { Embedding } from './embedding';


dotenv.config();

const IMPLEMENTATION = "cohere-one-batch-embedder";
const REQUIRED_PARAMS = ['textExtractorTaskId'];
const MODEL = 'multilingual-22-12';
const BATCH_SIZE = 50;
const SLEEP_AFTER_BATCH_SEC = 30;


class CohereOneBatchEmbedder extends Embedder {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: any): Promise<void> {
        this.logger.debug('Starting cohere one batch embedder');
        if (!this.params) {
            throw new Error('Cohere one batch embedder params are not set');
        }
        if (REQUIRED_PARAMS.some((p) => !params[p as keyof typeof this.params])) {
            throw new Error(`Missing required params: ${REQUIRED_PARAMS.join(', ')}`);
        }
        if (!this.getTaskById(params.textExtractorTaskId)) {
            throw new Error(`Text extractor with id ${params.textExtractorTaskId} not found`);
        }

        let failures = 0;
        for (let offset = 0; true; offset += BATCH_SIZE) {
            let inputDocuments = await this.db.query('SELECT t.id, text, d.metadata AS decision_metadata FROM texts AS t LEFT JOIN decisions AS d ON d.id = t.decision_id WHERE text_extractor_task_id = $1  ORDER BY id LIMIT $2 OFFSET $3', [params.textExtractorTaskId, BATCH_SIZE, offset]);
            if (inputDocuments.rows.length === 0) {
                break;
            }

            let embeddings: Embedding[] = [];

            for (let inputDocument of inputDocuments.rows) {
                let embedding = await this.getEmbedding(inputDocument.text, inputDocument.decision_metadata);

                if (!embedding) {
                    this.logger.warn(`Failed to generate embedding for text ${inputDocument.id}`);
                    failures++;
                    continue;
                }

                embeddings.push({
                    textId: inputDocument.id,
                    embedding: embedding,
                    seq: 1
                });
            }

            await this.saveEmbeddings(embeddings);

            this.logger.info(`Processed ${offset + embeddings.length} texts`);
            this.updateMetrics({ texts_processed: offset + embeddings.length, failures: failures });
            await sleep(SLEEP_AFTER_BATCH_SEC * 1000); // stupid cohere rate limiting
        }

        this.logger.debug('Finished cohere one batch embedder');
    }

    private async getEmbedding(text: any, decisionMetadata: any): Promise<number[]> {
        let { value, cost } = await generateCohereEmbedding(MODEL, this.getTextToEmbed(text, decisionMetadata));
        return value;
    }

    private getTextToEmbed(text: any, decisionMetadata: any): string {
        var subject = decisionMetadata.subject;
        if (!subject) {
            this.logger.warn(`Text ${text.id} has no subject`);
            subject = '';
        }

        return `${subject}: ${text.text}`
    }

}

export default [IMPLEMENTATION, CohereOneBatchEmbedder];