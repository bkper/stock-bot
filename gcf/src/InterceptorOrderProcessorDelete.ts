import { Book, Transaction } from "bkper";
import { flagStockAccountForRebuildIfNeeded, getStockBook, getBaseBook } from "./BotService";

export abstract class InterceptorOrderProcessorDelete {

  protected cascadeDelete(book: Book, transaction: bkper.Transaction) {
    if (!book) {
        return;
    }
    this.cascadeDeleteTransactions(book, transaction, ``);
    this.cascadeDeleteTransactions(book, transaction, `mtm_`);
    this.cascadeDeleteTransactions(getBaseBook(book), transaction, `fx_`);
  }

  protected async cascadeDeleteTransactions(book: Book, remoteTx: bkper.Transaction, prefix: string) {
    let iterator = book.getTransactions(`remoteId:${prefix}${remoteTx.id}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }
      await tx.remove();
    }
  }

  protected async buildDeleteResponse(tx: Transaction): Promise<string> {
    return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
  }

  protected async deleteTransaction(book: Book, remoteId: string, checkStockBook: boolean): Promise<{ financialTx: Transaction, stockTx?: Transaction }> {
    let iterator = book.getTransactions(`remoteId:${remoteId}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }

      const response: { financialTx: Transaction, stockTx?: Transaction } = { financialTx: tx }

      if (checkStockBook) {
        let stockBook = getStockBook(book);
        let stockIterator = stockBook.getTransactions(`remoteId:${tx.getId()}`)
        if (await stockIterator.hasNext()) {
          let stockTransaction = await stockIterator.next();
          response.stockTx = stockTransaction;
          if (stockTransaction.isChecked()) {
            await stockTransaction.uncheck();
          }
          await flagStockAccountForRebuildIfNeeded(stockTransaction);
          await stockTransaction.remove();
        }
      }

      tx = await tx.remove();
      return response;
    }
    return null;
  }

}