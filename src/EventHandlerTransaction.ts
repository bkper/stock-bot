interface AmountDescription {
  amount: number;
  description: string;
}

abstract class EventHandlerTransaction extends EventHandler {

  processObject(financialBook: Bkper.Book, stockBook: Bkper.Book, event: bkper.Event): string {
    let excCode = BotService.getExcCode(financialBook);
    let operation = event.data.object as bkper.TransactionOperation;
    let financialTransaction = operation.transaction;

    if (!financialTransaction.posted) {
      return null;
    }

    let iterator = stockBook.getTransactions(this.getTransactionQuery(financialTransaction));

    let stockExcCode = this.getStockExcCodeFromTransaction(financialBook, financialTransaction);
    
    if (!this.matchStockExchange(stockExcCode, excCode)) {
      return null;
    }

    if (iterator.hasNext()) {
      let stockTransaction = iterator.next();
      return this.connectedTransactionFound(financialBook, stockBook, financialTransaction, stockTransaction, stockExcCode);
    } else {
      return this.connectedTransactionNotFound(financialBook, stockBook, financialTransaction, stockExcCode)
    }
  }
  
  protected getQuantity(stockBook: Bkper.Book, transaction: bkper.Transaction): number {
    let quantityStr = transaction.properties[QUANTITY_PROP];
    if (quantityStr == null || quantityStr.trim() == '') {
      return null;
    }
    return Math.abs(stockBook.parseValue(quantityStr));
  }

  private getStockExcCodeFromTransaction(financialBook: Bkper.Book, fiancialTransaction: bkper.Transaction) {

    let financialCreditAccount = fiancialTransaction.creditAccount != null ? financialBook.getAccount(fiancialTransaction.creditAccount.id) : null;
    let financialDebitAccount = fiancialTransaction.debitAccount != null ? financialBook.getAccount(fiancialTransaction.debitAccount.id) : null;

    let stockExcCode = BotService.getStockExchangeCode(financialCreditAccount);
    if (stockExcCode == null) {
      stockExcCode = BotService.getStockExchangeCode(financialDebitAccount);
    }
    return stockExcCode;
  }

  protected abstract getTransactionQuery(transaction: bkper.Transaction): string;

  protected abstract connectedTransactionNotFound(financialBook: Bkper.Book, stockBook: Bkper.Book, financialTransaction: bkper.Transaction, stockExcCode: string): string;

  protected abstract connectedTransactionFound(baseBook: Bkper.Book, connectedBook: Bkper.Book, financialTransaction: bkper.Transaction, stockTransaction: Bkper.Transaction, stockExcCode: string): string;
}