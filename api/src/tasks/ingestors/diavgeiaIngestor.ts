import TaskConstructor from '../taskConstructor';
import Ingestor from './ingestor';
import Task from '../task';
import Logger from '../../logger';
import dotenv from 'dotenv';
import { DiavgeiaQuery, diavgeiaSearchQuery, sleep } from '../../utils';
import { Decision } from './decision';
import axios from 'axios';

dotenv.config();

const IMPLEMENTATION = 'diavgeia-ingestor';
const REQUIRED_PARAMS = ['startDate', 'endDate', 'decisionTypes'];
const DIAVGEIA_PAGE_SIZE = 50;

class DiavgeiaIngestor extends Ingestor {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: any): Promise<void> {
        this.logger.debug('Starting Diavgeia ingestor');
        if (!this.params) {
            throw new Error('Diavgeia ingestor params are not set');
        }
        if (REQUIRED_PARAMS.some((p) => !params[p as keyof typeof this.params])) {
            throw new Error(`Missing required params: ${REQUIRED_PARAMS.join(', ')}`);
        }
        if (params.only) {
            this.logger.info(`Only fetching first ${params.only} decisions`);
        }

        const diavgeiaQuery: DiavgeiaQuery = {
            decisionTypeUid: params.decisionTypes.split(","),
            issueDate: [
                `DT(${params.startDate}T00:00:00)`,
                `DT(${params.endDate}T00:00:00)`,
            ],
        };

        let total = await this.getTotalDecisionCount(diavgeiaQuery);
        this.logger.info(`${total} total decisions for query`);

        for (let page = 0; true; page++) {
            let pageSize = DIAVGEIA_PAGE_SIZE;
            if (params.only && (page + 1) * DIAVGEIA_PAGE_SIZE > params.only) {
                pageSize = Math.max(0, params.only - page * DIAVGEIA_PAGE_SIZE);
                if (pageSize === 0) {
                    this.logger.info(`No more decisions, stopping...`);
                    break;
                }
                this.logger.info(`Only fetching first ${pageSize} decisions of the next page`);
            }

            let decisions = await this.fetchDiavgeiaPage(diavgeiaQuery, page, pageSize);
            if (decisions.length === 0) {
                this.logger.info(`No more decisions, stopping...`);
                break;
            }

            await this.saveDecisions(decisions);
            let decisionsProcessed = decisions.length + page * DIAVGEIA_PAGE_SIZE;
            this.updateMetrics({
                decisions_processed: decisionsProcessed,
                decisions_total: total,
            });

            this.logger.info(`Processed ${decisionsProcessed} decisions out of ${total} (${decisionsProcessed / total * 100}%)`);
        }

        this.logger.debug('Finished Diavgeia ingestor');
    }


    private async fetchDiavgeiaPage(diavgeiaQuery: DiavgeiaQuery, page: number, pageSize = 500): Promise<Decision[]> {
        let query = diavgeiaSearchQuery(diavgeiaQuery, page, pageSize);
        this.logger.log("info", `Fetching diavgeia page ${page} (${query})...`);
        let response = await axios.get(query, {});

        let data = response.data;
        let decisions = data.decisions.map(this.extractData.bind(this));

        return decisions;
    }

    private extractData(diavgeiaDecisionObj: { [key: string]: any }): Decision {
        let {
            protocolNumber,
            subject,
            issueDate,
            organizationId,
            signerIds,
            unitIds,
            decisionTypeId,
            thematicCategoryIds,
            ada,
            publishTimestamp,
            submissionTimestamp,
            documentUrl
        } = diavgeiaDecisionObj;

        let {
            financialYear,
            budgetType,
            amountWithVAT,
            amountWithKae
        } = diavgeiaDecisionObj.extraFieldValues;

        if (!documentUrl) {
            documentUrl = `https://diavgeia.gov.gr/doc/${ada}`;
        }

        let metadata = {
            protocolNumber,
            subject,
            issueDate,
            organizationId,
            signerIds,
            unitIds,
            decisionTypeId,
            thematicCategoryIds,
            ada,
            publishTimestamp,
            submissionTimestamp,
            financialYear,
            budgetType,
            amountWithVAT,
            amountWithKae
        };

        return {
            ada,
            documentUrl,
            metadata
        };
    }

    private async getTotalDecisionCount(diavgeiaQuery: DiavgeiaQuery) {
        let query = diavgeiaSearchQuery(diavgeiaQuery, 0, 1);
        this.logger.log("info", `Fetching diavgeia total count (${query})...`);
        let response = await axios.get(query, {});

        return response.data.info.total;
    }
}

export default [IMPLEMENTATION, DiavgeiaIngestor];