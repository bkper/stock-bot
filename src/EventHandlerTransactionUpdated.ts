class EventHandlerTransactionUpdated extends EventHandlerTransaction {

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionNotFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction): string {
    return null;
  }
  protected connectedTransactionFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, connectedTransaction: Bkper.Transaction): string {
    let quantity = this.getQuantity(transaction);
    if (quantity == null) {
      return null;
    }
    let price = new Number(transaction.amount).valueOf() / quantity;
    connectedTransaction.setDate(transaction.date)
    .setAmount(quantity)
    .setDescription(transaction.description)
    .setProperty('price', price.toFixed(baseBook.getFractionDigits())).update();

    let bookAnchor = super.buildBookAnchor(connectedBook);
    let record = `EDITED: ${connectedTransaction.getDateFormatted()} ${quantity} ${connectedTransaction.getCreditAccountName()} ${connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
    return `${bookAnchor}: ${record}`;
  }

}
