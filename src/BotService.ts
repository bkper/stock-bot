namespace BotService {

  export function auditBooks(bookId: string): void {
    let book = BkperApp.getBook(bookId);
    let connectedBooks = book.getCollection().getBooks();
    connectedBooks.forEach(b => {
      b.audit();
    });

  }

  export function getStockBook(book: Bkper.Book): Bkper.Book {
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

  export function getStockAccount(stockTransaction: Bkper.Transaction): Bkper.Account {
    if (isSale(stockTransaction)) {
      return stockTransaction.getCreditAccount();
    }
    if (isPurchase(stockTransaction)) {
      return stockTransaction.getDebitAccount();
    }
  }

  export function flagStockAccountForRebuildIfNeeded(stockTransaction: Bkper.Transaction) {
    let stockAccount = BotService.getStockAccount(stockTransaction);
    let lastTxDate = stockAccount.getProperty(STOCK_REALIZED_DATE_PROP);
    if (lastTxDate != null && stockTransaction.getDateValue() <= +lastTxDate) {
      stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
    }
  }

  export function getFinancialBook(book: Bkper.Book, excCode?: string): Bkper.Book {
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


  export function getStockExchangeCode(account: Bkper.Account): string {
    if (account == null || account.getType() != BkperApp.AccountType.ASSET) {
      return null;
    }
    let groups = account.getGroups();
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

  export function getStockExchangeGroup(account: Bkper.Account): Bkper.Group {
    if (account == null || account.getType() != BkperApp.AccountType.ASSET) {
      return null;
    }
    let groups = account.getGroups();
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

  export function isSale(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getDebitAccount().getType() == BkperApp.AccountType.OUTGOING;
  }

  export function isPurchase(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getCreditAccount().getType() == BkperApp.AccountType.INCOMING;
  }

  export function getExcCode(book: Bkper.Book): string {
    return book.getProperty(EXC_CODE_PROP, 'exchange_code');
  }


}
