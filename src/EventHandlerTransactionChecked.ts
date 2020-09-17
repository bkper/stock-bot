
class EventHandlerTransactionChecked extends EventHandlerTransaction {

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

    let quantityStr = transaction.properties['quantity'];
    let quantity: number;
    if (quantityStr == null || quantityStr.trim() == '') {
      return null;
    }

    quantity = new Number(quantityStr).valueOf();

    let sell = false;
    let connectedCreditAccountName = baseCreditAccount.getProperty('stock_account');
    if (connectedCreditAccountName != null) {
      connectedCreditAccountName.replace('${account.name}', baseCreditAccount.getName())
      sell = true;
    } else {
      connectedCreditAccountName = 'Buy';
    }

    let connectedCreditAccount = connectedBook.getAccount(connectedCreditAccountName);
    if (connectedCreditAccount == null) {
      try {
        connectedCreditAccount = connectedBook.newAccount().setName(connectedCreditAccountName).setType(sell ? Bkper.AccountType.ASSET : Bkper.AccountType.INCOMING).create();
      } catch (err) {
        //OK
      }
    }

    let buy = false;
    let connectedDebitAccountName = baseDebitAccount.getProperty('stock_account');
    if (connectedDebitAccountName != null) {
      connectedDebitAccountName.replace('${account.name}', baseDebitAccount.getName())
      buy = true;
    } else {
      connectedDebitAccountName = 'Sell';
    }

    let connectedDebitAccount = connectedBook.getAccount(connectedDebitAccountName);
    if (connectedDebitAccount == null) {
      try {
        connectedDebitAccount = connectedBook.newAccount().setName(connectedDebitAccountName).setType(buy ? Bkper.AccountType.ASSET : Bkper.AccountType.OUTGOING).create();
      } catch (err) {
        //OK
      }
    }

    let selling = sell && !buy;
    let buying = buy && !sell;
    
    if (selling || buying) {

        let newTransaction = connectedBook.newTransaction()
        .setDate(transaction.date)
        .setAmount(quantity)
        .setCreditAccount(connectedCreditAccount)
        .setDebitAccount(connectedDebitAccount)
        .setDescription(transaction.description)
        .addRemoteId(transaction.id);

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