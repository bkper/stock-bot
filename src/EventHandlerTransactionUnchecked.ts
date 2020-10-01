
class EventHandlerTransactionUnchecked {

  handleEvent(event: bkper.Event): string {
    let bookId = event.bookId;
    let baseBook = BkperApp.getBook(bookId);
    if (baseBook.getFractionDigits() == 0) {
      let operation = event.data.object as bkper.TransactionOperation;
      let transactionPayload = operation.transaction;
      let transaction = baseBook.getTransaction(transactionPayload.id);
      transaction.setProperty('rebuild', 'TRUE').update()
      return 'Flaggig transaction for rebuild'
    }
    return null;
  }


}