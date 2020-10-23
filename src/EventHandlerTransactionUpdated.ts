class EventHandlerTransactionUpdated extends EventHandlerTransaction {

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    new InterceptorOrderProcessorDelete().intercept(baseBook, event);
    return new InterceptorOrderProcessor().intercept(baseBook, event);
  }

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockExcCode: string): string {
    return null;
  }
  protected connectedTransactionFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockTransaction: Bkper.Transaction, stockExcCode: string): string {

    if (!financialTransaction.posted) {
      return null;
    }

    let quantity = this.getQuantity(stockBook, financialTransaction);
    if (quantity == null) {
      return null;
    }

    let price = new Number(financialTransaction.amount).valueOf() / quantity;
    stockTransaction.setDate(financialTransaction.date)
    .setAmount(quantity)
    .setDescription(financialTransaction.description)
    .setProperty(PRICE_PROP, price.toFixed(financialBook.getFractionDigits()));

    if (BotService.isPurchase(stockTransaction)) {
      stockTransaction.setProperty(ORIGINAL_QUANTITY_PROP, quantity.toFixed(0));
    }

    stockTransaction.update();

    let bookAnchor = super.buildBookAnchor(stockBook);
    let record = `EDITED: ${stockTransaction.getDateFormatted()} ${quantity} ${stockTransaction.getCreditAccountName()} ${stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;
    return `${bookAnchor}: ${record}`;
  }

}
