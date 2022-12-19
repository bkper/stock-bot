import { Book } from "bkper";
import { flagStockAccountForRebuildIfNeeded, getStockBook } from "./BotService";
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

        if (this.isTransactionStockGainOrLoss(transactionPayload) || this.isTransactionExchangeGainOrLoss(transactionPayload)) {
            const stockBook = getStockBook(financialBook);
            if (stockBook && transactionPayload.remoteIds) {
                for (const remoteId of transactionPayload.remoteIds) {
                    let stockBookTransaction = await stockBook.getTransaction(remoteId.replace('fx_', ''));
                    if (stockBookTransaction) {
                        await flagStockAccountForRebuildIfNeeded(stockBookTransaction);
                    }
                }
            }
        }

        return responses.length > 0 ? responses : false;
    }

    private isTransactionStockGainOrLoss(transaction: bkper.Transaction): boolean {
        return transaction.agentId == 'stock-bot' && (transaction.description == '#stock_gain' || transaction.description == '#stock_loss') ? true : false;
    }

    private isTransactionExchangeGainOrLoss(transaction: bkper.Transaction): boolean {
        return transaction.agentId == 'stock-bot' && (transaction.description == '#exchange_gain' || transaction.description == '#exchange_loss') ? true : false;
    }

}
