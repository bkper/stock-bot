
class EventHandlerTransactionChecked extends EventHandlerTransaction {

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    let response = new InterceptorFlagRebuild().intercept(baseBook, event);
    return response;
  }

  protected connectedTransactionFound(financialBook: Bkper.Book, stockBook: Bkper.Book, transaction: bkper.Transaction, connectedTransaction: Bkper.Transaction, stockExcCode: string): string {
    let bookAnchor = super.buildBookAnchor(stockBook);
    let record = `${connectedTransaction.getDate()} ${connectedTransaction.getAmount()} ${connectedTransaction.getCreditAccountName()} ${connectedTransaction.getDebitAccountName()} ${connectedTransaction.getDescription()}`;
    return `FOUND: ${bookAnchor}: ${record}`;
  }

  protected connectedTransactionNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, transaction: bkper.Transaction, stockExcCode: string): string {
    let financialCreditAccount = financialBook.getAccount(transaction.creditAccount.id);
    let financialDebitAccount = financialBook.getAccount(transaction.debitAccount.id);
    let stockBookAnchor = super.buildBookAnchor(stockBook);

    let quantity = this.getQuantity(stockBook, transaction);
    if (quantity == null || quantity == 0) {
      return null;
    }

    const originalAmount = new Number(transaction.amount).valueOf();

    let price = originalAmount / quantity;

    let stockAccount = this.getConnectedStockAccount(financialBook, stockBook, financialCreditAccount);


    if (stockAccount) {
      //Selling
      let stockSellAccount = stockBook.getAccount(STOCK_SELL_ACCOUNT_NAME);
      if (stockSellAccount == null) {
        stockSellAccount = stockBook.newAccount().setName(STOCK_SELL_ACCOUNT_NAME).setType(BkperApp.AccountType.OUTGOING).create();
      }

      let newTransaction = stockBook.newTransaction()
      .setDate(transaction.date)
      .setAmount(quantity)
      .setCreditAccount(stockAccount)
      .setDebitAccount(stockSellAccount)
      .setDescription(transaction.description)
      .addRemoteId(transaction.id)
      .setProperty(SALE_PRICE_PROP, price.toFixed(financialBook.getFractionDigits()+1))
      .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toFixed(0))
      .setProperty(ORIGINAL_AMOUNT_PROP, originalAmount.toFixed(financialBook.getFractionDigits()))
      .post()

      this.checkLastTxDate(stockAccount, transaction);

      let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${stockAccount.getName()} ${stockSellAccount.getName()} ${newTransaction.getDescription()}`;
      return `SELL: ${stockBookAnchor}: ${record}`;

    } else {
      stockAccount = this.getConnectedStockAccount(financialBook, stockBook, financialDebitAccount);
      if (stockAccount) {
        //Buying
        let stockBuyAccount = stockBook.getAccount(STOCK_BUY_ACCOUNT_NAME);
        if (stockBuyAccount == null) {
          stockBuyAccount = stockBook.newAccount().setName(STOCK_BUY_ACCOUNT_NAME).setType(BkperApp.AccountType.OUTGOING).create();
        }        

        let newTransaction = stockBook.newTransaction()
        .setDate(transaction.date)
        .setAmount(quantity)
        .setCreditAccount(stockBuyAccount)
        .setDebitAccount(stockAccount)
        .setDescription(transaction.description)
        .addRemoteId(transaction.id)
        .setProperty(PURCHASE_PRICE_PROP, price.toFixed(financialBook.getFractionDigits()+1))
        .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toFixed(0))
        .setProperty(ORIGINAL_AMOUNT_PROP, originalAmount.toFixed(financialBook.getFractionDigits()))
        .post()

        this.checkLastTxDate(stockAccount, transaction);

        let record = `${newTransaction.getDate()} ${newTransaction.getAmount()} ${stockBuyAccount.getName()} ${stockAccount.getName()} ${newTransaction.getDescription()}`;
        return `BUY: ${stockBookAnchor}: ${record}`;
      }

    }

    return null;

  }

  private checkLastTxDate(stockAccount: Bkper.Account, transaction: bkper.Transaction) {
    let lastTxDate = stockAccount.getProperty(STOCK_RR_DATE_PROP);
    if (lastTxDate != null && transaction.dateValue <= +lastTxDate) {
      stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
    }
  }

  private getConnectedStockAccount(financialBook: Bkper.Book, stockBook: Bkper.Book, financialAccount: Bkper.Account, ): Bkper.Account {
    let stockExchangeCode = BotService.getStockExchangeCode(financialAccount);
    if (stockExchangeCode != null) {
      let stockAccount = stockBook.getAccount(financialAccount.getName());
      if (stockAccount == null) {
        stockAccount = stockBook.newAccount()
          .setName(financialAccount.getName())
          .setType(financialAccount.getType())
          .setProperties(financialAccount.getProperties())
          .setArchived(financialAccount.isArchived());
        if (financialAccount.getGroups()) {
          financialAccount.getGroups().forEach(financialGroup => {
            if (financialGroup) {
              let stockGroup = stockBook.getGroup(financialGroup.getName());
              let stockExcCode = financialGroup.getProperty(STOCK_EXC_CODE_PROP);
              if (stockGroup == null && stockExcCode != null && stockExcCode.trim() != '') {
                stockGroup = stockBook.newGroup()
                  .setHidden(financialGroup.isHidden())
                  .setName(financialGroup.getName())
                  .setProperties(financialGroup.getProperties())
                  .create();
              }
              stockAccount.addGroup(stockGroup);
            }
          });
        }
        stockAccount = stockAccount.create();
      }
      return stockAccount;
    }
    return null;
  }

}