
class EventHandlerTransactionPosted {

  handleEvent(event: bkper.Event): string | boolean {
    if (event.agent.id == 'exchange-bot') {
      return false;
    }

    let book = BkperApp.getBook(event.bookId);

    if (book.getFractionDigits() == 0) {
      return false;
    }

    let operation = event.data.object as bkper.TransactionOperation;
    let transactionPayload = operation.transaction;

    let instrumentProp = transactionPayload.properties[INSTRUMENT_PROP];

    if (instrumentProp == null) {
      return false;
    }

    let instrumentAccount = book.getAccount(instrumentProp);
    if (instrumentAccount == null) {
      instrumentAccount =  book.newAccount().setName(instrumentProp).setType(BkperApp.AccountType.ASSET).create();
    }

    let feesProp = transactionPayload.properties[FEES_PROP];
    let fees: number = feesProp ? +feesProp : 0;

    let interestProp = transactionPayload.properties[INTEREST_PROP];
    let interest: number = interestProp ? +interestProp : 0;


    let settlementDateProp = transactionPayload.properties[SETTLEMENT_DATE_PROP];
    

    
    return false;
  }

}