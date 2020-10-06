class EventHandlerTransactionUpdated extends EventHandlerTransaction {

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionNotFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, stockExcCode: string): string {
    return null;
  }
  protected connectedTransactionFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, connectedTransaction: Bkper.Transaction, stockExcCode: string): string {

    if (!transaction.posted) {
      return null;
    }

    let quantity = this.getQuantity(transaction);
    if (quantity == null) {
      return null;
    }

    let price = new Number(transaction.amount).valueOf() / quantity;
    connectedTransaction.setDate(transaction.date)
    .setAmount(quantity)
    .setDescription(transaction.description)
    .setProperty(PRICE_PROP, price.toFixed(baseBook.getFractionDigits()));

    if (BotService.isPurchase(connectedTransaction)) {
      connectedTransaction.setProperty(ORIGINAL_QUANTITY_PROP, quantity.toFixed(0));
    }

    connectedTransaction.update();

    let bookAnchor = super.buildBookAnchor(connectedBook);
    let record = `EDITED: ${connectedTransaction.getDateFormatted()} ${quantity} ${connectedTransaction.getCreditAccountName()} ${connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
    return `${bookAnchor}: ${record}`;
  }

}
