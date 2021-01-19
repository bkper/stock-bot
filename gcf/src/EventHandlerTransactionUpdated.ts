import { Amount, Book, Transaction } from "bkper";
import { flagStockAccountForRebuildIfNeeded, isPurchase, isSale } from "./BotService";
import { ORIGINAL_AMOUNT_PROP, ORIGINAL_QUANTITY_PROP, PURCHASE_PRICE_PROP, SALE_PRICE_PROP } from "./constants";
import { EventHandlerTransaction } from "./EventHandlerTransaction";
import { InterceptorOrderProcessor } from "./InterceptorOrderProcessor";
import { InterceptorOrderProcessorDelete } from "./InterceptorOrderProcessorDelete";

export class EventHandlerTransactionUpdated extends EventHandlerTransaction {

  async intercept(baseBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {
    await new InterceptorOrderProcessorDelete().intercept(baseBook, event);
    return await new InterceptorOrderProcessor().intercept(baseBook, event);
  }

  protected getTransactionQuery(transaction: bkper.Transaction): string {
    return `remoteId:${transaction.id}`;
  }

  protected connectedTransactionNotFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockExcCode: string): Promise<string> {
    return null;
  }
  protected async connectedTransactionFound(financialBook: Book, stockBook: Book, financialTransaction: bkper.Transaction, stockTransaction: Transaction, stockExcCode: string): Promise<string> {

    if (!financialTransaction.posted) {
      return null;
    }

    let quantity = this.getQuantity(stockBook, financialTransaction);
    if (quantity == null || quantity.eq(0)) {
      return null;
    }

    if (stockTransaction.isChecked()) {
      stockTransaction.uncheck();
    }

    let price = new Amount(financialTransaction.amount).div(quantity);
    
    const originalAmount = new Amount(financialTransaction.amount);

    stockTransaction.setDate(financialTransaction.date)
    .setAmount(quantity)
    .setDescription(financialTransaction.description)
    .setProperty(ORIGINAL_QUANTITY_PROP, quantity.toFixed(stockBook.getFractionDigits()))
    .setProperty(ORIGINAL_AMOUNT_PROP, originalAmount.toString())
    ;

    if (await isPurchase(stockTransaction)) {
      stockTransaction.setProperty(PURCHASE_PRICE_PROP, price.toString())
    }

    if (await isSale(stockTransaction)) {
      stockTransaction.setProperty(SALE_PRICE_PROP, price.toString())
    }

    try {
      await stockTransaction.update();
    } catch (err) {
      //Maybe is checked
      await stockTransaction.uncheck();
      await stockTransaction.update();
    }

    await flagStockAccountForRebuildIfNeeded(stockTransaction);

    let bookAnchor = super.buildBookAnchor(stockBook);
    let record = `EDITED: ${stockTransaction.getDateFormatted()} ${quantity} ${await stockTransaction.getCreditAccountName()} ${await stockTransaction.getDebitAccountName()} ${stockTransaction.getDescription()}`;
    return `${bookAnchor}: ${record}`;
  }

}
