import { Account, Book } from "bkper";
import { getExcCode, getStockExchangeCode } from "./BotService";
import { EventHandler } from "./EventHandler";

export abstract class EventHandlerAccount extends EventHandler {

  protected async processObject(financialBook: Book, stockBook: Book, event: bkper.Event): Promise<string> {
    let excCode = getExcCode(financialBook);
    let financialAccount = event.data.object as bkper.Account;

    let baseAccount = await financialBook.getAccount(financialAccount.id);
    let stockExcCode = await getStockExchangeCode(baseAccount);

    if (!stockExcCode) {
      return null;
    }

    let stockAccount = await stockBook.getAccount(financialAccount.name);
    if (stockAccount == null && (event.data.previousAttributes && event.data.previousAttributes['name'])) {
      stockAccount = await stockBook.getAccount(event.data.previousAttributes['name']);
    }

    if (stockAccount) {
      return await this.connectedAccountFound(financialBook, stockBook, financialAccount, stockAccount);
    } else {
      return await this.connectedAccountNotFound(financialBook, stockBook, financialAccount);
    }
}

  protected abstract connectedAccountNotFound(financialBook: Book, stockBook: Book, financialAccount: bkper.Account): Promise<string>;

  protected abstract connectedAccountFound(financialBook: Book, stockBook: Book, financialAccount: bkper.Account, stockAccount: Account): Promise<string>;

}