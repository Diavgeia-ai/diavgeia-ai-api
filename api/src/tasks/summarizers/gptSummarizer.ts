import Summarizer from './summarizer';
import { Summary } from './summary';
import { generateChatGPTResponse } from '../../utils';
import { ModelName } from '../../types';
import { RateLimiter } from 'limiter';

const IMPLEMENTATION = "gpt-summarizer";
const REQUIRED_PARAMS = ['textExtractorTaskId'];
const BATCH_SIZE = 20;
const openAiLimiter = new RateLimiter({
    tokensPerInterval: 4,
    interval: 1000 * 60
});

class GptSummarizer extends Summarizer {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: any): Promise<void> {
        this.logger.debug(`Starting ${IMPLEMENTATION}`);
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
            let inputTexts = await this.db.query('SELECT t.id, d.ada AS ada, text, d.metadata AS decision_metadata FROM texts AS t LEFT JOIN decisions AS d ON d.id = t.decision_id WHERE text_extractor_task_id = $1  ORDER BY id LIMIT $2 OFFSET $3', [params.textExtractorTaskId, BATCH_SIZE, offset]);
            if (inputTexts.rows.length === 0) {
                break;
            }

            let summaryObjs = await Promise.all(inputTexts.rows.map((inputText) => this.getSummary(inputText.ada, inputText.text)));
            let summaries: Summary[] = summaryObjs.filter((s) => s !== null).map((summary, index) => {
                return {
                    textId: inputTexts.rows[index].id,
                    decisionAda: inputTexts.rows[index].ada,
                    summary: summary.summary,
                    extractedData: summary
                };
            });

            failures += summaryObjs.filter((s) => s === null).length;

            await this.saveSummaries(summaries);

            this.logger.info(`Processed ${offset + summaries.length} texts`);
            this.updateMetrics({ texts_processed: offset + summaries.length, failures: failures });
        }

        this.logger.info('Finished ${IMPLEMENTATION}');
    }

    private async getSummary(ada: string, text: any): Promise<any | null> {
        let systemPrompt = this.getPrompt(ada);
        let userPrompt = `Aκολουθεί το κείμενο της πράξης με ΑΔΑ ${ada}: \n----\n${text}`;
        var value = null, cost = null;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await openAiLimiter.removeTokens(1);
                ({ value, cost } = await generateChatGPTResponse(systemPrompt, userPrompt));
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


        try {
            var parsedSummary = JSON.parse(value);
        } catch (e: any) {
            this.logger.error(`Failed to parse summary: ${value}`);
            return null;
        }

        if (!parsedSummary.summary) {
            this.logger.error(`Summary is missing summary field: ${value}`);
            return null;
        }

        this.logger.debug(`Summary: ${value}`);
        return parsedSummary;
    }

    private getPrompt(ada: string): string {
        return `
            Είσαι σύστημα που εξάγει δεδομένα και περιλήψεις από το κείμενο πράξεων αναρτημένες στη διαύγεια.
            Ο χρήστης σου δίνει κείμενα πράξεων, και εσύ απαντάς.
            All your responses will be in JSON, in the format that I will describe.
            
            Τα δεδομένα που θέλω να εξάγεις, οι τύποι τους και οι περιγραφές τους είναι τα εξής:
            - lawRef: string[] - οι νόμοι στους οποίους αναφέρεται η πράξη (π.χ. "Ν. 1234/2021")
            - adaRef: string[] - Οι ΑΔΑ (αριθμοί διαδυκτιακής ανάρτησης) άλλων πράξεων στις οποίες αναφέρεται αυτή η πράξη (π.χ. "ΒΓΔ23ΟΞΞ-ΓΞΔ")
            - summary: string - Περίληψη της πράξης, περισσότερα για αυτό παρακάτω.
            - awardAmount: number - Το χρηματικό ποσό του οποίου επωφελείται ο δικαιούχος σε ευρώ.
            - beneficiary: string - Η εταιρία, το πρόσωπο ή οργανισμός που επωφελείται του ποσού.

            Καθένα από τα παραπάνω μπορεί να είναι και null. Τα τελευταία δύο πρέπει να είναι null αν η πράξη δε δίνει χρήματα σε κάποιον.
            
            Περίληψη: μια σύντομη περίληψη σε 1 πρόταση στα ελληνικά.
            Περιττές φράσεις όπως "Η πράξη περιγράφει..." πρέπει να παραλείπονται.
            Η περίληψη να ξεκινάει με ένα ρήμα, για παράδειγμα "Εγκρίνεται..." ή "Ανατίθεται..." ή "Αποφασίζεται..."
            Tυχόν αναφορές σε νομους και παλαιότερες αποφάσεις πάνω στις οποίες βασίζεται η πράξη πρέπει να παραλείπονται από τη περίληψη.

            Your response must be based solely on the text given. Respond only in JSON in the format described above.
            `;
    }

}

export default [IMPLEMENTATION, GptSummarizer];