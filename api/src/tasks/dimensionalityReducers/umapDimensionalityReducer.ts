import DimensionalityReducer from './dimensionalityReducer';
import { SemanticPoint } from './semanticPoint';
import { UMAP } from 'umap-js';

const IMPLEMENTATION = "umap-dimensionality-reducer";
const REQUIRED_PARAMS: string[] = ["embedderTaskId"];
const SAMPLE_SIZE = 1000;

class UmapDimensionalityReducer extends DimensionalityReducer {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: any): Promise<void> {
        this.logger.debug('Starting UMAP dimensionality reducer');
        if (!this.params) {
            throw new Error('Cohere one batch embedder params are not set');
        }
        if (REQUIRED_PARAMS.some((p) => !params[p as keyof typeof this.params])) {
            throw new Error(`Missing required params: ${REQUIRED_PARAMS.join(', ')}`);
        }
        if (!this.getTaskById(params.embedderTaskId)) {
            throw new Error(`Embedder with id ${params.embedderTaskId} not found`);
        }

        let client = await this.getPgVectorAwareDbClient();

        let inputDocuments = await client.query(
            //TODO: this query may be slow as things scale; it can be optimized
            `SELECT
                decision_id,
                decision_ada,
                AVG(embedding) AS embedding
            FROM (
                SELECT 
                    e.id AS embedding_id,
                    embedding,
                    d.id AS decision_id,
                    d.ada AS decision_ada
                FROM embeddings AS e
                LEFT JOIN texts AS t ON t.id = e.text_id
                LEFT JOIN decisions AS d ON d.id = t.decision_id
                WHERE embedder_task_id = $1
            ) AS emb
            GROUP BY decision_id, emb.decision_ada
            ORDER BY RANDOM() LIMIT $2
            `,
            [params.embedderTaskId, SAMPLE_SIZE]);

        let documentCount = inputDocuments.rows.length;
        let failures = 0;

        let semanticPoints = await this.getSemanticPoints(inputDocuments.rows);

        await this.saveSemanticPoints(semanticPoints);
        this.updateMetrics({ documents_processed: documentCount });
        client.release()
    }

    private async getSemanticPoints(rows: any[]): Promise<SemanticPoint[]> {
        const umap = new UMAP();
        const result = await umap.fitAsync(rows, epochNumber => {
            if (epochNumber % 50 === 0) {
                this.logger.info(`Epoch ${epochNumber} complete.`);
            }
            return true;
        });

        return result.map((r, ind) => {
            return {
                decisionId: rows[ind].decision_id,
                decisionAda: rows[ind].decision_ada,
                x: r[0],
                y: r[1]
            }
        });
    }


}

export default [IMPLEMENTATION, UmapDimensionalityReducer];