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
    if (quantity == null || quantity == 0) {
      return null;
    }

    if (stockTransaction.isChecked()) {
      stockTransaction.uncheck();
    }

    let price = new Number(financialTransaction.amount).valueOf() / quantity;
    
    const originalAmount = new Number(financialTransaction.amount).valueOf();

    stockTransaction.setDate(financialTransaction.date)
    .setAmount(quantity)
    .setDescription(financialTransaction.description)
    .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toFixed(0))
    .setProperty(ORIGINAL_AMOUNT_PROP, originalAmount.toFixed(financialBook.getFractionDigits()))
    ;

    if (BotService.isPurchase(stockTransaction)) {
      stockTransaction.setProperty(PURCHASE_PRICE_PROP, price + '')
    }

    if (BotService.isSale(stockTransaction)) {
      stockTransaction.setProperty(SALE_PRICE_PROP, price + '')
    }

    stockTransaction.update();

    BotService.flagStockAccountForRebuildIfNeeded(stockTransaction);

    let bookAnchor = super.buildBookAnchor(stockBook);
    let record = `EDITED: ${stockTransaction.getDateFormatted()} ${quantity} ${stockTransaction.getCreditAccountName()} ${stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;
    return `${bookAnchor}: ${record}`;
  }

}
