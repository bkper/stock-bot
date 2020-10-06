class EventHandlerGroupCreatedOrUpdated extends EventHandlerGroup {
  protected connectedGroupNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialGroup: bkper.Group): string {
    let connectedGroup = stockBook.newGroup()
    .setName(financialGroup.name)
    .setHidden(financialGroup.hidden)
    .setProperties(financialGroup.properties)
    .create();
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: GROUP ${connectedGroup.getName()} CREATED`;
  }
  protected connectedGroupFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialGroup: bkper.Group, stockGroup: Bkper.Group): string {
    stockGroup
    .setName(financialGroup.name)
    .setHidden(financialGroup.hidden)
    .setProperties(financialGroup.properties)
    .update();
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: GROUP ${stockGroup.getName()} UPDATED`;
  }


}