import Task from '../task';
import { Decision } from './decision'

export default abstract class Ingestor extends Task {
    constructor(type: string, name: string) {
        super('ingestor', type, name);
    }

    protected async saveDecisions(decisions: Decision[]) {
        this.logger.info(`Saving ${decisions.length} decisions...`);
        await this.db.query('START TRANSACTION');
        for (let decision of decisions) {
            await this.db.query('INSERT INTO decisions (ingestor_task_id, ada, document_url, metadata) VALUES ($1, $2, $3, $4)', [
                this.id,
                decision.ada,
                decision.documentUrl,
                decision.metadata,
            ]);
        }
        await this.db.query('COMMIT');
    }
}