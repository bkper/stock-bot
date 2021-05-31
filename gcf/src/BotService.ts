import { Account, AccountType, Bkper, Book, Group, Transaction } from 'bkper';
import { EXC_CODE_PROP, NEEDS_REBUILD_PROP, STOCK_BOOK_PROP, STOCK_EXC_CODE_PROP, STOCK_REALIZED_DATE_PROP } from './constants';

export function isStockBook(book: Book): boolean {
  if (book.getProperty(STOCK_BOOK_PROP)) {
    return true;
  }
  if (book.getFractionDigits() == 0) {
    return true;
  }
  return false;
}
export function getStockBook(book: Book): Book {
  if (book.getCollection() == null) {
    return null;
  }
  let connectedBooks = book.getCollection().getBooks();
  for (const connectedBook of connectedBooks) {
    if (connectedBook.getProperty(STOCK_BOOK_PROP)) {
      return connectedBook;
    }
    let fractionDigits = connectedBook.getFractionDigits();
    if (fractionDigits == 0) {
      return connectedBook;
    }
  }
  return null;
}

export async function getStockAccount(stockTransaction: Transaction): Promise<Account> {
  if (await isSale(stockTransaction)) {1
    return await stockTransaction.getCreditAccount();
  }
  if (await isPurchase(stockTransaction)) {
    return await stockTransaction.getDebitAccount();
  }
  return null;
}

export async function flagStockAccountForRebuildIfNeeded(stockTransaction: Transaction) {
  let stockAccount = await getStockAccount(stockTransaction);
  let lastTxDate = stockAccount.getProperty(STOCK_REALIZED_DATE_PROP);
  if (lastTxDate != null && stockTransaction.getDateValue() <= +lastTxDate) {
    await stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
  }
}

export async function getStockExchangeCode(account: Account): Promise<string> {
  if (account == null || account.getType() != AccountType.ASSET) {
    return null;
  }
  let groups = await account.getGroups();
  if (groups != null) {
    for (const group of groups) {
      if (group == null) {
        continue;
      }

      let stockExchange = group.getProperty(STOCK_EXC_CODE_PROP);
      if (stockExchange != null && stockExchange.trim() != '') {
        return stockExchange;
      }
    }
  }

  return null;
}

export async function getStockExchangeGroup(account: Account): Promise<Group> {
  if (account == null || account.getType() != AccountType.ASSET) {
    return null;
  }
  let groups = await account.getGroups();
  if (groups != null) {
    for (const group of groups) {
      let stockExchange = group.getProperty(STOCK_EXC_CODE_PROP);
      if (stockExchange != null && stockExchange.trim() != '') {
        return group;
      }
    }
  }
  return null;
}

export async function isSale(transaction: Transaction): Promise<boolean> {
  return transaction.isPosted() && (await transaction.getDebitAccount()).getType() == AccountType.OUTGOING;
}

export async function isPurchase(transaction: Transaction): Promise<boolean> {
  return transaction.isPosted() && (await transaction.getCreditAccount()).getType() == AccountType.INCOMING;
}

export function getExcCode(book: Book): string {
  return book.getProperty(EXC_CODE_PROP, 'exchange_code');
}

