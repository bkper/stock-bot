import { Book, Group } from "bkper";
import { getExcCode } from "./BotService";
import { STOCK_EXC_CODE_PROP } from "./constants";
import { EventHandler } from "./EventHandler";

export abstract class EventHandlerGroup extends EventHandler {

  protected async processObject(financialBook: Book, stockBook: Book, event: bkper.Event): Promise<string> {
    let group = event.data.object as bkper.Group;

    let stockExcCode = group.properties[STOCK_EXC_CODE_PROP];

    if (!stockExcCode) {
      return null;
    }

    let connectedGroup = await stockBook.getGroup(group.name);
    if (connectedGroup == null && (event.data.previousAttributes && event.data.previousAttributes['name'])) {
      connectedGroup = await stockBook.getGroup(event.data.previousAttributes['name']);
    }

    if (connectedGroup) {
      return await this.connectedGroupFound(financialBook, stockBook, group, connectedGroup);
    } else {
      return await this.connectedGroupNotFound(financialBook, stockBook, group);
    }
  }

  protected abstract connectedGroupNotFound(financialBook: Book, stockBook: Book, financialGroup: bkper.Group): Promise<string>;

  protected abstract connectedGroupFound(financialBook: Book, stockBook: Book, financialGroup: bkper.Group, stockGroup: Group): Promise<string>;

}