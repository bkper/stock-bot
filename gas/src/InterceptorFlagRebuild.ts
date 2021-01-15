
class InterceptorFlagRebuild {

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    if (baseBook.getFractionDigits() == 0 && event.agent.id != 'stock-bot') {
      let operation = event.data.object as bkper.TransactionOperation;
      let transactionPayload = operation.transaction;
      let transaction = baseBook.getTransaction(transactionPayload.id);
      
      let stockAccount = BotService.getStockAccount(transaction);

      if(stockAccount && stockAccount.getProperty(NEEDS_REBUILD_PROP) == null) {
        stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
        return `Flagging account ${stockAccount.getName()} for rebuild`;
      }
    }
    return null;
  }

}