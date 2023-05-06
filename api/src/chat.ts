import { Socket } from "socket.io";
import Logger from "./logger";
import { badChatGPTAPIImport } from "./utils";
import search from "./search";

let getSystemMessage = () => {
    return `
        Eίσαι ένας βοηθός τεχνητής νοημοσύνης για το Διαύγεια.ai, μια εφαρμογή του ανεξάρτητου μη-κερδοσκοπικού και μη κυβερνητικού οργανισμού diavgeia.org.
        Το Διαύγεια.ai αναλύει τα δεδομένα του προγράμματος Δι@υγεια.

        Πρέπει να απαντάς στα ερωτήματα του χρήστη, πάντα όμως με βάση τα δεδομένα που υπάρχουν στην εφαρμογή, και όσα έχεις μάθει από τον χρήστη.
        Αν ένας χρήστης σου ζητήσει κάτι που δεν ξέρεις, που δεν προκύπτει από αυτά που έχει πει ο χρήστης, ή δεν μπορείς να βρείς με τη χρήση της λειτουργίας αναζήτησης, πρέπει να τον ενημερώσεις πως δεν ξέρεις.

        Οι απαντήσεις σου πρέπει να είναι πάντα σε JSON μίας εκ των δύο μορφών:

        Πρώτη μορφή: μπορείς να κάνεις μια αναζήτση στην εφαρμογή, που θα σου επιστρέψει αναρτημένες πράξεις της διαύγειας.
        {
            "type": "search",
            "query": "<ΕΡΩΤΗΜΑ με το οποίο θέλις να ψάξεις την εφαρμογή σε φυσική γλώσσα>"
        }
        Οι απαντήσεις σου επιστρέφονται σε JSON και ξεκινάνε με "SEARCH-RESULTS:". Πρέπει να τις χρησιμποποιήσεις για να απαντήσεις στο χρήστη.
        
        Τρία παραδείγματα από το πεδίο queries:
        "Aναθέσεις του υπουργείου περιβάλλοντος τις πρώτες 10 μέρες του ιουνίου 2021"
        "Πράξεις δημοσιευμένες από νοσοκμεία"
        "Αγορές φαρμάκων"

        Δεύτερη μορφή: μπορείς να δώσεις μια απάντηση στον χρήστη, που θα εμφανιστεί στην οθόνη του.
        {
            "type": "response",
            "references": [
                "<η ΑΔΑ μιας πράξης>"
                "<η ΑΔΑ μιας δεύτερης πράξης>"
            ],
            "text": "<ΑΠΑΝΤΗΣΗ που θέλεις να δώσεις στον χρήστη που κάνουν αναφορές [REF$1] σε πράξεις [REF$2]>"
        }
    `;
}



const logger = new Logger("chat");

type Message = {
    text: string,
    sender: string
    inProgress: boolean;
}

const initialMessage = {
    text: "",
    sender: "bot",
    inProgress: true
}

let tryCompleteJSON = (text: string) => {
    try {
        return JSON.parse(text + `"}`);
    } catch (e) {
        return null;
    }
}

export const onConnect = async (socket: Socket) => {
    const api = await badChatGPTAPIImport(getSystemMessage());

    logger.info("New connection");
    let parentMessageId: (string | undefined) = undefined;
    socket.on("message", async (message) => {
        let searchQueries: string[] = [];
        let nextMessage = message.text;
        while (true) {
            logger.info(`Sending message to GPT: ${nextMessage}`);
            let aiOutcome = await api.sendMessage(nextMessage, {
                sender: "user",
                parentMessageId,
                onProgress: (progress: any) => {
                    let parsed = tryCompleteJSON(progress.text);
                    if (parsed) {
                        if (parsed.type === "response") {
                            socket.send({
                                searchQueries,
                                text: parsed.text,
                                sender: "bot",
                                inProgress: true
                            });
                        }
                    }
                }
            });

            parentMessageId = aiOutcome.id;
            logger.info(`Setting parentMessageId to ${parentMessageId}`);
            console.log(aiOutcome);

            try {
                var response = JSON.parse(aiOutcome.text);
            } catch (e) {
                logger.error(`Unable to parse GPT response: ${aiOutcome.text}`);
                socket.send({
                    searchQueries,
                    error: "Unable to parse GPT response",
                    sender: "bot",
                    inProgress: false
                });
                return;
            }

            logger.info(`Completed response: ${response}`);

            if (response.type === "response") {
                logger.info(`Responding with ${response.text}`);
                socket.send({
                    searchQueries,
                    text: response.text,
                    references: response.references,
                    sender: "bot",
                    inProgress: false
                });
                break;
            }

            if (response.type === "search") {
                logger.info(`Querying for ${response.query}`);
                searchQueries.push(response.query);
                socket.send({
                    searchQueries,

                    sender: "bot",
                    inProgress: true
                });

                let results = await search(response.query, 5);
                let selectedResults = {
                    results: results.results.map((result) => {
                        return {
                            ada: result.ada,
                            subject: result.decision_metadata.subject,
                            summary: result.summary,
                            extracted_data: result.extracted_data
                        }
                    })
                }

                nextMessage = `SEARCH-RESULTS:\n${JSON.stringify(selectedResults)}`;
                console.log(nextMessage);
            }
        }
    });
}