import { Book } from "bkper";
import { getStockAccount, isStockBook } from "./BotService";
import { NEEDS_REBUILD_PROP } from "./constants";

export class InterceptorFlagRebuild {

  async intercept(baseBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {
    if (isStockBook(baseBook) && event.agent.id != 'stock-bot') {
      let operation = event.data.object as bkper.TransactionOperation;
      let transactionPayload = operation.transaction;
      let transaction = await baseBook.getTransaction(transactionPayload.id);
      
      let stockAccount = await getStockAccount(transaction);

      console.log(stockAccount)

      if(stockAccount && stockAccount.getProperty(NEEDS_REBUILD_PROP) == null) {
        stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
        return `Flagging account ${stockAccount.getName()} for rebuild`;
      }
    }
    return false;
  }

}