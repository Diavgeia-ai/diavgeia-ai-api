import Task from '../task';
import { Summary } from './summary'

export default abstract class Summarizer extends Task {
    constructor(type: string, name: string) {
        super('summarizer', type, name);
    }

    protected async saveSummaries(summaries: Summary[]) {
        this.logger.info(`Saving ${summaries.length} summaries...`);
        await this.db.query('START TRANSACTION');
        for (let summary of summaries) {
            await this.db.query('INSERT INTO summaries (summarizer_task_id, decision_ada, text_id, summary, extracted_data) VALUES ($1, $2, $3, $4, $5)', [
                this.id,
                summary.decisionAda,
                summary.textId,
                summary.summary,
                summary.extractedData
            ]);
        }
        await this.db.query('COMMIT');
    }
}