abstract class EventHandlerGroup extends EventHandler {

  protected processObject(financialBook: Bkper.Book, stockBook: Bkper.Book, event: bkper.Event): string {
    let excCode = BotService.getExcCode(financialBook);
    let group = event.data.object as bkper.Group;

    let stockExcCode = group.properties[STOCK_EXC_CODE_PROP];

    if (!this.matchStockExchange(stockExcCode, excCode)) {
      return null;
    }

    let connectedGroup = stockBook.getGroup(group.name);
    if (connectedGroup == null && (event.data.previousAttributes && event.data.previousAttributes['name'])) {
      connectedGroup = stockBook.getGroup(event.data.previousAttributes['name']);
    }

    if (connectedGroup) {
      return this.connectedGroupFound(financialBook, stockBook, group, connectedGroup);
    } else {
      return this.connectedGroupNotFound(financialBook, stockBook, group);
    }
  }

  protected abstract connectedGroupNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialGroup: bkper.Group): string;

  protected abstract connectedGroupFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialGroup: bkper.Group, stockGroup: Bkper.Group): string;

}