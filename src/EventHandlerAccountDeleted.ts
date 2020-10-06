class EventHandlerAccountDeleted extends EventHandlerAccount {
  protected connectedAccountNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: bkper.Account): string {
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: ACCOUNT ${financialAccount.name} NOT Found`;
  }
  protected connectedAccountFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: bkper.Account, stockAccount: Bkper.Account): string {
    if (stockAccount.hasTransactionPosted()) {
      stockAccount.setArchived(true).update();
    } else {
      stockAccount.remove();
    }
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: ACCOUNT ${stockAccount.getName()} DELETED`;
  }
}
