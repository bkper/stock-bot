abstract class EventHandler {

  protected STOCK_EXC_CODE_PROP = 'stock_exc_code';

  protected abstract processObject(baseBook: Bkper.Book, connectedBook: Bkper.Book, event: bkper.Event): string;

  handleEvent(event: bkper.Event): string[] | string {
    let bookId = event.bookId;
    let baseBook = BkperApp.getBook(bookId);

    let responses: string[] = [];
    let connectedBooks = baseBook.getCollection().getBooks();
    let foundStockBook = false;
    connectedBooks.forEach(connectedBook => {
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits != null && fractionDigits == 0) {
        foundStockBook = true;
        let response = this.processObject(baseBook, connectedBook, event);
        if (response) {
          responses.push(response);
        }
      }

    })

    if (!foundStockBook) {
      return 'No book with 0 decimal places found in the collection'
    }

    return responses;
  }

  protected getExcCode(book: Bkper.Book): string {
    return book.getProperty('exc_code', 'exchange_code');
  }

  protected getStockExchangeCode(baseAccount: Bkper.Account): string {
    let groups = baseAccount.getGroups();
    if (groups != null) {
      for (const group of groups) {
        let stockExchange = group.getProperty(this.STOCK_EXC_CODE_PROP);
        if (stockExchange != null && stockExchange.trim() != '') {
          return stockExchange;
        }
      }
    }
    return null;
  }

  protected getConnectedStockAccountName(baseAccount: Bkper.Account) {
    let stockExchangeCode = this.getStockExchangeCode(baseAccount);
    if (stockExchangeCode != null) {
      return baseAccount.getName();
    }
    return null;
  }

  protected matchStockExchange(stockExcCode: string, excCode: string): boolean {
    if (stockExcCode == null || stockExcCode.trim() == '') {
      return false;
    }
    stockExcCode = stockExcCode.trim();
    if (excCode != null && stockExcCode != excCode) {
      return false;
    }
    return true;
  }  

  protected buildBookAnchor(book: Bkper.Book) {
    return `<a href='https://app.bkper.com/b/#transactions:bookId=${book.getId()}'>${book.getName()}</a>`;
  }

}