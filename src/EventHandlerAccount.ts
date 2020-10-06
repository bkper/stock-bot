abstract class EventHandlerAccount extends EventHandler {

  protected processObject(financialBook: Bkper.Book, stockBook: Bkper.Book, event: bkper.Event): string {
    let excCode = BotService.getExcCode(financialBook);
    let financialAccount = event.data.object as bkper.Account;

    let baseAccount = financialBook.getAccount(financialAccount.id);
    let stockExcCode = BotService.getStockExchangeCode(baseAccount);

    if (!this.matchStockExchange(stockExcCode, excCode)) {
      return null;
    }

    let stockAccount = stockBook.getAccount(financialAccount.name);
    if (stockAccount == null && (event.data.previousAttributes && event.data.previousAttributes['name'])) {
      stockAccount = stockBook.getAccount(event.data.previousAttributes['name']);
    }

    if (stockAccount) {
      return this.connectedAccountFound(financialBook, stockBook, financialAccount, stockAccount);
    } else {
      return this.connectedAccountNotFound(financialBook, stockBook, financialAccount);
    }
}

  protected abstract connectedAccountNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: bkper.Account): string;

  protected abstract connectedAccountFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: bkper.Account, stockAccount: Bkper.Account): string;

}