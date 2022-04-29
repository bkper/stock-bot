import { Account, Book, Transaction } from "bkper";
import { getExchangeCode, getFinancialBook } from "./BotService";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";

export class InterceptorOrderProcessorDeleteInstruments extends InterceptorOrderProcessorDelete {

    async intercept(stockBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {

        let operation = event.data.object as bkper.TransactionOperation;
        let transactionPayload = operation.transaction;

        if (!transactionPayload.posted) {
            return false;
        }

        let stockTx = await stockBook.getTransaction(transactionPayload.id);
        let stockAccount = await this.getStockAccount(stockTx);
        if (!stockAccount) {
            return false;
        }
        let stockExcCode = await getExchangeCode(stockAccount);
        let financialBook = await getFinancialBook(stockBook, stockExcCode);

        this.cascadeDelete(financialBook, transactionPayload);

        return `DELETED: ${stockTx.getDateFormatted()} ${stockTx.getAmount()} ${await stockTx.getCreditAccountName()} ${await stockTx.getDebitAccountName()} ${stockTx.getDescription()}`;
    }

    async getStockAccount(stockTransaction: Transaction): Promise<Account> {
        let creditAccount = await stockTransaction.getCreditAccount();
        if (creditAccount.isPermanent()) {
            return creditAccount;
        }
        let debitAccount = await stockTransaction.getDebitAccount();
        if (debitAccount.isPermanent()) {
            return debitAccount;
        }
        return null;
    }

}