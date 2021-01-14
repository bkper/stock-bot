import { Bkper } from "bkper";
import { InterceptorFlagRebuild } from "./InterceptorFlagRebuild";

export class EventHandlerTransactionUnchecked {

  async handleEvent(event: bkper.Event): Promise<string[] | string | boolean> {
    let baseBook = await Bkper.getBook(event.bookId);
    const response = await  new InterceptorFlagRebuild().intercept(baseBook, event);
    if (response) {
      return response;
    }
    return false;
  }

}