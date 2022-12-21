import { Bkper } from "bkper";
import { Result } from ".";
import { InterceptorOrderProcessor } from "./InterceptorOrderProcessor";

export class EventHandlerTransactionPosted {

  async handleEvent(event: bkper.Event): Promise<Result> {
    let baseBook = await Bkper.getBook(event.bookId);
    const response = await new InterceptorOrderProcessor().intercept(baseBook, event)
    if (response) {
      return response;
    }
    return {result: false};
  }

}