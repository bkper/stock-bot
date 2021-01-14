class EventHandlerGroupDeleted extends EventHandlerGroup {
  protected connectedGroupNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialGroup: bkper.Group): string {
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: GROUP ${financialGroup.name} NOT Found`;
  }
  protected connectedGroupFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialGroup: bkper.Group, stockGroup: Bkper.Group): string {
    stockGroup.remove();
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: GROUP ${stockGroup.getName()} DELETED`;
  }

}