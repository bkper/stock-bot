
class InterceptorOrderProcessor {

  intercept(baseBook: Bkper.Book, event: bkper.Event): string[] | string {
    if (event.agent.id == 'exchange-bot') {
      return null;
    }

    if (baseBook.getFractionDigits() == 0) {
      return null;
    }

    let operation = event.data.object as bkper.TransactionOperation;
    let transactionPayload = operation.transaction;

    if (!transactionPayload.posted) {
      return null;
    }

    if (this.getQuantity(baseBook, transactionPayload) == null) {
      return null;
    }

    if (this.isPurchase(baseBook, transactionPayload)) {
      return this.processPurchase(baseBook, transactionPayload);
    }

    if (this.isSale(baseBook, transactionPayload)) {
      return this.processSale(baseBook, transactionPayload);
    }

    return null;

  }

  protected processSale(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): string[] {
    let responses: string[] = [];
    let exchangeAccount = this.getExchangeAccountOnSale(baseBook, transactionPayload);
    let feesResponse = this.postFees(baseBook, exchangeAccount, transactionPayload);
    if (feesResponse) {
      responses.push(feesResponse);
    }

    let interestResponse = this.postInterestOnSale(baseBook, exchangeAccount, transactionPayload);
    if (interestResponse) {
      responses.push(interestResponse);
    }

    let instrumentResponse = this.postInstrumentTradeOnSale(baseBook, exchangeAccount, transactionPayload);
    if (instrumentResponse) {
      responses.push(instrumentResponse);
    }

    return responses;    
  }

  protected processPurchase(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): string[] {
    let responses: string[] = [];

    let exchangeAccount = this.getExchangeAccountOnPurchase(baseBook, transactionPayload);

    let feesResponse = this.postFees(baseBook, exchangeAccount, transactionPayload);
    if (feesResponse) {
      responses.push(feesResponse);
    }

    let interestResponse = this.postInterestOnPurchase(baseBook, exchangeAccount, transactionPayload);
    if (interestResponse) {
      responses.push(interestResponse);
    }

    let instrumentResponse = this.postInstrumentTradeOnPurchase(baseBook, exchangeAccount, transactionPayload);
    if (instrumentResponse) {
      responses.push(instrumentResponse);
    }

    return responses;
  }

  protected isPurchase(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): boolean {

    if (this.getInstrument(transactionPayload) == null) {
      return false;
    }

    if (this.getTradeDate(transactionPayload) == null) {
      return false;
    }

    let exchangeAccount = this.getExchangeAccountOnPurchase(baseBook, transactionPayload);

    if (this.getFeesAccountName(exchangeAccount) == null) {
      return false;
    } 

    return true;
  }


  protected isSale(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): boolean {

    if (this.getInstrument(transactionPayload) == null) {
      return false;
    }

    if (this.getTradeDate(transactionPayload) == null) {
      return false;
    }

    let exchangeAccount = this.getExchangeAccountOnSale(baseBook, transactionPayload);
    if (this.getFeesAccountName(exchangeAccount) == null) {
      return false;
    }

    return true;
  }


  private getExchangeAccountOnSale(baseBook: Bkper.Book, transactionPayload: bkper.Transaction) {
    return baseBook.getAccount(transactionPayload.creditAccount.id);
  }

  private getExchangeAccountOnPurchase(baseBook: Bkper.Book, transactionPayload: bkper.Transaction) {
    return baseBook.getAccount(transactionPayload.debitAccount.id);
  }

  protected getInstrumentAccount(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): Bkper.Account {
    let instrument = this.getInstrument(transactionPayload);
    let instrumentAccount = baseBook.getAccount(instrument);
    if (instrumentAccount == null) {
      instrumentAccount =  baseBook.newAccount().setName(instrument).setType(BkperApp.AccountType.ASSET).create();
    }
    return instrumentAccount;
  }

  protected getQuantity(book: Bkper.Book, transactionPayload: bkper.Transaction): string {
    let quantityProp = transactionPayload.properties[QUANTITY_PROP];
    if (quantityProp == null) {
      return null;
    }
    return book.parseValue(quantityProp).toFixed(0);    
  }

  protected getInstrument(transactionPayload: bkper.Transaction): string {
    return transactionPayload.properties[INSTRUMENT_PROP];
  }

  protected getTradeDate(transactionPayload: bkper.Transaction): string {
    return transactionPayload.properties[TRADE_DATE_PROP];
  }

  protected getFees(book: Bkper.Book, transactionPayload: bkper.Transaction): number {
    let feesProp = transactionPayload.properties[FEES_PROP];
    return feesProp ? book.parseValue(feesProp) : 0;
  }

  protected getInterest(book: Bkper.Book, transactionPayload: bkper.Transaction): number {
    let interestProp = transactionPayload.properties[INTEREST_PROP];
    return interestProp ? book.parseValue(interestProp) : 0;
  }

  protected getFeesAccountName(exchangeAccount: Bkper.Account): string {
    return exchangeAccount.getProperty(STOCK_FEES_ACCOUNT_PROP);
  }

  protected getFeesAccount(baseBook: Bkper.Book, feesAccountName: string): Bkper.Account {
    let feesAccount = baseBook.getAccount(feesAccountName);
    if (feesAccount == null) {
      feesAccount = baseBook.newAccount().setName(feesAccountName).setType(BkperApp.AccountType.OUTGOING).create();
    }
    return feesAccount;
  }

  private getInterestAccount(instrument: string, baseBook: Bkper.Book) {
    let interestAccountName = `${instrument} Interest`;
    let interestAccount = baseBook.getAccount(interestAccountName);
    if (interestAccount == null) {
      interestAccount = baseBook.newAccount().setName(interestAccountName).setType(BkperApp.AccountType.ASSET).create();
    }
    return interestAccount;
  }

  protected postFees(baseBook: Bkper.Book, exchangeAccount: Bkper.Account, transactionPayload: bkper.Transaction): string {
    let fees = this.getFees(baseBook, transactionPayload);
    if (fees != 0) {
      let tradeDate = this.getTradeDate(transactionPayload);
      let feesAccountName = this.getFeesAccountName(exchangeAccount);
      let feesAccount = this.getFeesAccount(baseBook, feesAccountName);
      let tx = baseBook.newTransaction()
        .setAmount(fees)
        .from(exchangeAccount)
        .to(feesAccount)
        .setDescription(transactionPayload.description)
        .setDate(tradeDate)
        .addRemoteId(`${FEES_PROP}_${transactionPayload.id}`)
        .post();

        return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

  
  protected postInterestOnPurchase(baseBook: Bkper.Book, exchangeAccount: Bkper.Account, transactionPayload: bkper.Transaction): string {
    let instrument = this.getInstrument(transactionPayload);
    let interest = this.getInterest(baseBook, transactionPayload);
    if (interest != 0) {
      let tradeDate = this.getTradeDate(transactionPayload);
      let interestAccount = this.getInterestAccount(instrument, baseBook);
      let tx = baseBook.newTransaction()
        .setAmount(interest)
        .from(exchangeAccount)
        .to(interestAccount)
        .setDescription(transactionPayload.description)
        .setDate(tradeDate)
        .addRemoteId(`${INTEREST_PROP}_${transactionPayload.id}`)
        .post();
        return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

  protected postInterestOnSale(baseBook: Bkper.Book, exchangeAccount: Bkper.Account, transactionPayload: bkper.Transaction): string {
    let instrument = this.getInstrument(transactionPayload);
    let interest = this.getInterest(baseBook, transactionPayload);
    if (interest != 0) {
      let interestAccount = this.getInterestAccount(instrument, baseBook);
      let tradeDate = this.getTradeDate(transactionPayload);
      let tx = baseBook.newTransaction()
        .setAmount(interest)
        .from(interestAccount)
        .to(exchangeAccount)
        .setDescription(transactionPayload.description)
        .setDate(tradeDate)
        .addRemoteId(`${INTEREST_PROP}_${transactionPayload.id}`)
        .post();
        return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

  protected postInstrumentTradeOnPurchase(baseBook: Bkper.Book, exchangeAccount: Bkper.Account, transactionPayload: bkper.Transaction): string {
    let instrumentAccount = this.getInstrumentAccount(baseBook, transactionPayload);
    let quantity = this.getQuantity(baseBook, transactionPayload);
    let fees = this.getFees(baseBook, transactionPayload);
    let interest = this.getInterest(baseBook, transactionPayload);
    let tradeDate = this.getTradeDate(transactionPayload);
    let tx = baseBook.newTransaction()
    .setAmount(+transactionPayload.amount - interest - fees)
    .from(exchangeAccount)
    .to(instrumentAccount)
    .setDescription(transactionPayload.description)
    .setDate(tradeDate)
    .setProperty(QUANTITY_PROP, quantity)
    .addRemoteId(`${INSTRUMENT_PROP}_${transactionPayload.id}`)
    .post();
    return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
  }

  protected postInstrumentTradeOnSale(baseBook: Bkper.Book, exchangeAccount: Bkper.Account, transactionPayload: bkper.Transaction): string {
    let instrumentAccount = this.getInstrumentAccount(baseBook, transactionPayload);
    let quantity = this.getQuantity(baseBook, transactionPayload);
    let fees = this.getFees(baseBook, transactionPayload);
    let interest = this.getInterest(baseBook, transactionPayload);
    let tradeDate = this.getTradeDate(transactionPayload);
    let tx = baseBook.newTransaction()
    .setAmount(+transactionPayload.amount - interest + fees)
    .from(instrumentAccount)
    .to(exchangeAccount)
    .setDescription(transactionPayload.description)
    .setDate(tradeDate)
    .setProperty(QUANTITY_PROP, quantity)
    .addRemoteId(`${INSTRUMENT_PROP}_${transactionPayload.id}`)
    .post();
    return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
  }
  
}