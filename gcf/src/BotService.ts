import { Account, AccountType, Bkper, Book, Group, Transaction } from 'bkper';
import { EXC_CODE_PROP, NEEDS_REBUILD_PROP, STOCK_EXC_CODE_PROP, STOCK_REALIZED_DATE_PROP } from './constants';

export async function auditBooks(bookId: string): Promise<void> {
  let book = await Bkper.getBook(bookId);
  let connectedBooks = book.getCollection().getBooks();
  connectedBooks.forEach(b => {
    b.audit();
  });

}

export function getStockBook(book: Book): Book {
  if (book.getCollection() == null) {
    return null;
  }
  let connectedBooks = book.getCollection().getBooks();
  for (const connectedBook of connectedBooks) {
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
    stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
  }
}

export function getFinancialBook(book: Book, excCode?: string): Book {
  if (book.getCollection() == null) {
    return null;
  }
  let connectedBooks = book.getCollection().getBooks();
  for (const connectedBook of connectedBooks) {
    let excCodeConnectedBook = getExcCode(connectedBook);
    let fractionDigits = connectedBook.getFractionDigits();
    if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
      return connectedBook;
    }
  }
  return null;
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

