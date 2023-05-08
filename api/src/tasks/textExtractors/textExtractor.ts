import Task from '../task';
import { DocumentText } from './documentText';



export default abstract class TextExtractor extends Task {
    constructor(type: string, name: string) {
        super('text-extractor', type, name);
    }

    protected async saveTexts(texts: DocumentText[]) {
        this.logger.info(`Saving ${texts.length} texts...`);
        await this.db.query('START TRANSACTION');
        for (let text of texts) {
            await this.db.query('INSERT INTO texts (text_extractor_task_id, decision_ada, decision_id, text, document_metadata) VALUES ($1, $2, $3, $4, $5)', [
                this.id,
                text.decisionAda,
                text.decisionId,
                text.text?.replaceAll(/\x00/g, ''),
                text.metadata
            ]);
        }
        await this.db.query('COMMIT');
    }
}