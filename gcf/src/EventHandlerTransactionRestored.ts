import { Book, Transaction } from "bkper";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { InterceptorOrderProcessor } from "./InterceptorOrderProcessor";

export class EventHandlerTransactionRestored extends EventHandlerTransaction {

  async intercept(baseBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {
    return await new InterceptorOrderProcessor().intercept(baseBook, event);
  }

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id} is:trashed`;
  }

  protected connectedTransactionNotFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockExcCode: string): Promise<string> {
    return null;
  }
  protected async connectedTransactionFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockTransaction: Transaction, stockExcCode: string): Promise<string> {
    let bookAnchor = super.buildBookAnchor(stockBook);

    await stockTransaction.restore();

    let amountFormatted = stockBook.formatValue(stockTransaction.getAmount())

    let record = `RESTORED: ${stockTransaction.getDateFormatted()} ${amountFormatted} ${await stockTransaction.getCreditAccountName()} ${await stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;

    return `${bookAnchor}: ${record}`;
  }

}
