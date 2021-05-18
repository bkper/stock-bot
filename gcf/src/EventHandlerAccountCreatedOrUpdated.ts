import { Account, AccountType, Book } from "bkper";
import { GROUP_TRADING, STOCK_EXC_CODE_PROP } from "./constants";
import { EventHandlerAccount } from "./EventHandlerAccount";

export class EventHandlerAccountCreatedOrUpdated extends EventHandlerAccount {

  public async connectedAccountNotFound(baseBook: Book, connectedBook: Book, baseAccount: bkper.Account): Promise<string> {
    let connectedAccount = connectedBook.newAccount();
    await this.syncAccounts(baseBook, connectedBook, baseAccount, connectedAccount);
    await connectedAccount.create();
    let bookAnchor = super.buildBookAnchor(connectedBook);
    return `${bookAnchor}: ACCOUNT ${connectedAccount.getName()} CREATED`;
  }

  protected async connectedAccountFound(financialBook: Book, stockBook: Book, financialAccount: bkper.Account, stockAccount: Account): Promise<string> {
    await this.syncAccounts(financialBook, stockBook, financialAccount, stockAccount);
    await stockAccount.update();
    let bookAnchor = super.buildBookAnchor(stockBook);
    return `${bookAnchor}: ACCOUNT ${stockAccount.getName()} UPDATED`;
  }

  protected async syncAccounts(financialBook: Book, stockBook: Book, financialAccount: bkper.Account, stockAccount: Account) {
    stockAccount.setGroups([]);
    stockAccount.setName(financialAccount.name)
      .setType(financialAccount.type as AccountType)
      .setProperties(financialAccount.properties)
      .setArchived(financialAccount.archived);
    if (financialAccount.groups) {
      for (const baseGroupId of financialAccount.groups) {
        let baseGroup = await financialBook.getGroup(baseGroupId);
        if (baseGroup) {
          let connectedGroup = await stockBook.getGroup(baseGroup.getName());
          let stockExcCode = baseGroup.getProperty(STOCK_EXC_CODE_PROP);
          if (connectedGroup == null && stockExcCode != null && stockExcCode.trim() != '') {
            connectedGroup = await stockBook.newGroup()
              .setHidden(baseGroup.isHidden())
              .setName(baseGroup.getName())
              .setProperties(baseGroup.getProperties())
              .create();
          }
          stockAccount.addGroup(connectedGroup);
        }
      }
    }

    let tradingGroup = await stockBook.getGroup(GROUP_TRADING);
    if (!tradingGroup) {
      tradingGroup = await stockBook.newGroup().setName(GROUP_TRADING).create()
    }
    stockAccount.addGroup(tradingGroup)

  }

}