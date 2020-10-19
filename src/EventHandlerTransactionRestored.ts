class EventHandlerTransactionRestored extends EventHandlerTransaction {

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    return new InterceptorOrderProcessor().intercept(baseBook, event);
  }

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id} is:trashed`;
  }

  protected connectedTransactionNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockExcCode: string): string {
    return null;
  }
  protected connectedTransactionFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockTransaction: Bkper.Transaction, stockExcCode: string): string {
    let bookAnchor = super.buildBookAnchor(stockBook);

    stockTransaction.restore();

    let amountFormatted = stockBook.formatValue(stockTransaction.getAmount())

    let record = `RESTORED: ${stockTransaction.getDateFormatted()} ${amountFormatted} ${stockTransaction.getCreditAccountName()} ${stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;

    return `${bookAnchor}: ${record}`;
  }

}
