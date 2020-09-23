interface AmountDescription {
  amount: number;
  description: string;
}

abstract class EventHandlerTransaction extends EventHandler {

  processObject(baseBook: Bkper.Book, connectedBook: Bkper.Book, event: bkper.Event): string {
    let excCode = this.getExcCode(baseBook);
    let operation = event.data.object as bkper.TransactionOperation;
    let transaction = operation.transaction;
    let iterator = connectedBook.getTransactions(this.getTransactionQuery(transaction));

    let stockExcCode = this.getStockExcCodeFromTransaction(baseBook, transaction);
    
    if (!this.matchStockExchange(stockExcCode, excCode)) {
      return null;
    }

    if (iterator.hasNext()) {
      let connectedTransaction = iterator.next();
      return this.connectedTransactionFound(baseBook, connectedBook, transaction, connectedTransaction, stockExcCode);
    } else {
      return this.connectedTransactionNotFound(baseBook, connectedBook, transaction, stockExcCode)
    }
  }
  
  protected getQuantity(transaction: bkper.Transaction): number {
    let quantityStr = transaction.properties['quantity'];
    if (quantityStr == null || quantityStr.trim() == '') {
      return null;
    }
    return new Number(quantityStr).valueOf();
  }

  private getStockExcCodeFromTransaction(baseBook: Bkper.Book, transaction: bkper.Transaction) {

    let baseCreditAccount = transaction.creditAccount != null ? baseBook.getAccount(transaction.creditAccount.id) : null;
    let baseDebitAccount = transaction.debitAccount != null ? baseBook.getAccount(transaction.debitAccount.id) : null;

    let stockExcCode = this.getStockExchangeCode(baseCreditAccount);
    if (stockExcCode == null) {
      stockExcCode = this.getStockExchangeCode(baseDebitAccount);
    }
    return stockExcCode;
  }

  protected abstract getTransactionQuery(transaction: bkper.Transaction): string;

  protected abstract connectedTransactionNotFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, stockExcCode: string): string;

  protected abstract connectedTransactionFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, transaction: bkper.Transaction, connectedTransaction: Bkper.Transaction, stockExcCode: string): string;
}