import Summarizer from './summarizer';
import { Summary } from './summary';
import { generateOpenAIResponse } from '../../utils';
import { ModelName } from '../../types';

const IMPLEMENTATION = "gpt-summarizer";
const REQUIRED_PARAMS = ['textExtractorTaskId'];
const MODEL = 'gpt-4';
const BATCH_SIZE = 20;

class GptSummarizer extends Summarizer {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: any): Promise<void> {
        this.logger.debug('Starting ${IMPLEMENTATION}');
        if (!this.params) {
            throw new Error(`${IMPLEMENTATION} params are not set`);
        }
        if (REQUIRED_PARAMS.some((p) => !params[p as keyof typeof this.params])) {
            throw new Error(`Missing required params: ${REQUIRED_PARAMS.join(', ')}`);
        }
        if (!this.getTaskById(params.textExtractorTaskId)) {
            throw new Error(`Text extractor with id ${params.textExtractorTaskId} not found`);
        }

        let failures = 0;
        for (let offset = 0; true; offset += BATCH_SIZE) {
            let inputTexts = await this.db.query('SELECT t.id, text, d.metadata AS decision_metadata FROM texts AS t LEFT JOIN decisions AS d ON d.id = t.decision_id WHERE text_extractor_task_id = $1  ORDER BY id LIMIT $2 OFFSET $3', [params.textExtractorTaskId, BATCH_SIZE, offset]);
            if (inputTexts.rows.length === 0) {
                break;
            }

            let summaryTexts = await Promise.all(inputTexts.rows.map((inputText) => this.getSummary(inputText.text)));
            let summaries: Summary[] = summaryTexts.filter((s) => s !== null).map((summaryText, index) => {
                return {
                    textId: inputTexts.rows[index].id,
                    summary: summaryText
                } as Summary;
            });

            failures += summaryTexts.filter((s) => s === null).length;

            await this.saveSummaries(summaries);

            this.logger.info(`Processed ${offset + summaries.length} texts`);
            this.updateMetrics({ texts_processed: offset + summaries.length, failures: failures });
        }

        this.logger.info('Finished ${IMPLEMENTATION}');
    }

    private async getSummary(text: any): Promise<string | null> {
        let prompt = this.getPrompt(text);
        var value = null, cost = null;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                ({ value, cost } = await generateOpenAIResponse(process.env.OPENAI_COMPLETION_MODEL as ModelName, prompt, 0.2))
                break;
            } catch (e: any) {
                this.logger.error(`Error generating summary: ${e.message}`);

                continue;
            }
        }

        if (!value) {
            this.logger.error(`Failed to generate summary`);
            return null;
        }

        this.logger.debug(`Summary: ${value}`);
        return value;
    }

    private getPrompt(text: any): string {
        return `
            Παρακάτω το κείμενο μιας πράξης αναρτημένης στο πρόγραμμα Δι@υγεια. Γράψε μια πολύ σύντομη περίληψη σε 1 (το πολύ 2) προτάσεις.
            Η περίλιψη θα φαίνεται στα αποτελέσματα μιας μηχανής αναζήτησης, οπότε υποκείμενα και περιττές φράσεις όπως "Η πράξη περιγράφει..." πρέπει να παραλείπονται.
            ---
            ${text}
            ---
            Περίληψη:`;
    }

}

export default [IMPLEMENTATION, GptSummarizer];