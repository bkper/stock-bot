import { Book, Transaction } from "bkper";
import { getExcCode, getStockExchangeCode } from "./BotService";
import { QUANTITY_PROP } from "./constants";
import { EventHandler } from "./EventHandler";

export interface AmountDescription {
  amount: number;
  description: string;
}

export abstract class EventHandlerTransaction extends EventHandler {

  async processObject(financialBook: Book, stockBook: Book, event: bkper.Event): Promise<string> {
    let excCode = getExcCode(financialBook);
    let operation = event.data.object as bkper.TransactionOperation;
    let financialTransaction = operation.transaction;

    if (!financialTransaction.posted) {
      return null;
    }

    let iterator = stockBook.getTransactions(this.getTransactionQuery(financialTransaction));

    let stockExcCode = await this.getStockExcCodeFromTransaction(financialBook, financialTransaction);
    
    if (!this.matchStockExchange(stockExcCode, excCode)) {
      return null;
    }

    if (await iterator.hasNext()) {
      let stockTransaction = await iterator.next();
      return await this.connectedTransactionFound(financialBook, stockBook, financialTransaction, stockTransaction, stockExcCode);
    } else {
      return await this.connectedTransactionNotFound(financialBook, stockBook, financialTransaction, stockExcCode)
    }
  }
  
  protected getQuantity(stockBook: Book, transaction: bkper.Transaction): number {
    let quantityStr = transaction.properties[QUANTITY_PROP];
    if (quantityStr == null || quantityStr.trim() == '') {
      return null;
    }
    return Math.abs(stockBook.parseValue(quantityStr));
  }

  private async getStockExcCodeFromTransaction(financialBook: Book, fiancialTransaction: bkper.Transaction) {

    let financialCreditAccount = fiancialTransaction.creditAccount != null ? await financialBook.getAccount(fiancialTransaction.creditAccount.id) : null;
    let financialDebitAccount = fiancialTransaction.debitAccount != null ? await financialBook.getAccount(fiancialTransaction.debitAccount.id) : null;

    let stockExcCode = getStockExchangeCode(financialCreditAccount);
    if (stockExcCode == null) {
      stockExcCode = getStockExchangeCode(financialDebitAccount);
    }
    return stockExcCode;
  }


  protected abstract getTransactionQuery(transaction: bkper.Transaction): string;

  protected abstract connectedTransactionNotFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockExcCode: string): Promise<string>;

  protected abstract connectedTransactionFound(baseBook: Book, connectedBook: Book, financialTransaction: bkper.Transaction, stockTransaction: Transaction, stockExcCode: string): Promise<string>;
}