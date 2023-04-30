import TaskConstructor from '../taskConstructor';
import TextExtractor from './textExtractor';
import Task from '../task';
import Logger from '../../logger';
import dotenv from 'dotenv';
import axios from 'axios';
import { DocumentText } from './documentText';
import { getDocument } from 'pdfjs-dist-legacy';
import { isWhitespace } from '../../utils';

dotenv.config();

const IMPLEMENTATION = "simple-text-extractor";
const REQUIRED_PARAMS = ['ingestorTaskId'];
const BATCH_SIZE = 50;


class SimpleTextExtractor extends TextExtractor {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: any): Promise<void> {
        this.logger.debug('Starting simple text extractor');
        if (!this.params) {
            throw new Error('Simple text extractor params are not set');
        }
        if (REQUIRED_PARAMS.some((p) => !params[p as keyof typeof this.params])) {
            throw new Error(`Missing required params: ${REQUIRED_PARAMS.join(', ')}`);
        }
        if (!this.getTaskById(params.ingestorTaskId)) {
            throw new Error(`Ingestor task with id ${params.ingestorTaskId} not found`);
        }

        await this.db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        for (let offset = 0; true; offset += BATCH_SIZE) {
            let inputDocuments = await this.db.query('SELECT id, metadata FROM decisions WHERE ingestor_task_id = $1 ORDER BY id LIMIT $2 OFFSET $3', [params.ingestorTaskId, BATCH_SIZE, offset]);
            if (inputDocuments.rows.length === 0) {
                break;
            }

            let texts: DocumentText[] = []

            for (let inputDocument of inputDocuments.rows) {
                let [text, metadata] = await this.extractTextAndMetadata(inputDocument.metadata);
                texts.push({
                    decisionId: inputDocument.id,
                    text: text,
                    metadata: metadata
                });
            }

            await this.saveTexts(texts);

            console.log(`Processed ${offset + texts.length} documents`);
            this.updateMetrics({ documents_processed: offset + texts.length });
        }
        await this.db.query('COMMIT');

        this.logger.debug('Finished simple text extractor');
    }

    private async extractTextAndMetadata(metadata: any): Promise<[string | null, any]> {
        let documentMetadata: any = {};
        let documentUrl = metadata.documentUrl;
        if (!documentUrl || documentUrl === '') {
            this.logger.warn(`Document ${metadata.id} has no documentUrl`);
            documentMetadata.hasDocument = false;
            return [null, documentMetadata];
        }

        this.logger.info(`Extracting text from ${documentUrl}`);
        try {
            var doc = await getDocument({
                url: encodeURI(documentUrl),
                useSystemFonts: true
            }).promise;
        } catch (e) {
            this.logger.warn(`Failed to extract text from ${documentUrl}: ${e}`);
            documentMetadata.textExtractionFailure = true;
            return [null, documentMetadata];
        }

        documentMetadata.pageCount = doc.numPages;

        let pageTexts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
            let page = await doc.getPage(i);
            let textContent = await page.getTextContent();
            pageTexts.push(textContent.items.map((x) => {
                if ("str" in x) return x.str;
                else return ""; // will never happen
            }).join(" "));
        }

        if (isWhitespace(pageTexts.join(""))) {
            this.logger.warn(`Document ${documentUrl} has empty text`);
            documentMetadata.textExtractionFailure = true;
            pageTexts = [];
        } else {
            documentMetadata.textExtractionFailure = false;
        }

        let text = pageTexts.join("\n");

        let pdfMetadata = await doc.getMetadata();
        if (pdfMetadata.metadata) {
            let metadataObj = pdfMetadata.metadata.getAll();
            for (let key in metadataObj) {
                documentMetadata[`pdfMetadata_${key}`] = metadataObj[key as keyof typeof metadataObj];
            }
        }
        for (let key in pdfMetadata.info) {
            documentMetadata[`pdfInfo_${key}`] = pdfMetadata.info[key as keyof typeof pdfMetadata.info];
        }

        return [text, documentMetadata];
    }
}

export default [IMPLEMENTATION, SimpleTextExtractor];