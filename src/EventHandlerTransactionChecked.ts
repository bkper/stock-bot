
class EventHandlerTransactionChecked extends EventHandlerTransaction {

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
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
      .setProperty('code', stockExcCode)
      ;

      let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${connectedCreditAccount.getName()} ${connectedDebitAccount.getName()} ${newTransaction.getDescription()}`;
      newTransaction.post();
      if (selling) {
        this.sell(baseBook, connectedBook, newTransaction);
      }

      return `POSTED: ${connectedBookAnchor}: ${record}`;
    }

  }

  private isReadyToPost(newTransaction: Bkper.Transaction) {
    return newTransaction.getCreditAccount() != null && newTransaction.getDebitAccount() != null && newTransaction.getAmount() != null;
  }

  private sell(baseBook: Bkper.Book, connectedBook: Bkper.Book, sellTransaction: Bkper.Transaction): void {

    let iterator = connectedBook.getTransactions(`account:'${sellTransaction.getCreditAccountName()}' is:unchecked`);
    let buyTransactions: Bkper.Transaction[] = [];
    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get buy only
      if (tx.getDebitAccountName() == sellTransaction.getCreditAccountName()) {
        buyTransactions.push(tx);
      }
    }

    //FIFO
    buyTransactions = buyTransactions.reverse();

    let sellPrice: number = +sellTransaction.getProperty('price');

    let gainTotal = 0;
    let soldQuantity = sellTransaction.getAmount();

    for (const buyTransaction of buyTransactions) {
      
      let buyPrice: number = +buyTransaction.getProperty('price');
      let buyQuantity = buyTransaction.getAmount();
      
      if (soldQuantity >= buyQuantity ) {
        let gain = (sellPrice * buyQuantity) - (buyPrice * buyQuantity); 
        buyTransaction
        .setProperty('sold_for', sellPrice.toFixed(baseBook.getFractionDigits()))
        .addRemoteId(sellTransaction.getId())
        .update().check();
        gainTotal += gain;
        soldQuantity -= buyQuantity;
      } else {
        let remainingBuyQuantity = buyQuantity - soldQuantity;
        buyTransaction
        .setAmount(remainingBuyQuantity)
        .update();

        let partialBuyQuantity = buyQuantity - remainingBuyQuantity;

        console.log(`partialBuyQuantity: ${partialBuyQuantity}`)

        let gain = (sellPrice * partialBuyQuantity) - (buyPrice * partialBuyQuantity); 

        let newTransaction = connectedBook.newTransaction()
        .setDate(buyTransaction.getDate())
        .setAmount(partialBuyQuantity)
        .setCreditAccount(buyTransaction.getCreditAccount())
        .setDebitAccount(buyTransaction.getDebitAccount())
        .setDescription(buyTransaction.getDescription())
        .setProperty('price', buyTransaction.getProperty('price'))
        .setProperty('code', buyTransaction.getProperty('code'))
        .setProperty('sold_for', sellPrice.toFixed(baseBook.getFractionDigits()))
        .post()
        .check()
        soldQuantity -= partialBuyQuantity;
        gainTotal += gain;

      }

      if (soldQuantity == 0) {
        break;
      }

    }

    if (gainTotal > 0) {
      baseBook.record(`#stock_gain ${baseBook.formatValue(gainTotal)}`)
    } else if (gainTotal < 0) {
      baseBook.record(`#stock_loss ${baseBook.formatValue(gainTotal * -1)}`)
    }

    sellTransaction.check();
  }


}