
class EventHandlerTransactionChecked extends EventHandlerTransaction {

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  intercept(baseBook: Bkper.Book, event: bkper.Event): string {
    return BotService.flagAccountForRebuildIfNeeded(baseBook, event);
  }

  protected connectedTransactionFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, connectedTransaction: Bkper.Transaction, stockExcCode: string): string {
    let bookAnchor = super.buildBookAnchor(connectedBook);
    let record = `${connectedTransaction.getDate()} ${connectedTransaction.getAmount()} ${connectedTransaction.getCreditAccountName()} ${connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
    return `FOUND: ${bookAnchor}: ${record}`;
  }

  protected connectedTransactionNotFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, stockExcCode: string): string {
    let baseCreditAccount = baseBook.getAccount(transaction.creditAccount.id);
    let baseDebitAccount = baseBook.getAccount(transaction.debitAccount.id);
    let connectedBookAnchor = super.buildBookAnchor(connectedBook);

    let quantity = this.getQuantity(transaction);
    if (quantity == null) {
      return null;
    }
    let sell = false;
    let connectedCreditAccountName = this.getConnectedStockAccountName(baseCreditAccount);
    if (connectedCreditAccountName != null) {
      sell = true;
    } else {
      connectedCreditAccountName = 'Buy';
    }

    let connectedCreditAccount = connectedBook.getAccount(connectedCreditAccountName);
    if (connectedCreditAccount == null) {
        connectedCreditAccount = connectedBook.newAccount().setName(connectedCreditAccountName).setType(sell ? BkperApp.AccountType.ASSET : BkperApp.AccountType.INCOMING).create();
    }

    let buy = false;
    let connectedDebitAccountName = this.getConnectedStockAccountName(baseDebitAccount);
    if (connectedDebitAccountName != null) {
      buy = true;
    } else {
      connectedDebitAccountName = 'Sell';
    }

    let connectedDebitAccount = connectedBook.getAccount(connectedDebitAccountName);
    if (connectedDebitAccount == null) {
        connectedDebitAccount = connectedBook.newAccount().setName(connectedDebitAccountName).setType(buy ? BkperApp.AccountType.ASSET : BkperApp.AccountType.OUTGOING).create();
    }

    let selling = sell && !buy;
    let buying = buy && !sell;
    
    if (selling || buying) {

      let price = new Number(transaction.amount).valueOf() / quantity;

      let newTransaction = connectedBook.newTransaction()
      .setDate(transaction.date)
      .setAmount(quantity)
      .setCreditAccount(connectedCreditAccount)
      .setDebitAccount(connectedDebitAccount)
      .setDescription(transaction.description)
      .addRemoteId(transaction.id)
      .setProperty('price', price.toFixed(baseBook.getFractionDigits()))

      if (buy) {
        newTransaction.setProperty('original_quantity', quantity.toFixed(0));
      }

      let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${connectedCreditAccount.getName()} ${connectedDebitAccount.getName()} ${newTransaction.getDescription()}`;
      newTransaction.post();

      return `POSTED: ${connectedBookAnchor}: ${record}`;
    }

  }

  private getConnectedStockAccountName(baseAccount: Bkper.Account) {
    let stockExchangeCode = BotService.getStockExchangeCode(baseAccount);
    if (stockExchangeCode != null) {
      return baseAccount.getName();
    }
    return null;
  }

}