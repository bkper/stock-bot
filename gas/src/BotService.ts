namespace BotService {

  export function auditBooks(bookId: string): void {
    let book = BkperApp.getBook(bookId);
    let connectedBooks = book.getCollection().getBooks();
    connectedBooks.forEach(b => {
      b.audit();
    });
  }

  export function getAccountQuery(stockAccount: StockAccount, full: boolean) {
      if (full || !stockAccount.getForwardedDate()) {
        return `account:'${stockAccount.getName()}'`;
      } else {
        return `account:'${stockAccount.getName()}' after:${stockAccount.getForwardedDate()}`
      }
  }


  export function calculateGainBaseNoFX(gainLocal: Bkper.Amount, purchaseRate: Bkper.Amount, saleRate: Bkper.Amount, shortSale: boolean): Bkper.Amount {
    if (!purchaseRate || !saleRate) {
      return BkperApp.newAmount(0);
    }
    if (shortSale) {
      return gainLocal.times(purchaseRate);
    } else {
      return gainLocal.times(saleRate)
    }
  }

  export function calculateGainBaseWithFX(purchaseAmount: Bkper.Amount, purchaseRate: Bkper.Amount, saleAmount: Bkper.Amount, saleRate: Bkper.Amount): Bkper.Amount {
    if (!purchaseRate || !saleRate) {
      return BkperApp.newAmount(0);
    }
    return saleAmount.times(saleRate).minus(purchaseAmount.times(purchaseRate))
  }

  export function getFwdExcRate(stockTransaction: Bkper.Transaction, fwdExcRateProp: string, fallbackExcRate: Bkper.Amount): Bkper.Amount {
    if (stockTransaction.getProperty(fwdExcRateProp)) {
        return BkperApp.newAmount(stockTransaction.getProperty(fwdExcRateProp))
    }
    return undefined;
  }
  export function getExcRate(baseBook: Bkper.Book, financialBook: Bkper.Book, stockTransaction: Bkper.Transaction, excRateProp: string): Bkper.Amount {
    if (baseBook.getProperty(EXC_CODE_PROP) == financialBook.getProperty(EXC_CODE_PROP)) {
      return undefined;
    }
    if (!stockTransaction.getRemoteIds()) {
      return undefined;
    }

    //Already set
    if (stockTransaction.getProperty(excRateProp)) {
      return BkperApp.newAmount(stockTransaction.getProperty(excRateProp))
    }

    for (const remoteId of stockTransaction.getRemoteIds()) {
      try {
        const financialTransaction = financialBook.getTransaction(remoteId);
        const baseIterator = baseBook.getTransactions(`remoteId:${financialTransaction.getId()}`);
        while (baseIterator.hasNext()) {
          const baseTransaction = baseIterator.next();
          if (baseTransaction.getProperty(EXC_RATE_PROP, 'exc_base_rate')) {
            return BkperApp.newAmount(baseTransaction.getProperty(EXC_RATE_PROP, 'exc_base_rate'));
          }
        }
      } catch (err) {
        Logger.log(err)
      }
    }

    return undefined;
  }

  export function getBaseBook(book: Bkper.Book): Bkper.Book {
    if (book.getCollection() == null) {
        //@ts-ignore
        console.log(`Collection of book ${book.getName()} id ${book.getId()}: ${book.wrapped}`)
      return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      if (connectedBook.getProperty(EXC_BASE_PROP)) {
        return connectedBook;
      }
    }
    for (const connectedBook of connectedBooks) {
      if (connectedBook.getProperty(EXC_CODE_PROP) == 'USD') {
        return connectedBook;
      }
    }
    console.log('No base book')
    return null;
  }


  export function getStockBook(book: Bkper.Book): Bkper.Book {
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

  export function getFinancialBook(book: Bkper.Book, excCode?: string): Bkper.Book {
    if (book.getCollection() == null) {
      return null;
    }
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      let excCodeConnectedBook = getExcCode(connectedBook);
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
        return BkperApp.getBook(connectedBook.getId());
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

  export function compareToFIFO(tx1: Bkper.Transaction, tx2: Bkper.Transaction): number {
    if (tx1.getDateValue() != tx2.getDateValue()) {
      return tx1.getDateValue() - tx2.getDateValue();
    }
    if (tx1.getProperty(ORDER_PROP) != null && tx2.getProperty(ORDER_PROP) != null) {
      let order1 = +tx1.getProperty(ORDER_PROP);
      let order2 = +tx2.getProperty(ORDER_PROP);
      console.log(`${order1} | ${order2}`)
      return order1 - order2;
    }
    if (tx1.getCreatedAt() && tx2.getCreatedAt()) {
      return tx1.getCreatedAt().getMilliseconds() - tx2.getCreatedAt().getMilliseconds();
    }
    return 0;
  }


}
