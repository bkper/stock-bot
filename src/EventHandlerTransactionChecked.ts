
class EventHandlerTransactionChecked extends EventHandlerTransaction {

  STOCK_ACCOUNT_PROP = 'stock_account';
  ACCOUNT_NAME_VAR = '${account.name}';

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, connectedTransaction: Bkper.Transaction): string {
    let bookAnchor = super.buildBookAnchor(connectedBook);
    let record = `${connectedTransaction.getDate()} ${connectedTransaction.getAmount()} ${connectedTransaction.getCreditAccountName()} ${connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
    return `${bookAnchor}: ${record}`;
  }

  protected connectedTransactionNotFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction): string {
    let baseCreditAccount = baseBook.getAccount(transaction.creditAccount.id);
    let baseDebitAccount = baseBook.getAccount(transaction.debitAccount.id);
    let connectedBookAnchor = super.buildBookAnchor(connectedBook);

    let quantity = this.getQuantity(transaction);
    if (quantity == null) {
      return null;
    }
    let sell = false;
    let connectedCreditAccountName = baseCreditAccount.getProperty(this.STOCK_ACCOUNT_PROP);
    if (connectedCreditAccountName != null) {
      connectedCreditAccountName = connectedCreditAccountName.replace(this.ACCOUNT_NAME_VAR, baseCreditAccount.getName())
      sell = true;
    } else {
      connectedCreditAccountName = 'Buy';
    }

    let connectedCreditAccount = connectedBook.getAccount(connectedCreditAccountName);
    if (connectedCreditAccount == null) {
        connectedCreditAccount = connectedBook.newAccount().setName(connectedCreditAccountName).setType(sell ? BkperApp.AccountType.ASSET : BkperApp.AccountType.INCOMING).create();
    }

    let buy = false;
    let connectedDebitAccountName = baseDebitAccount.getProperty(this.STOCK_ACCOUNT_PROP);
    if (connectedDebitAccountName != null) {
      connectedDebitAccountName = connectedDebitAccountName.replace(this.ACCOUNT_NAME_VAR, baseDebitAccount.getName())
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
      .setProperty('price', price.toFixed(baseBook.getFractionDigits()));

      if (this.isReadyToPost(newTransaction)) {
        newTransaction.post();
      } else {
        newTransaction.setDescription(`${newTransaction.getCreditAccount() == null ? baseCreditAccount.getName() : ''} ${newTransaction.getDebitAccount() == null ? baseDebitAccount.getName() : ''} ${newTransaction.getDescription()}`.trim())
        newTransaction.create();
      }

      let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${baseCreditAccount.getName()} ${baseDebitAccount.getName()} ${newTransaction.getDescription()}`;
      return `${connectedBookAnchor}: ${record}`;
    }

  }


  private isReadyToPost(newTransaction: Bkper.Transaction) {
    return newTransaction.getCreditAccount() != null && newTransaction.getDebitAccount() != null && newTransaction.getAmount() != null;
  }


}