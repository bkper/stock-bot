
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

    let response1 = this.deleteTransaction(baseBook, `${FEES_PROP}_${transactionPayload.id}`);
    if (response1) {
      responses.push(response1);
    }

    let response2 = this.deleteTransaction(baseBook, `${INTEREST_PROP}_${transactionPayload.id}`);
    if (response2) {
      responses.push(response2);
    }

    let response3 = this.deleteTransaction(baseBook, `${INSTRUMENT_PROP}_${transactionPayload.id}`);
    if (response3) {
      responses.push(response3);
    }
    
    return responses.length > 0 ? responses : null;
  }

  private deleteTransaction(baseBook: Bkper.Book, remoteId: string): string {
    let iterator = baseBook.getTransactions(`remoteId:${remoteId}`);
    if (iterator.hasNext()) {
      let tx = iterator.next();
      if (tx.isChecked()) {
        tx.uncheck();
      }
      tx.remove();
      return `DELETED: ${tx.getDateFormatted()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

}