import { Book } from "bkper";
import { flagStockAccountForRebuildIfNeeded, getStockBook, isStockBook } from "./BotService";
import { FEES_PROP, INSTRUMENT_PROP, INTEREST_PROP } from "./constants";

export class InterceptorOrderProcessorDelete {

  async intercept(baseBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {
    if (isStockBook(baseBook)) {
      return false;
    }

    let operation = event.data.object as bkper.TransactionOperation;
    let transactionPayload = operation.transaction;

    if (!transactionPayload.posted) {
      return false;
    }

    let responses: string[] = [];

    let response1 = await this.deleteTransaction(baseBook, `${FEES_PROP}_${transactionPayload.id}`, false);
    if (response1) {
      responses.push(response1);
    }

    let response2 = await this.deleteTransaction(baseBook, `${INTEREST_PROP}_${transactionPayload.id}`, false);
    if (response2) {
      responses.push(response2);
    }

    let response3 = await this.deleteTransaction(baseBook, `${INSTRUMENT_PROP}_${transactionPayload.id}`, true);
    if (response3) {
      responses.push(response3);
    }
    
    return responses.length > 0 ? responses : false;
  }

  private async deleteTransaction(baseBook: Book, remoteId: string, checkStockBook: boolean): Promise<string> {
    let iterator = baseBook.getTransactions(`remoteId:${remoteId}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }

      if (checkStockBook) {
        let stockBook = getStockBook(baseBook);
        let stockIterator = stockBook.getTransactions(`remoteId:${tx.getId()}`)
        if (await stockIterator.hasNext()) {
          let stockTransaction = await stockIterator.next();
          if (stockTransaction.isChecked()) {
            stockTransaction.uncheck();
          }
          await flagStockAccountForRebuildIfNeeded(stockTransaction);
          await stockTransaction.remove();
        }
      }

      tx = await tx.remove();
      return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

}