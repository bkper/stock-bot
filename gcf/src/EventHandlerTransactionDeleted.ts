import { Book, Transaction } from "bkper";
import { flagStockAccountForRebuildIfNeeded, isStockBook } from "./BotService";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { InterceptorOrderProcessorDeleteInstruments } from "./InterceptorOrderProcessorDeleteInstruments";
import { InterceptorOrderProcessorDeleteFinancial } from "./InterceptorOrderProcessorDeleteFinancial";
import { Result } from ".";

export class EventHandlerTransactionDeleted extends EventHandlerTransaction {

  async intercept(book: Book, event: bkper.Event): Promise<Result> {
    let result: Result;
    if (isStockBook(book)) {
      result = await new InterceptorOrderProcessorDeleteInstruments().intercept(book, event);
    } else {
      result = await new InterceptorOrderProcessorDeleteFinancial().intercept(book, event);
    }
    return result;
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

    let record = `DELETED: ${stockTransaction.getDateFormatted()} ${amountFormatted} ${await stockTransaction.getCreditAccountName()} ${await stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;

    return `${bookAnchor}: ${record}`;
  }

}
