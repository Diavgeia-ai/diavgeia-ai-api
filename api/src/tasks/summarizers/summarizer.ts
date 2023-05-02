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
            await this.db.query('INSERT INTO summaries (summarizer_task_id, text_id, summary) VALUES ($1, $2, $3)', [
                this.id,
                summary.textId,
                summary.summary,
            ]);
        }
        await this.db.query('COMMIT');
    }
}