import { getOpenAIClient } from "./utils";
import { decisionTypes } from "./decisionTypes";
import { ModelName, ValueWithCost } from "./types";
import { generateOpenAIResponse } from "./utils";
import Logger from "./logger";

const METADATA_FIELDS = ["issueDate", "amountWithVAT", "decisionType"];
const MODEL = (process.env.OPENAI_MODEL as ModelName) || "text-davinci-003";

const getQueryPrompt = (textQuery: string) => {
    return `
    You have to generate a JSON query from a line of free text (that is likely to be in greek).
    The query will be used to search for decisions (Πράξεις) uploaded to Diavgeia.
    The query will be composed of two main parts: the metadata query, and a text query
    (from which an embedding will be created to perform a semantic similarity search).

    For the text query, output a description of the query's theme.

    The metadata query is a JSON object that looks like this:
    {"metadata_field_name": "metadata_field_value", ...}

    Instead of a metadata field value, you can also use an object for more advanced searches. For example:
    {"some_metadata_date_field": {"$gt": "2020-01-01", "$lte": "2020-12-31"}

    You can also use logical operators like so:
    {"$and": [{"some_metadata_date_field": {"$gt": "2020-01-01", "$lte": "2020-12-31"}}, {"some_other_metadata_field": "some_value"}]}

    The only metadata fields that are currently supported are: ${METADATA_FIELDS.join(", ")}. Do not use any other fields.

    The decisionType field is a special case. It is a string that can take one of the following values, each of them denoting a decision type:
    ${Object.keys(decisionTypes).filter((k) => ["Δ.1"].includes(k)).map((x) => `${x}: ${decisionTypes[x as keyof typeof decisionTypes]}`).join(", ")}
    Only the code (e.g. Δ.1) should be used in the query.

    If the user wants to search for a specific decision type, you must pick the most appropraite ones from the above list.

    Put the text query in the JSON under the "text" key. For example, for a query like
    "Δημόσιες δαπάνες που αφορούν ανάπτυξη ιστοσελίδων μέσα στο πρώτο μισό του 2020"
    you should output:

    {"text": "Ανάπτυξη Ιστοσελίδων", "issueDate": {"$gt": "2020-01-01", "$lte": "2020-06-30"}

    All the above are examples. Do not use the sample values above in your response, use only data that's in the query that I am about to give you.
    For the relative time queries, the current date is ${new Date().toISOString()}.
    Now generate the JSON for the JSON query for query "${textQuery}":
    `;
};

let convertIssueDateFilter = (filter: any) => {
    if (filter === undefined) return undefined;

    return {
        "$and": [
            { "issueDate": { "$gt": Date.parse(filter["$gt"]) } },
            { "issueDate": { "$lte": Date.parse(filter["$lte"]) + 24 * 60 * 60 * 1000 } },
        ]
    };
}

export async function generateChromaQuery(textQuery: string): Promise<ValueWithCost<[string, { [key: string]: object }]>> {

    let prompt = getQueryPrompt(textQuery);

    let { value: textResponse, cost } = await generateOpenAIResponse(MODEL, prompt, 0.1);

    if (!textResponse) {
        throw new Error("OpenAI returned an empty response");
    }
    let jsonQuery = JSON.parse(textResponse);
    let text = jsonQuery.text;
    if (jsonQuery.issueDate) {
        let andClause = convertIssueDateFilter(jsonQuery.issueDate);
        jsonQuery = { ...jsonQuery, ...andClause };
        delete jsonQuery.issueDate;
    }
    delete jsonQuery.text;

    console.log("Generated query: ", text, jsonQuery);

    return {
        cost,
        value: [text, jsonQuery]
    };
}
