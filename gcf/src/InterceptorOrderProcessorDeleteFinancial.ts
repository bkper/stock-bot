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

        let response1 = await this.deleteTransaction(financialBook, `${FEES_PROP}_${transactionPayload.id}`, false);
        if (response1) {
            responses.push(await this.buildDeleteResponse(response1.financialTx));
        }
        let response2 = await this.deleteTransaction(financialBook, `${INTEREST_PROP}_${transactionPayload.id}`, false);
        if (response2) {
            responses.push(await this.buildDeleteResponse(response2.financialTx));
        }
        let response3 = await this.deleteTransaction(financialBook, `${INSTRUMENT_PROP}_${transactionPayload.id}`, true);
        if (response3) {
            responses.push(await this.buildDeleteResponse(response3.financialTx));
            if (response3.stockTx) {
                this.cascadeDelete(financialBook, response3.stockTx.json());
            }
        }
        
        return responses.length > 0 ? responses : false;
    }

}