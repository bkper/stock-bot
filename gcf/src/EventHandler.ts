import { Bkper, Book } from "bkper";
import { getStockBook } from "./BotService";

export abstract class EventHandler {

  protected abstract processObject(baseBook: Book, connectedBook: Book, event: bkper.Event): Promise<string>;

  protected async intercept(baseBook: Book, event: bkper.Event): Promise<string[] | string | boolean> {return false}

  async handleEvent(event: bkper.Event): Promise<string[] | string | boolean> {
    let bookId = event.bookId;
    let baseBook = await Bkper.getBook(bookId);

    let interceptionResponse = await this.intercept(baseBook, event);
    if (interceptionResponse) {
      return interceptionResponse;
    }
    let responses: string[] = [];
    let stockBook = getStockBook(baseBook);

    const logtag = `Handling ${event.type} event on book ${baseBook.getName()} from user ${event.user.username}`;

    if (stockBook) {
      
      console.time(logtag)

      let response = await this.processObject(baseBook, stockBook, event);
      if (response) {
        responses.push(response);
      }
    } else {
      return 'No book with 0 decimal places found in the collection'
    }

    console.timeEnd(logtag)

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

  protected buildBookAnchor(book: Book) {
    return `<a href='https://app.bkper.com/b/#transactions:bookId=${book.getId()}'>${book.getName()}</a>`;
  }

}