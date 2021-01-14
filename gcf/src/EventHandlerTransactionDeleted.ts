import { Book, Transaction } from "bkper";
import { flagStockAccountForRebuildIfNeeded } from "./BotService";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";

export class EventHandlerTransactionDeleted extends EventHandlerTransaction {

  async intercept(baseBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {
    let response = await new InterceptorOrderProcessorDelete().intercept(baseBook, event);
    return response;
  }

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionNotFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockExcCode: string): Promise<string> {
    return null;
  }
  protected async connectedTransactionFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockTransaction: Transaction, stockExcCode: string): Promise<string> {
    let bookAnchor = super.buildBookAnchor(stockBook);

    if (stockTransaction.isChecked()) {
      stockTransaction.uncheck();
    }

    await flagStockAccountForRebuildIfNeeded(stockTransaction);

    await stockTransaction.remove();

    let amountFormatted = stockBook.formatValue(stockTransaction.getAmount())

    let record = `DELETED: ${stockTransaction.getDateFormatted()} ${amountFormatted} ${stockTransaction.getCreditAccountName()} ${stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;

    return `${bookAnchor}: ${record}`;
  }

}
