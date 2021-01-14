import { Bkper } from "bkper";
import { InterceptorOrderProcessor } from "./InterceptorOrderProcessor";

export class EventHandlerTransactionPosted {

  async handleEvent(event: bkper.Event): Promise<string[] | string | boolean> {
    let baseBook = await Bkper.getBook(event.bookId);
    const response = await new InterceptorOrderProcessor().intercept(baseBook, event)
    if (response) {
      return response;
    }
    return false;
  }

}