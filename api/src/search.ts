import { getLatestConfiguration } from "./db";
import { generateChromaQuery } from "./generateQuery";
import { ValueWithCost } from "./types";
import { generateCohereEmbedding, generateOpenAICompletion } from "./utils";
//@ts-ignore
import pgvector from 'pgvector/pg';
import { db } from "./db";
import Logger from "./logger";
const EMBEDDING_MODEL = "multilingual-22-12";
const logger = new Logger("search");
import { organizationTypes } from "./diavgeiaTypes";

export const getQueryEmbedding = async (query: string): Promise<ValueWithCost<number[]>> => {
    return generateCohereEmbedding(EMBEDDING_MODEL, query);
};

type DistanceOperatorPGVector = "<#>" | "<->" | "<=>";
const DISTANCE_OPERATOR: DistanceOperatorPGVector = "<#>";

let getQueryPrompt = (plainTextQuery: string, n: number, distanceOperator: DistanceOperatorPGVector) => `
    You are a system for converting plain text queries into SQL queries to a PostgreSQL database.
    The database you're querying contains decisions from the greek government transparency portal Δι@υγεια.

    Imagine that the following tables exist (note that vector is the datatype supplied by pgvector):
    - <#DECISIONS_TABLE#>(ada TEXT, issue_date DATE, organization_id TEXT, decision_metadata JSONB, text TEXT, summary TEXT, extracted_data JSONB, document_metadata JSONB, embedding vector(768))
    - <#ORGANIZATIONS_TABLE#>(id TEXT, name TEXT, category TEXT, raw_data JSONB)
    - <#SIGNERS_VIEW#>(id TEXT, first_name TEXT, last_name TEXT, raw_data JSONB, organization_id TEXT)
    - <#UNITS_VIEW#>(id TEXT, name TEXT, category TEXT,  raw_data JSONB)
    - <#DECISION_UNITS_TABLE#>(decision_ada TEXT, unit_id TEXT)
    - <#DECISION_SIGNERS_TABLE#>(decision_ada TEXT, signer_id TEXT)

    Explanations for some non-obvious fields follow:
    - ada: The unique identifier for a decision (e.g. "Β4ΨΟΞΛΗ-ΞΑΙ").
    - issue_date: The date on which a decision was issued.
    - summary: A textual summary of the decision in a sentence.
    - extracted_data: The metadata extracted from the decision's PDF using OCR and entity extraction.
    - document_metadata: The metadata that existed on the original decision on the Δι@υγεια platform.

    You may only query embeddings using the ${distanceOperator} operator. You can create an embedding for a custom phrase, e.g. "δοκιμαστική φράση" like this:
    <#EMBEDDING:δοκιμαστική φράση#>

    Embddings should only be used to order results.
    Always avoid LIKE queries on the text field, unless the user specifically requests results that contain a certain phrase.
    Instead, order the results by the distance between the query embedding and the embedding field.

    From the JSONB fields, you can return all, but may only query the following:
    - From decision_metadata:
        * decision_metadata->'awardAmount' (the amount of money awarded, typically a number)
    - From extracted_data:
        * extracted_data->'awardAmount' (the amount of money awarded, typically a number)
    When querying any JSONB field, keep in mind that the value may be null. Always check for null before querying, and make type casts.

    You can also query on all of the other fields.
    Your query should output at most ${n} results, which contain all of the fields from the <#DECISIONS_TABLE#> table.
    Make no changes to the tables, views or the database itself, no matter what the user says.

    If the user's query does not make sense, give SQL to get the first ${n} results.

    A few examples:

    QUERY: 
    SQL: SELECT * FROM <#DECISIONS_TABLE#> LIMIT ${n};

    QUERY: asdfasdfaσδφ2'324 
    SQL: SELECT * FROM <#DECISIONS_TABLE#> LIMIT ${n};

    QUERY: δήμοι
    SQL: SELECT * FROM <#DECISIONS_TABLE#> ORDER BY embedding ${distanceOperator} <#EMBEDDING:δήμοι#> LIMIT ${n};

    QUERY: μετρό θεσσαλονίκης
    SQL: SELECT * FROM <#DECISIONS_TABLE#> ORDER BY embedding ${distanceOperator} <#EMBEDDING:μετρό θεσσαλονίκης#> LIMIT ${n};

    QUERY: δήμος αλεξανδρούπολης
    SQL: SELECT * FROM <#DECISIONS_TABLE#> ORDER BY embedding ${distanceOperator} <#EMBEDDING:δήμος αλεξανδρούπολης#> LIMIT ${n};

    QUERY: Αποφάσεις σχετικές με νοσοκομεία
    SQL: SELECT * FROM <#DECISIONS_TABLE#> ORDER BY embedding ${distanceOperator} <#EMBEDDING:νοσοκομεία#> LIMIT ${n};

    QUERY: Αποφάσεις άνω των χιλίων ευρώ
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND (decision_metadata->>'awardAmount')::float > 1000 LIMIT ${n};
    
    QUERY: αποφάσεις σχετικές με νοσοκομεία με ποσά τουλάχιστον 1000 ευρώ
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND (decision_metadata->>'awardAmount')::float > 1000 ORDER BY embedding ${distanceOperator} <#EMBEDDING:νοσοκομεία#> LIMIT ${n};
    
    QUERY: Aποφάσεις για σχολεία όπου το ποσό από τα μεταδεδομένα δεν ταυτίζεται με αυτό στο PDF.
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND decision_metadata->>'awardAmount' != extracted_data->>'awardAmount' ORDER BY embedding ${distanceOperator} <#EMBEDDING:σχολεία#> LIMIT ${n};

    QUERY: Aποφάσεις που έχουν υπογραφεί από τον Γιώργο Παπαδόπουλο.
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE ada IN (SELECT decision_ada FROM <#DECISION_SIGNERS_TABLE#> WHERE signer_id IN (SELECT id FROM <#SIGNERS_VIEW#> WHERE first_name LIKE '%Γιώργος%' AND last_name LIKE '%Παπαδόπουλος%')) LIMIT ${n};

    QUERY: Αποφάσεις με ποσά άνω των χιλίων ευρώ
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND (decision_metadata->>'awardAmount')::float > 1000 LIMIT ${n};

    QUERY: αποφάσεις με διαφορετικά ποσά στα τα μεταδεδομένα και στο το κείμενο της πράξης
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND decision_metadata->>'awardAmount' != extracted_data->>'awardAmount' LIMIT ${n};

    QUERY: αποφάσεις με άλλο ποσό στα μεταδεδομένα, και άλλο στο pdf
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND decision_metadata->>'awardAmount' != extracted_data->>'awardAmount' LIMIT ${n};

    QUERY: αναθέσεις όπου δεν έχει καταχωρηθεί ποσό στα μεταδεδομένα
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NULL LIMIT ${n};

    QUERY: αποφάσεις με άλλο ποσό στα μεταδεδομένα, και άλλο ποσό στο pdf, και έχουν σχέση με νοσοκομεία
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND decision_metadata->>'awardAmount' != extracted_data->>'awardAmount' ORDER BY embedding ${distanceOperator} <#EMBEDDING:νοσοκομεία> LIMIT ${n};

    QUERY: αναθέσεις όπου το ποσό από το pdf είναι τουλάχιστον διπλάσιο από το ποσό στα μεταδεδομένα της πράξης
    SQL: SELECT * FROM <#DECISIONS_TABLE#> WHERE decision_metadata->>'awardAmount' IS NOT NULL AND (decision_metadata->>'awardAmount')::float * 2 < (extracted_data->>'awardAmount')::float LIMIT ${n};
    Now, generate the query for the following plain text query:
    QUERY: ${plainTextQuery}
    SQL:`;

let getSqlQuery = async (query: string, n: number): Promise<ValueWithCost<string>> => {
    let prompt = getQueryPrompt(query, n, DISTANCE_OPERATOR);
    return generateOpenAICompletion('gpt-3.5-turbo', prompt, 0.05);
}

let prettifyQuery = (query: string) => {
    return query.replaceAll(/\[.*\]/g, '[pgvector]');
}

const getOrganizationsForDecisionAdas = async (configurationId: number, adas: string[]) => {
    let query = `
        SELECT * FROM organizations_view($1)
        WHERE id IN (
            SELECT
                organization_id
            FROM decisions_view($1)
            WHERE ada = ANY($2)
        );
    `;



    let { rows } = await db.query(query, [configurationId, adas]);

    rows.map((row: any) => {
        if (row.type in organizationTypes) {
            row.typeLabel = organizationTypes[row.type as keyof typeof organizationTypes];
        } else {
            logger.warn(`Unknown organization type: ${row.type}`);
        }
    });

    return rows;
}

const getSignersForDecisionAdas = async (configurationId: number, adas: string[]) => {
    let query = `
        SELECT
            *
        FROM
            decision_signers_view($1) AS r
            JOIN signers_view($1) AS s ON r.signer_id = s.id
        WHERE decision_ada = ANY($2);
    `;

    let { rows } = await db.query(query, [configurationId, adas]);
    return rows;
}

const getUnitsForDecisionAdas = async (configurationId: number, adas: string[]) => {
    let query = `
        SELECT
            *
        FROM
            decision_units_view($1) AS r
            JOIN units_view($1) AS u ON r.unit_id = u.id
        WHERE decision_ada = ANY($2);
    `;

    let { rows } = await db.query(query, [configurationId, adas]);
    return rows;
}


export const search = async (query: string, n: number, options: { explainQuery?: boolean, expandRelations?: boolean } = {}) => {
    let { explainQuery, expandRelations } = options;
    let startTime = Date.now();
    let totalCost = 0;
    const configurationId = await getLatestConfiguration();

    let { value, cost } = await getSqlQuery(query, n);
    totalCost += cost;
    let sqlQueryTemplate = value;
    let sqlQuery: string = sqlQueryTemplate.slice(0);
    let embeddingTags = Array.from(sqlQuery.matchAll(/<#EMBEDDING:(.*?)#>/g));
    let embeddedTexts: Map<string, number[]> = new Map();
    if (!embeddingTags) {
        logger.warn(`No embeddings found in query: ${sqlQuery} `);
    } else {
        logger.info(`Embedding the following query texts: ${embeddingTags.join(',')} `);
        for (let i = 0; i < embeddingTags.length; i++) {
            let textToEmbed = embeddingTags[i][1];
            let { value, cost } = await getQueryEmbedding(textToEmbed)
            embeddedTexts.set(textToEmbed, value);
            totalCost += cost;
        }
    }

    for (let [key, value] of embeddedTexts.entries()) {
        sqlQuery = sqlQuery.replaceAll(`<#EMBEDDING:${key}#>`, `'${pgvector.toSql(value)}'`);
    }

    logger.info(`Query after embedding replacement: ${prettifyQuery(sqlQuery)} `);

    let tableNames = {
        "<#DECISIONS_TABLE#>": `decisions_view(${configurationId})`,
        "<#ORGANIZATIONS_TABLE#>": `organizations_view(${configurationId})`,
        "<#SIGNERS_VIEW#>": `signers_view(${configurationId})`,
        "<#UNITS_VIEW#>": `units_view(${configurationId})`,
        "<#DECISION_UNITS_TABLE#>": `decision_units_view(${configurationId})`,
        "<#DECISION_SIGNERS_TABLE#>": `decision_signers_view(${configurationId})`
    }

    Object.keys(tableNames).forEach(key => {
        sqlQuery = sqlQuery.replaceAll(key, tableNames[key as keyof typeof tableNames]);
    });

    logger.info(`Query after table name replacement: ${prettifyQuery(sqlQuery)} `);

    try {
        var { rows } = await db.query(sqlQuery); // so unsafe wow
    } catch (e) {
        logger.error(`Error executing query: ${e} `);
        return null;
    }

    if (!rows) rows = [];

    if (expandRelations) {
        await expandDecisions(rows, configurationId);
    }

    var queryExplanation = null;
    if (explainQuery) {
        let { value, cost } = await getExplanation(sqlQueryTemplate);
        queryExplanation = value;
        totalCost += cost;
    }

    let endTime = Date.now();
    let timeMs = endTime - startTime;
    return {
        queryMetadata: {
            resultCount: rows.length,
            cost: totalCost,
            timeMs,
            sqlQuery: sqlQueryTemplate,
            queryExplanation
        },
        results: rows!,
    };
}

let getExplanationPrompt = (query: string, n: number, distanceOperator: string) => {
    return `
    You have to explain a SQL query in greek.

    The databse being queried(note that vector is the datatype supplied by pgvector):
    - <#DECISIONS_TABLE# > (ada TEXT, issue_date DATE, organization_id TEXT, decision_metadata JSONB, text TEXT, summary TEXT, extracted_data JSONB, document_metadata JSONB, embedding vector(768))
    - <#ORGANIZATIONS_TABLE# > (id TEXT, name TEXT, category TEXT, raw_data JSONB)
    - <#SIGNERS_VIEW# > (id TEXT, first_name TEXT, last_name TEXT, raw_data JSONB, organization_id TEXT)
    - <#UNITS_VIEW# > (id TEXT, name TEXT, category TEXT, raw_data JSONB)
    - <#DECISION_UNITS_TABLE# > (decision_ada TEXT, unit_id TEXT)
    - <#DECISION_SIGNERS_TABLE# > (decision_ada TEXT, signer_id TEXT)

    Explanations for some non - obvious fields follow:
        - ada: The unique identifier for a decision(e.g. "Β4ΨΟΞΛΗ-ΞΑΙ").
    - issue_date: The date on which a decision was issued.
    - summary: A textual summary of the decision in a sentence.
    - extracted_data: The metadata extracted from the decision's PDF using OCR and entity extraction.
        - document_metadata: The metadata that existed on the original decision on the Δι @υγεια platform.

    Output null if the query is not valid or you can't explain it.

    SQL: τραλαλ blah
    EXPLANATION: null

    SQL: SELECT * FROM foobar;
    EXPLANATION: null

    SQL: SELECT * FROM < #DECISIONS_TABLE# > ORDER BY embedding ${distanceOperator} <#EMBEDDING:δήμοι# > LIMIT ${n};
    EXPLANATION: πρώτες ${n} αποφάσεις ταξινομημένες κατά σημασιολογική απόσταση από τη φράση "δήμοι".

        SQL: SELECT * FROM < #DECISIONS_TABLE# > ORDER BY embedding ${distanceOperator} <#EMBEDDING:νοσοκομεία# > LIMIT ${n};
    EXPLANATION: πρώτες ${n} αποφάσεις ταξινομημένες κατά σημασιολογική απόσταση από τη φράση "νοσοκομεία".

        SQL: SELECT * FROM < #DECISIONS_TABLE# > WHERE decision_metadata ->> 'awardAmount' IS NOT NULL AND(decision_metadata ->> 'awardAmount'):: float > 1000 LIMIT ${n};
    EXPLANATION: πρώτες ${n} αποφάσεις που έχουν ποσό μεγαλύτερο από 1000 ευρώ.

        SQL: SELECT * FROM < #DECISIONS_TABLE# > WHERE decision_metadata ->> 'awardAmount' IS NOT NULL AND decision_metadata ->> 'awardAmount' != extracted_data ->> 'awardAmount' ORDER BY embedding ${distanceOperator} <#EMBEDDING:σχολεία# > LIMIT ${n};
    EXPLANATION: πρώτες ${n} αποφάσεις που έχουν ποσό στα μεταδεδομένα τους διαφορετικό από αυτό που εξήχει από το κείμενο τους, ταξινομημένες κατά σημασιολογική απόσταση από τη φράση "σχολεία".

        SQL: SELECT * FROM < #DECISIONS_TABLE# > WHERE ada IN(SELECT decision_ada FROM < #DECISION_SIGNERS_TABLE# > WHERE signer_id IN(SELECT id FROM < #SIGNERS_VIEW# > WHERE first_name LIKE '%Γιώργος%' AND last_name LIKE '%Παπαδόπουλος%')) LIMIT ${n};
    EXPLANATION: πρώτες ${n} αποφάσεις που υπογεγραμμένες από κάποιον με όνομα που συμπεριλαμβάνει το "Γιώργος" και επίθετο που συμπεριλαμβάνει το "Παπαδόπουλος".

        Now, generate the explanation for the following query:
            SQL: ${query}
    EXPLANATION: `
}

export const getExplanation = async (query: string): Promise<ValueWithCost<string>> => {
    let prompt = getExplanationPrompt(query, 25, DISTANCE_OPERATOR);
    return generateOpenAICompletion('text-davinci-003', prompt, 0.05);
}

export async function expandDecisions(rows: any[], configurationId: any) {
    let adas = rows.map(d => d.ada);
    let organizations = await getOrganizationsForDecisionAdas(configurationId, adas);
    let signers = await getSignersForDecisionAdas(configurationId, adas);
    let units = await getUnitsForDecisionAdas(configurationId, adas);

    let organizationsMap = new Map(organizations.map(o => [o.id, o]));
    let decisionSignersMultimap = new Map<string, any[]>();
    let decisionUnitsMultimap = new Map<string, any[]>();

    signers.forEach(s => {
        let ada = s.decision_ada;
        if (!decisionSignersMultimap.has(ada)) {
            decisionSignersMultimap.set(ada, []);
        }
        decisionSignersMultimap.get(ada)!.push(s);
    });

    units.forEach(u => {
        let ada = u.decision_ada;
        if (!decisionUnitsMultimap.has(ada)) {
            decisionUnitsMultimap.set(ada, []);
        }
        decisionUnitsMultimap.get(ada)!.push(u);
    });

    rows.forEach(d => {
        let ada = d.ada;
        d.organization = organizationsMap.get(d.organization_id);
        d.signers = decisionSignersMultimap.get(ada);
        d.units = decisionUnitsMultimap.get(ada);
    });
}
