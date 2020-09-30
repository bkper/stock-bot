abstract class EventHandler {

  protected abstract processObject(baseBook: Bkper.Book, connectedBook: Bkper.Book, event: bkper.Event): string;

  handleEvent(event: bkper.Event): string[] | string | boolean {
    let bookId = event.bookId;
    let baseBook = BkperApp.getBook(bookId);

    let responses: string[] = [];
    let stockBook = BotService.getStockBook(baseBook);

    if (stockBook) {
      let response = this.processObject(baseBook, stockBook, event);
      if (response) {
        responses.push(response);
      }
    } else {
      return 'No book with 0 decimal places found in the collection'
    }

    if (responses.length == 0) {
      return false;
    }

    return responses;
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