
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

    let instrumentProp = transactionPayload.properties[INSTRUMENT_PROP];

    if (instrumentProp == null) {
      return null;
    }

    let exchangeAccount = baseBook.getAccount(transactionPayload.debitAccount.id);

    let instrumentAccount = baseBook.getAccount(instrumentProp);
    if (instrumentAccount == null) {
      instrumentAccount =  baseBook.newAccount().setName(instrumentProp).setType(BkperApp.AccountType.ASSET).create();
    }

    let quantity = transactionPayload.properties[QUANTITY_PROP];

    if (quantity == null) {
      return null;
    }

    let feesProp = transactionPayload.properties[FEES_PROP];
    let fees: number = feesProp ? +feesProp : 0;

    let interestProp = transactionPayload.properties[INTEREST_PROP];
    let interest: number = interestProp ? +interestProp : 0;

    let settlementDateProp = transactionPayload.properties[SETTLEMENT_DATE_PROP];
    
    if (settlementDateProp == null) {
      settlementDateProp = transactionPayload.date;
    }

    let responses: string[] = [];

    if (fees != 0) {
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
        .setDate(settlementDateProp)
        .post();

        responses.push(`${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`)
    }

    if (interest != 0) {
      let interestAccountName = exchangeAccount.getProperty(STOCK_INT_ACCOUNT_PROP);
      if (interestAccountName == null) {
        interestAccountName = `${instrumentProp} Interest`;
      }
      let interestAccount = baseBook.getAccount(interestAccountName);
      if (interestAccount == null) {
        interestAccount = baseBook.newAccount().setName(interestAccountName).setType(BkperApp.AccountType.ASSET).create();
      }
      let tx = baseBook.newTransaction()
        .setAmount(interest)
        .from(exchangeAccount)
        .to(interestAccount)
        .setDescription(transactionPayload.description)
        .setDate(settlementDateProp)
        .post();
        responses.push(`${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`)
    }

    let tx = baseBook.newTransaction()
    .setAmount(+transactionPayload.amount - interest - fees)
    .from(exchangeAccount)
    .to(instrumentAccount)
    .setDescription(transactionPayload.description)
    .setDate(settlementDateProp)
    .setProperty(QUANTITY_PROP, quantity)
    .post();
    responses.push(`${tx.getDate()} ${tx.getAmount()} ${tx.getCreditAccountName()} ${tx.getDebitAccountName()} ${tx.getDescription()}`)

    return responses;
  }

}