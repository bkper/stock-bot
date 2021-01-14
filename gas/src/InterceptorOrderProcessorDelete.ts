
class InterceptorOrderProcessorDelete {

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    if (baseBook.getFractionDigits() == 0) {
      return null;
    }

    let operation = event.data.object as bkper.TransactionOperation;
    let transactionPayload = operation.transaction;

    if (!transactionPayload.posted) {
      return null;
    }

    let responses: string[] = [];

    let response1 = this.deleteTransaction(baseBook, `${FEES_PROP}_${transactionPayload.id}`, false);
    if (response1) {
      responses.push(response1);
    }

    let response2 = this.deleteTransaction(baseBook, `${INTEREST_PROP}_${transactionPayload.id}`, false);
    if (response2) {
      responses.push(response2);
    }

    let response3 = this.deleteTransaction(baseBook, `${INSTRUMENT_PROP}_${transactionPayload.id}`, true);
    if (response3) {
      responses.push(response3);
    }
    
    return responses.length > 0 ? responses : null;
  }

  private deleteTransaction(baseBook: Bkper.Book, remoteId: string, checkStockBook: boolean): string {
    let iterator = baseBook.getTransactions(`remoteId:${remoteId}`);
    if (iterator.hasNext()) {
      let tx = iterator.next();
      if (tx.isChecked()) {
        tx.uncheck();
      }

      if (checkStockBook) {
        let stockBook = BotService.getStockBook(baseBook);
        let stockIterator = stockBook.getTransactions(`remoteId:${tx.getId()}`)
        if (stockIterator.hasNext()) {
          let stockTransaction = stockIterator.next();
          if (stockTransaction.isChecked()) {
            stockTransaction.uncheck();
          }
          BotService.flagStockAccountForRebuildIfNeeded(stockTransaction);
          stockTransaction.remove();
        }
      }

      tx.remove();
      return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

}