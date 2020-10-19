
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

    if (this.getInstrument(transactionPayload) == null) {
      return null;
    }

    if (this.getQuantity(transactionPayload) == null) {
      return null;
    }

    let responses: string[] = [];

    let feesResponse = this.processFees(baseBook, transactionPayload);
    if (feesResponse) {
      responses.push(feesResponse);
    }

    let interestResponse = this.processInterest(baseBook, transactionPayload);
    if (interestResponse) {
      responses.push(interestResponse);
    }

    let instrumentResponse = this.processInstrument(baseBook, transactionPayload);
    if (instrumentResponse) {
      responses.push(instrumentResponse);
    }

    return responses;
  }

  protected processFees(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): string {
    let fees = this.getFees(transactionPayload);
    if (fees != 0) {
      let settlementDate = this.getSettlementDate(transactionPayload);
      let exchangeAccount = this.getExchangeAccount(baseBook, transactionPayload);
      let feesAccountName = exchangeAccount.getProperty(STOCK_FEES_ACCOUNT_PROP);
      if (feesAccountName == null) {
        feesAccountName = 'Fees';
      }
      let feesAccount = baseBook.getAccount(feesAccountName);
      if (feesAccount == null) {
        feesAccount = baseBook.newAccount().setName(feesAccountName).setType(BkperApp.AccountType.OUTGOING).create();
      }
      let tx = baseBook.newTransaction()
        .setAmount(fees)
        .from(exchangeAccount)
        .to(feesAccount)
        .setDescription(transactionPayload.description)
        .setDate(settlementDate)
        .addRemoteId(`${FEES_PROP}_${transactionPayload.id}`)
        .post();

        return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }


  protected getInstrumentAccount(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): Bkper.Account {
    let instrument = this.getInstrument(transactionPayload);
    let instrumentAccount = baseBook.getAccount(instrument);
    if (instrumentAccount == null) {
      instrumentAccount =  baseBook.newAccount().setName(instrument).setType(BkperApp.AccountType.ASSET).create();
    }
    return instrumentAccount;
  }

  protected getExchangeAccount(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): Bkper.Account {
    return baseBook.getAccount(transactionPayload.debitAccount.id);
  }

  protected getQuantity(transactionPayload: bkper.Transaction): string {
    return transactionPayload.properties[QUANTITY_PROP];
  }

  protected getInstrument(transactionPayload: bkper.Transaction): string {
    return transactionPayload.properties[INSTRUMENT_PROP];
  }

  protected getSettlementDate(transactionPayload: bkper.Transaction): string {
    return transactionPayload.properties[SETTLEMENT_DATE_PROP];
  }

  protected getFees(transactionPayload: bkper.Transaction): number {
    let feesProp = transactionPayload.properties[FEES_PROP];
    return feesProp ? +feesProp : 0;
  }

  protected getInterest(transactionPayload: bkper.Transaction): number {
    let interestProp = transactionPayload.properties[INTEREST_PROP];
    return interestProp ? +interestProp : 0;
  }
  
  protected processInterest(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): string {
    let instrument = this.getInstrument(transactionPayload);
    let interest = this.getInterest(transactionPayload);
    if (interest != 0) {
      let settlementDate = this.getSettlementDate(transactionPayload);
      let exchangeAccount = this.getExchangeAccount(baseBook, transactionPayload);
      let interestAccountName =  `${instrument} Interest`;
      let interestAccount = baseBook.getAccount(interestAccountName);
      if (interestAccount == null) {
        interestAccount = baseBook.newAccount().setName(interestAccountName).setType(BkperApp.AccountType.ASSET).create();
      }
      let tx = baseBook.newTransaction()
        .setAmount(interest)
        .from(exchangeAccount)
        .to(interestAccount)
        .setDescription(transactionPayload.description)
        .setDate(settlementDate)
        .addRemoteId(`${INTEREST_PROP}_${transactionPayload.id}`)
        .post();
        return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
    }
    return null;
  }

  protected processInstrument(baseBook: Bkper.Book, transactionPayload: bkper.Transaction): string {
    let exchangeAccount = this.getExchangeAccount(baseBook, transactionPayload);
    let instrumentAccount = this.getInstrumentAccount(baseBook, transactionPayload);
    let quantity = this.getQuantity(transactionPayload);
    let fees = this.getFees(transactionPayload);
    let interest = this.getInterest(transactionPayload);
    let settlementDate = this.getSettlementDate(transactionPayload);
    let tx = baseBook.newTransaction()
    .setAmount(+transactionPayload.amount - interest - fees)
    .from(exchangeAccount)
    .to(instrumentAccount)
    .setDescription(transactionPayload.description)
    .setDate(settlementDate)
    .setProperty(QUANTITY_PROP, quantity)
    .addRemoteId(`${INSTRUMENT_PROP}_${transactionPayload.id}`)
    .post();
    return `${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`;
  }
  
  
}