import Embedder from './embedder';
import dotenv from 'dotenv';
import { generateCohereEmbeddings, sleep } from '../../utils';
import { Embedding } from './embedding';

dotenv.config();

const IMPLEMENTATION = "cohere-embedder";
const REQUIRED_PARAMS = ['textExtractorTaskId'];
const MODEL = 'multilingual-22-12';
const BATCH_SIZE = 50;

class CohereEmbedder extends Embedder {
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
        let embeddingCount = 0;
        let textsCount = 0;
        for (let offset = 0; true; offset += BATCH_SIZE) {
            let inputDocuments = await this.db.query(`
                SELECT
                    t.id,
                    text,
                    d.metadata as decision_metadata,
                    s.extracted_data as extracted_data,
                    s.summary AS summary
                FROM texts AS t
                LEFT JOIN decisions AS d ON d.id = t.decision_id
                LEFT JOIN summaries AS s ON s.text_id = t.id
                WHERE text_extractor_task_id = $1 
                ORDER BY id
                LIMIT $2 OFFSET $3`,
                [params.textExtractorTaskId, BATCH_SIZE, offset]);
            if (inputDocuments.rows.length === 0) {
                break;
            }

            let embeddings: Embedding[] = [];

            for (let inputDocument of inputDocuments.rows) {
                let textEmbeddings = await this.getEmbeddings(inputDocument.text, inputDocument.decision_metadata, inputDocument.summary, inputDocument.extracted_data);

                if (!textEmbeddings) {
                    this.logger.warn(`Failed to generate embeddings for text ${inputDocument.id}`);
                    failures++;
                    continue;
                }

                textEmbeddings.forEach((embedding, index) => {
                    embeddingCount++;
                    embeddings.push({
                        textId: inputDocument.id,
                        embedding: embedding,
                        seq: index + 1
                    });
                });
                textsCount++;
            }

            await this.saveEmbeddings(embeddings);

            this.logger.info(`Processed ${textsCount} texts with ${embeddingCount} embeddings`);
            this.updateMetrics({ texts_processed: textsCount, failures: failures, embeddings_generated: embeddingCount });

            if (process.env.COHERE_RATE_LIMITING === 'true') {
                await sleep(30 * 1000);
            }
        }

        this.logger.debug('Finished cohere one batch embedder');
    }

    private async getEmbeddings(text: string, decisionMetadata: any, summary: string, extracted_data: any): Promise<number[][]> {
        let beneficiary = '';
        if (extracted_data) {
            beneficiary = extracted_data.beneficiary;
        }

        let textsToEmbed = [summary, decisionMetadata.subject, beneficiary, ...text.split("[PAGE_BREAK]").slice(0, 10)];
        let { value, cost } = await generateCohereEmbeddings(MODEL, textsToEmbed);
        return value;
    }

    private getTextToEmbed(text: any, decisionMetadata: any): string {
        var subject = decisionMetadata.subject;
        if (!subject) {
            this.logger.warn(`Text ${text.id} has no subject`);
            subject = '';
        }

        return `${subject}:\n${text}`
    }

}

export default [IMPLEMENTATION, CohereEmbedder];