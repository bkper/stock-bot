import { Book } from "bkper";
import { FEES_PROP, INSTRUMENT_PROP, INTEREST_PROP } from "./constants";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";

export class InterceptorOrderProcessorDeleteFinancial extends InterceptorOrderProcessorDelete {

    async intercept(financialBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return false;
        }

        let responses: string[] = [];

        let response1 = await this.deleteTransaction(financialBook, `${FEES_PROP}_${transactionPayload.id}`);
        if (response1) {
            responses.push(await this.buildDeleteResponse(response1));
        }
        let response2 = await this.deleteTransaction(financialBook, `${INTEREST_PROP}_${transactionPayload.id}`);
        if (response2) {
            responses.push(await this.buildDeleteResponse(response2));
        }
        let response3 = await this.deleteTransaction(financialBook, `${INSTRUMENT_PROP}_${transactionPayload.id}`);
        if (response3) {
            await this.deleteOnStockBook(financialBook, response3.getId());
        } else {
            await this.deleteOnStockBook(financialBook, transactionPayload.id);
        }
        
        return responses.length > 0 ? responses : false;
    }

}