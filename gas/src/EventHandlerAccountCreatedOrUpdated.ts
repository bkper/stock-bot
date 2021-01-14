class EventHandlerAccountCreatedOrUpdated extends EventHandlerAccount {

  public connectedAccountNotFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, baseAccount: bkper.Account): string {

    let connectedAccount = connectedBook.newAccount();
    this.syncAccounts(baseBook, connectedBook, baseAccount, connectedAccount);
    connectedAccount.create();
    let bookAnchor = super.buildBookAnchor(connectedBook);
    return `${bookAnchor}: ACCOUNT ${connectedAccount.getName()} CREATED`;
  }

  protected connectedAccountFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: bkper.Account, stockAccount: Bkper.Account): string {
    this.syncAccounts(financialBook, stockBook, financialAccount, stockAccount);
    stockAccount.update();
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: ACCOUNT ${stockAccount.getName()} UPDATED`;
  }

  protected syncAccounts(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: bkper.Account, stockAccount: Bkper.Account) {
    stockAccount.setGroups([]);
    stockAccount.setName(financialAccount.name)
      .setType(financialAccount.type as Bkper.AccountType)
      .setProperties(financialAccount.properties)
      .setArchived(financialAccount.archived);
    if (financialAccount.groups) {
      financialAccount.groups.forEach(baseGroupId => {
        let baseGroup = financialBook.getGroup(baseGroupId);
        if (baseGroup) {
          let connectedGroup = stockBook.getGroup(baseGroup.getName());
          let stockExcCode = baseGroup.getProperty(STOCK_EXC_CODE_PROP);
          if (connectedGroup == null && stockExcCode != null && stockExcCode.trim() != '') {
            connectedGroup = stockBook.newGroup()
              .setHidden(baseGroup.isHidden())
              .setName(baseGroup.getName())
              .setProperties(baseGroup.getProperties())
              .create();
          }
          stockAccount.addGroup(connectedGroup);
        }
      });
    }
  }

}