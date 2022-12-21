import { Bkper } from "bkper";
import { Result } from ".";
import { InterceptorFlagRebuild } from "./InterceptorFlagRebuild";

export class EventHandlerTransactionUnchecked {

  async handleEvent(event: bkper.Event): Promise<Result> {
    let baseBook = await Bkper.getBook(event.bookId);
    const response = await  new InterceptorFlagRebuild().intercept(baseBook, event);
    if (response) {
      return response;
    }
    return {result: false};
  }

}