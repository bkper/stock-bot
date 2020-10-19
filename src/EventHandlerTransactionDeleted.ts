class EventHandlerTransactionDeleted extends EventHandlerTransaction {

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    let response = new InterceptorOrderProcessorDelete().intercept(baseBook, event);
    return response;
  }

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockExcCode: string): string {
    return null;
  }
  protected connectedTransactionFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockTransaction: Bkper.Transaction, stockExcCode: string): string {
    let bookAnchor = super.buildBookAnchor(stockBook);

    if (stockTransaction.isChecked()) {
      stockTransaction.uncheck();
    }

    stockTransaction.remove();

    let amountFormatted = stockBook.formatValue(stockTransaction.getAmount())

    let record = `DELETED: ${stockTransaction.getDateFormatted()} ${amountFormatted} ${stockTransaction.getCreditAccountName()} ${stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;

    return `${bookAnchor}: ${record}`;
  }

}
