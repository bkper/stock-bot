abstract class EventHandler {

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


  protected buildBookAnchor(book: Bkper.Book) {
    return `<a href='https://app.bkper.com/b/#transactions:bookId=${book.getId()}'>${book.getName()}</a>`;
  }

}