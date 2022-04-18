import { Book, Transaction } from "bkper";
import { flagStockAccountForRebuildIfNeeded, getStockBook, getBaseBook, isStockBook } from "./BotService";
import { FEES_PROP, INSTRUMENT_PROP, INTEREST_PROP } from "./constants";

export class InterceptorOrderProcessorDelete {

  async intercept(financialBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {
    if (isStockBook(financialBook)) {
      return false;
    }

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
        this.cascadeDeleteTransactions(financialBook, response3.stockTx, ``);
        this.cascadeDeleteTransactions(financialBook, response3.stockTx, `mtm_`);
        this.cascadeDeleteTransactions(getBaseBook(financialBook), response3.stockTx, `fx_`);
      }
    }
    
    return responses.length > 0 ? responses : false;
  }
  
  private async cascadeDeleteTransactions(book: Book, remoteTx: Transaction, prefix: string) {
    let iterator = book.getTransactions(`remoteId:${prefix}${remoteTx.getId()}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }
      await tx.remove();
    }
  }

  private async buildDeleteResponse(tx: Transaction): Promise<string> {
    return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${await tx.getCreditAccountName()} ${await tx.getDebitAccountName()} ${tx.getDescription()}`
  }

  private async deleteTransaction(financialBook: Book, remoteId: string, checkStockBook: boolean): Promise<{financialTx: Transaction, stockTx?: Transaction}> {
    let iterator = financialBook.getTransactions(`remoteId:${remoteId}`);
    if (await iterator.hasNext()) {
      let tx = await iterator.next();
      if (tx.isChecked()) {
        tx = await tx.uncheck();
      }

      const response: {financialTx: Transaction, stockTx?: Transaction} = {financialTx: tx}

      if (checkStockBook) {
        let stockBook = getStockBook(financialBook);
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