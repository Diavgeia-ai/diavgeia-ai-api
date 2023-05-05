import TaskConstructor from '../taskConstructor';
import Ingestor from './ingestor';
import Task from '../task';
import Logger from '../../logger';
import dotenv from 'dotenv';
import { DiavgeiaQuery, diavgeiaOrganizationUrl, diavgeiaSearchQuery, diavgeiaSignerUrl, diavgeiaUnitUrl, sleep } from '../../utils';
import { Decision } from './decision';
import axios from 'axios';
import { Organization } from './organization';
import { Unit } from './unit';
import { Signer } from './signer';

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

        let organizationIds = new Set<string>();
        let signerIds = new Set<string>();
        let unitIds = new Set<string>();

        let difference = (a: Set<any>, b: Set<any>) => new Set([...a].filter(x => !b.has(x)));


        for (let page = 0; true; page++) {
            let batchOrganizationIds = new Set<string>();
            let batchSignerIds = new Set<string>();
            let batchUnitIds = new Set<string>();

            let pageSize = DIAVGEIA_PAGE_SIZE;
            if (params.only && (page + 1) * DIAVGEIA_PAGE_SIZE > params.only) {
                pageSize = Math.max(0, params.only - page * DIAVGEIA_PAGE_SIZE);
                if (pageSize === 0) {
                    this.logger.info(`No more decisions, stopping...`);
                    break;
                }
                this.logger.info(`Only processing the  first ${pageSize} decisions of the next page`);
            }

            // Extract decisions
            let decisions = await this.fetchDiavgeiaPage(diavgeiaQuery, page, DIAVGEIA_PAGE_SIZE);
            decisions = decisions.slice(0, pageSize);
            if (decisions.length === 0) {
                this.logger.info(`No more decisions, stopping...`);
                break;
            }

            //Extract organization ids, signer ids and unit ids
            decisions.forEach((decision) => batchOrganizationIds.add(decision.metadata.organizationId));
            decisions.map((decision) => decision.metadata.signerIds).flat()
                .forEach((signerId) => batchSignerIds.add(signerId));
            decisions.map((decision) => decision.metadata.unitIds).flat()
                .forEach((unitId) => batchUnitIds.add(unitId));

            let newOrganizationIds = difference(batchOrganizationIds, organizationIds);
            let newSignerIds = difference(batchSignerIds, signerIds);
            let newUnitIds = difference(batchUnitIds, unitIds);

            let organizations = await this.fetchOrganizations(Array.from(newOrganizationIds));
            let units = await this.fetchUnits(Array.from(newUnitIds));
            let signers = await this.fetchSigners(Array.from(newSignerIds));

            await this.saveAll(decisions, organizations, units, signers);

            // Remember organization, signed and unit ids
            newOrganizationIds.forEach((id) => organizationIds.add(id));
            newSignerIds.forEach((id) => signerIds.add(id));
            newUnitIds.forEach((id) => unitIds.add(id));

            // Update metrics
            let decisionsProcessed = decisions.length + page * DIAVGEIA_PAGE_SIZE;
            this.updateMetrics({
                decisions_processed: decisionsProcessed,
                organizations_processed: organizationIds.size,
                units_processed: unitIds.size,
                signers_processed: signerIds.size,
                decisions_total: total,
            });

            this.logger.info(`Processed ${decisionsProcessed} decisions out of ${total} (${decisionsProcessed / total * 100}%)`);
        }

        this.logger.debug('Finished Diavgeia ingestor');
    }

    private async fetchOrganizations(organizationIds: string[]): Promise<Organization[]> {
        this.logger.info(`Fetching ${organizationIds.length} organizations...`);

        let fetchPromises = organizationIds.map(async (organizationId) => {
            let url = diavgeiaOrganizationUrl(organizationId);
            let response = await axios.get(url, {});
            let data = response.data;
            return {
                diavgeiaId: data.uid,
                name: data.label,
                category: data.category,
                vatNumber: data.vatNumber,
                rawData: data,
            }
        });

        return Promise.all(fetchPromises);
    }

    private async fetchUnits(unitIds: string[]): Promise<Unit[]> {
        this.logger.info(`Fetching ${unitIds.length} units...`);

        let fetchPromises = unitIds.map(async (unitId) => {
            let url = diavgeiaUnitUrl(unitId);
            let response = await axios.get(url, {});
            let data = response.data;
            return {
                diavgeiaId: data.uid,
                name: data.label,
                category: data.category,
                rawData: data,
            };
        });

        return Promise.all(fetchPromises);
    }

    private async fetchSigners(signerIds: string[]): Promise<Signer[]> {
        this.logger.info(`Fetching ${signerIds.length} signers...`);

        let fetchPromises = signerIds.map(async (signerId) => {
            let url = diavgeiaSignerUrl(signerId);
            let response = await axios.get(url, {});
            let data = response.data;
            return {
                diavgeiaId: data.uid,
                firstName: data.firstName,
                lastName: data.lastName,
                organizationId: data.organizationId,
                rawData: data,
            };
        });

        return Promise.all(fetchPromises);
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
            metadata,
            organizationDiavgeiaId: organizationId,
            signerIds,
            unitIds,
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